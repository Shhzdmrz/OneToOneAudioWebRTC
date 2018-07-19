var conn = new signalR.HubConnectionBuilder()
    .withUrl("/Hubs/WebRTCHub", { transport: signalR.HttpTransportType.WebSockets, logger: signalR.LogLevel.Trace })
    .build();
var connections = {}, _mediaStream, myConnectionId;
var iceServers = [{ url: 'stun:numb.viagenie.ca' }]; // - Firefox does not support DNS names.

// Process a newly received Candidate signal
function receivedCandidateSignal(connection, partnerClientId, candidate) {
    console.log('WebRTC: processing candidate signal');
    connection.addIceCandidate(new RTCIceCandidate(candidate));
}

// Process a newly received SDP signal
function receivedSdpSignal(connection, partnerClientId, sdp) {
    console.log('receivedSdpSignal');
    console.log(partnerClientId);
    console.log('WebRTC: processing sdp signal');
    connection.setRemoteDescription(new RTCSessionDescription(sdp), function () {
        if (connection.remoteDescription.type == "offer") {
            console.log('WebRTC: received offer, sending response...');
            onReadyForStream(connection);
            connection.createAnswer(function (desc) {
                connection.setLocalDescription(desc, function () {
                    sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
                });
            },
                function (error) { console.log('Error creating session description: ' + error); });
        } else if (connection.remoteDescription.type == "answer") {
            console.log('WebRTC: received answer');
        }
    });
}

// Hand off a new signal from the signaler to the connection
function newSignal(partnerClientId, data) {
    console.log('connections');
    console.log(connections);

    var signal = JSON.parse(data),
        connection = getConnection(partnerClientId);

    console.log('WebRTC: received signal');

    // Route signal based on type
    if (signal.sdp) {
        receivedSdpSignal(connection, partnerClientId, signal.sdp);
    } else if (signal.candidate) {
        receivedCandidateSignal(connection, partnerClientId, signal.candidate);
    }
}

// Close the connection between myself and the given partner
function closeConnection(partnerClientId) {
    var connection = connections[partnerClientId];

    if (connection) {
        // Let the user know which streams are leaving
        // todo: foreach connection.remoteStreams -> onStreamRemoved(stream.id)
        onStreamRemoved(null, null);

        // Close the connection
        connection.close();
        delete connections[partnerClientId]; // Remove the property
    }
}

// Close all of our connections
function closeAllConnections() {
    for (var connectionId in connections) {
        closeConnection(connectionId);
    }
}

// Add click handler to users in the "Users" pane
$('.user').live('click', function () {
    // Find the target user's SignalR client id
    var targetConnectionId = $(this).attr('data-cid');

    // Make sure we are in a state where we can make a call
    if ($('body').attr("data-mode") !== "idle") {
        alertify.error('Sorry, you are already in a call.  Conferencing is not yet implemented.');
        return;
    }

    // Then make sure we aren't calling ourselves.
    if (targetConnectionId != myConnectionId) {
        // Initiate a call
        conn.invoke('callUser', { "connectionId": targetConnectionId });

        // UI in calling mode
        $('body').attr('data-mode', 'calling');
        $("#callstatus").text('Calling...');
    } else {
        alertify.error("Ah, nope.  Can't call yourself.");
    }
});

// Add handler for the hangup button
$('.hangup').click(function () {
    // Only allow hangup if we are not idle
    if ($('body').attr("data-mode") !== "idle") {
        conn.invoke('hangUp');
        closeAllConnections();
        $('body').attr('data-mode', 'idle');
        $("#callstatus").text('Idle');
    }
});

function startSession(username) {
    //viewModel.Username(username); // Set the selected username in the UI
    //viewModel.Loading(true); // Turn on the loading indicator

    // Ask the user for permissions to access the webcam and mic
    getUserMedia({
            // Permissions to request
            video: false,
            audio: true
        },
        function (stream) { // succcess callback gives us a media stream
            $('.instructions').hide();

            // Now we have everything we need for interaction, so fire up SignalR
            // Initialize our client signal manager, giving it a signaler (the SignalR hub) and some callbacks
            //console.log('initializing connection manager');
            //connectionManager.initialize(hub.server, _callbacks.onReadyForStream, _callbacks.onStreamAdded, _callbacks.onStreamRemoved);

            // Store off the stream reference so we can share it later
            _mediaStream = stream;

            // Load the stream into a video element so it starts playing in the UI
            console.log('playing my local video feed');
            var videoElement = document.querySelector('.video.mine');
            attachMediaStream(videoElement, _mediaStream);

            //viewModel.Loading(false);

            setUsername(username);
        },
        function (error) { // error callback
            alertify.alert('<h4>Failed to get hardware access!</h4> Do you have another browser type open and using your cam/mic?<br/><br/>You were not connected to the server, because I didn\'t code to make browsers without media access work well. <br/><br/>Actual Error: ' + JSON.stringify(error));
            //viewModel.Loading(false);
        }
    );
}

function getUsername() {
    console.log("ask username");
    alertify.prompt("What is your name?", function (e, username) {
        if (e == false || username == '') {
            username = 'User ' + Math.floor((Math.random() * 10000) + 1);
            alertify.success('You really need a username, so we will call you... ' + username);
        }

        // proceed to next step, get media access and start up our connection
        startSession(username);
    }, '');
}

function start(hub) {
    // Show warning if WebRTC support is not detected
    if (webrtcDetectedBrowser == null) {
        console.log('Your browser doesnt appear to support WebRTC.');
        $('.browser-warning').show();
    } else {
        // Then proceed to the next step, gathering username
        console.log("Your browser support WebRTC.");
        getUsername();
    }
}

conn.start().then(() => {
    console.log("Connected");
    //console.log(conn);
    start();
}).catch(err => {
    console.log(err);
    alertify.alert('<h4>Failed SignalR Connection</h4> We were not able to connect you to the signaling server.<br/><br/>Error: ' + JSON.stringify(err));
});

conn.onclose(e => {
    if (e) {
        console.log(e);
    }
    else {
        console.log("Disconnected");
    }
});

function setUsername(username) {
    console.log('set Username');
    conn.invoke("Join", username).catch((err) => {
            console.log(err);
            alertify.alert('<h4>Failed SignalR Connection</h4> We were not able to connect you to the signaling server.<br/><br/>Error: ' + JSON.stringify(err));
            //viewModel.Loading(false);
    });
    $("#upperUsername").text(username);
    $('div.username').text(username);
}

function sendHubSignal(candidate, partnerClientId) {
    conn.invoke('sendSignal', candidate, partnerClientId);
}

// Hub Callback: Update User List
conn.on('updateUserList', (userList) => {
    console.log(userList);
    $("#usersLength").text(userList.length);
    
    $('#usersdata li.user').remove();

    $.each(userList, function (index) {
        var userIcon = '', status = '';
        if (userList[index].username === $("#upperUsername").text()) {
            myConnectionId = userList[index].connectionId;
            userIcon = 'icon-user';
            status = 'Me';
        }

        if (!userIcon) {
            userIcon = userList[index].inCall ? 'icon-phone-3' : 'icon-phone-4';
        }
        status = userList[index].inCall ? 'In Call' : 'Available';

        var listString = '<li class="user" data-cid=' + userList[index].connectionId + ' data-username=' + userList[index].username + '>';
        listString += '<a href="#"><div class="username"> ' + userList[index].username + '</div>';
        listString += '<div class="helper ' + userIcon + '" data-callstatus=' + userList[index].inCall + '></div></a></li>';
        $('#usersdata').append(listString);
    });
});

// Hub Callback: Call Accepted
conn.on('callAccepted', (acceptingUser) => {
    console.log('call accepted from: ' + JSON.stringify(acceptingUser) + '.  Initiating WebRTC call and offering my stream up...');

    // Callee accepted our call, let's send them an offer with our video stream
    initiateOffer(acceptingUser.connectionId, _mediaStream);

    // Set UI into call mode
    $('body').attr('data-mode', 'incall');
    $("#callstatus").text('In Call');
});

// Hub Callback: Call Declined
conn.on('callDeclined', (decliningUser, reason) => {
    console.log('call declined from: ' + decliningUser.connectionId);

    // Let the user know that the callee declined to talk
    alertify.error(reason);

    // Back to an idle UI
    $('body').attr('data-mode', 'idle');
});

// Hub Callback: Incoming Call
conn.on('incomingCall', (callingUser) => {
    console.log('incoming call from: ' + JSON.stringify(callingUser));

    // Ask if we want to talk
    alertify.confirm(callingUser.username + ' is calling.  Do you want to chat?', function (e) {
        if (e) {
            // I want to chat
            conn.invoke('AnswerCall', true, callingUser).catch(err => console.log(err));

            // So lets go into call mode on the UI
            $('body').attr('data-mode', 'incall');
            $("#callstatus").text('In Call');
        } else {
            // Go away, I don't want to chat with you
            conn.invoke('AnswerCall', false, callingUser).catch(err => console.log(err));
        }
    });
});

// Hub Callback: WebRTC Signal Received
conn.on('receiveSignal', (signalingUser, signal) => {
    //console.log(signalingUser);
    //console.log(signal);
    newSignal(signalingUser.connectionId, signal);
});

// Hub Callback: Call Ended
conn.on('callEnded', (signalingUser, signal) => {
    //console.log(signalingUser);
    //console.log(signal);

    console.log('call with ' + signalingUser.connectionId + ' has ended: ' + signal);

    // Let the user know why the server says the call is over
    alertify.error(signal);

    // Close the WebRTC connection
    closeConnection(signalingUser.connectionId);

    // Set the UI back into idle mode
    $('body').attr('data-mode', 'idle');
    $("#callstatus").text('Idle');
});

function onReadyForStream(connection) {
    // The connection manager needs our stream
    // todo: not sure I like this
    connection.addStream(_mediaStream);
}
function onStreamAdded(connection, event) {
    console.log('binding remote stream to the partner window');

    // Bind the remote stream to the partner window
    var otherVideo = document.querySelector('.video.partner');
    attachMediaStream(otherVideo, event.stream); // from adapter.js
}
function onStreamRemoved(connection, streamId) {
    // todo: proper stream removal.  right now we are only set up for one-on-one which is why this works.
    console.log('removing remote stream from partner window');

    // Clear out the partner window
    var otherVideo = document.querySelector('.video.partner');
    otherVideo.src = '';
}

// Create a new WebRTC Peer Connection with the given partner
function createConnection(partnerClientId) {
    console.log('WebRTC: creating connection...');
    console.log('partnerClientId: ' + partnerClientId);
    // Create a new PeerConnection
    var connection = new RTCPeerConnection({ iceServers });

    // ICE Candidate Callback
    connection.onicecandidate = function (event) {
        if (event.candidate) {
            // Found a new candidate
            console.log('WebRTC: new ICE candidate');
            sendHubSignal((JSON.stringify({ "candidate": event.candidate }), partnerClientId));
        } else {
            // Null candidate means we are done collecting candidates.
            console.log('WebRTC: ICE candidate gathering complete');
        }
    };

    // State changing
    connection.onstatechange = function () {
        // Not doing anything here, but interesting to see the state transitions
        var states = {
            'iceConnectionState': connection.iceConnectionState,
            'iceGatheringState': connection.iceGatheringState,
            'readyState': connection.readyState,
            'signalingState': connection.signalingState
        };

        console.log(JSON.stringify(states));
    };

    // Stream handlers
    connection.onaddstream = function (event) {
        console.log('WebRTC: adding stream');
        // A stream was added, so surface it up to our UI via callback
        onStreamAdded(connection, event);
    };

    connection.onremovestream = function (event) {
        console.log('WebRTC: removing stream');
        // A stream was removed
        onStreamRemoved(connection, event.stream.id);
    };

    // Store away the connection
    connections[partnerClientId] = connection;

    // And return it
    return connection;
}

function getConnection(partnerClientId) {
    console.log('getConnection: ' + partnerClientId);
    return connections[partnerClientId] || createConnection(partnerClientId);
};

function initiateOffer(partnerClientId, stream) {
    console.log('initiateOffer');
    console.log(partnerClientId);
    // Get a connection for the given partner
    var connection = getConnection(partnerClientId);
    console.log('connection: ');
    console.log(connection);
    // Add our audio/video stream
    connection.addStream(stream);

    console.log('stream added on my end');

    // Send an offer for a connection
    connection.createOffer(function (desc) {
        connection.setLocalDescription(desc, function () {
            sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
        });
    }, function (error) { console.log('Error creating session description: ' + error); });
}