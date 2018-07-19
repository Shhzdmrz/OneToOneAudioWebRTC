﻿var options = { transport: signalR.HttpTransportType.WebSockets, logger: signalR.LogLevel.None };
var wsconn = new signalR.HubConnectionBuilder().withUrl("/Hubs/WebRTCHub", options).build();
var isEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveOrOpenBlob || !!navigator.msSaveBlob);
var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
var isChrome = !!window.chrome && !isOpera;
var isIE = typeof document !== 'undefined' && !!document.documentMode && !isEdge;

var peerConnectionConfig = ICE_SERVERS;
var webrtcConstraints = WEBRTC_CONSTRAINTS;
var streamInfo = { applicationName: WOWZA_APPLICATION_NAME, streamName: WOWZA_STREAM_NAME, sessionId: WOWZA_SESSION_ID_EMPTY };

var WOWZA_STREAM_NAME = null, connections = {}, localStream = null;

attachMediaStream = (e) => {
    //console.log(e);
    console.log("OnPage: called attachMediaStream");
    var partnerAudio = document.querySelector('.audio.partner');
    if (partnerAudio.srcObject !== e.stream) {
        partnerAudio.srcObject = e.stream;
        console.log("OnPage: Attached remote stream");
    }
};

const receivedCandidateSignal = (connection, partnerClientId, candidate) => {
    console.log('WebRTC: adding candidate');
    console.debug(candidate);
    connection.addIceCandidate(new RTCIceCandidate(candidate), () => console.log("WebRTC: added candidate successfully"), errorHandler);
}

// Process a newly received SDP signal
const receivedSdpSignal = (connection, partnerClientId, sdp) => {
    console.log('WebRTC: called receivedSdpSignal');
    console.log('WebRTC: processing sdp signal');
    connection.setRemoteDescription(new RTCSessionDescription(sdp), () => {
        console.log('WebRTC: set Remote Description');
        if (connection.remoteDescription.type == "offer") {
            console.log('WebRTC: remote Description type offer');
            connection.addStream(localStream);
            console.log('WebRTC: added stream');
            connection.createAnswer().then((desc) => {
                console.log('WebRTC: create Answer...');
                connection.setLocalDescription(desc, () => {
                    console.log('WebRTC: set Local Description...');
                    sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
                }, errorHandler);
            }, errorHandler);
        } else if (connection.remoteDescription.type == "answer") {
            //localStream.getTracks().forEach(track => connection.addTrack(track, localStream));
            console.log('WebRTC: remote Description type answer');
        }
    }, errorHandler);
}

// Hand off a new signal from the signaler to the connection
const newSignal = (partnerClientId, data) => {
    console.log('WebRTC: called newSignal');
    //console.log('connections: ', connections);

    var signal = JSON.parse(data);
    var connection = getConnection(partnerClientId);
    console.log("signal: ", signal);
    //console.log("signal: ", signal.sdp || signal.candidate);
    //console.log("partnerClientId: ", partnerClientId);
    //console.log("connection: ", connection);

    // Route signal based on type
    if (signal.sdp) {
        console.log('WebRTC: sdp signal');
        receivedSdpSignal(connection, partnerClientId, signal.sdp);
    } else if (signal.candidate) {
        console.log('WebRTC: candidate signal');
        receivedCandidateSignal(connection, partnerClientId, signal.candidate);
    }
}

const onReadyForStream = (connection) => {
    console.log("WebRTC: called onReadyForStream");
    // The connection manager needs our stream
    //console.log("onReadyForStream connection: ", connection);
    connection.addStream(localStream);
    console.log("WebRTC: added stream");
}

const onStreamRemoved = (connection, streamId) => {
    console.log("WebRTC: onStreamRemoved -> Removing stream: ");
    //console.log("Stream: ", streamId);
    //console.log("connection: ", connection);
}
// Close the connection between myself and the given partner
const closeConnection = (partnerClientId) => {
    console.log("WebRTC: called closeConnection ");
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
const closeAllConnections = () => {
    console.log("WebRTC: call closeAllConnections ");
    for (var connectionId in connections) {
        closeConnection(connectionId);
    }
}

const getConnection = (partnerClientId) => {
    console.log("WebRTC: called getConnection");
    if (connections[partnerClientId]) {
        console.log("WebRTC: connections partner client exist");
        return connections[partnerClientId];
    }  
    else {
        console.log("WebRTC: initialize new connection");
        return initializeConnection(partnerClientId)
    }
}

const initiateOffer = (partnerClientId, stream) => {
    console.log('WebRTC: called initiateoffer: ');
    var connection = getConnection(partnerClientId); // // get a connection for the given partner
    //console.log('initiate Offer stream: ', stream);
    //console.log("offer connection: ", connection);
    connection.addStream(stream);// add our audio/video stream

    console.log("WebRTC: Added local stream");
    connection.createOffer((desc) => { // send an offer for a connection
        console.log('WebRTC: created Offer: ');
        connection.setLocalDescription(desc, () => {
            console.log('WebRTC: set Local Description: ');
            //console.log('connection.localDescription: ', connection.localDescription);
            sendHubSignal(JSON.stringify({ "sdp": connection.localDescription }), partnerClientId);
        });
    }, errorHandler);
}

const callbackUserMediaSuccess = (stream) => {
    console.log("WebRTC: got media stream");
    localStream = stream;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        console.log(`Using Audio device: ${audioTracks[0].label}`);
    }
}

const initializeUserMedia = () => {
    console.log('WebRTC: called initializeUserMedia: ');
    navigator.getUserMedia(webrtcConstraints, callbackUserMediaSuccess, errorHandler);
}
// stream removed
const callbackRemoveStream = (connection, evt) => {
    console.log('WebRTC: removing remote stream from partner window');
    // Clear out the partner window
    var otherAudio = document.querySelector('.audio.partner');
    otherAudio.src = '';
}

const callbackAddStream = (connection, evt) => {
    console.log('WebRTC: called callbackAddStream');

    // Bind the remote stream to the partner window
    //var otherVideo = document.querySelector('.video.partner');
    //attachMediaStream(otherVideo, evt.stream); // from adapter.js
    attachMediaStream(evt);
}

const callbackNegotiationNeeded = (connection, evt) => {
    console.log("WebRTC: Negotiation needed...");
    //console.log("Event: ", evt);
}

const callbackIceCandidate = (evt, connection, partnerClientId) => {
    console.log("WebRTC: Ice Candidate callback");
    if (evt.candidate) {// Found a new candidate
        console.log('WebRTC: new ICE candidate');
        //console.log("evt.candidate: ", evt.candidate);
        sendHubSignal(JSON.stringify({ "candidate": evt.candidate }), partnerClientId);
    } else {
        // Null candidate means we are done collecting candidates.
        console.log('WebRTC: ICE candidate gathering complete');
    }
}

const initializeConnection = (partnerClientId) => {
    console.log('WebRTC: Initializing connection...');
    //console.log("Received Param for connection: ", partnerClientId);

    var connection = new RTCPeerConnection(peerConnectionConfig);

    connection.onicecandidate = evt => callbackIceCandidate(evt, connection, partnerClientId); // ICE Candidate Callback
    connection.onnegotiationneeded = evt => callbackNegotiationNeeded(connection, evt); // Negotiation Needed Callback
    connection.onaddstream = evt => callbackAddStream(connection, evt); // Add stream handler callback
    connection.onremovestream = evt => callbackRemoveStream(connection, evt); // Remove stream handler callback
    //connection.ontrack = evt => callbackAddStream(connection, evt);

    connections[partnerClientId] = connection; // Store away the connection based on username

    return connection;
}

const initializeSignalR = () => {
    wsconn.start().then(() => { console.log("SignalR: Connected"); askUsername(); }).catch(err => { console.log(err); errorHandler(err); });
}

const errorHandler = (error) => {
    console.error(error);
    if (error.message)
        alertify.alert('<h4>Error Occurred</h4></br>Error Info: ' + JSON.stringify(error.message));
    else
        alertify.alert('<h4>Error Occurred</h4></br>Error Info: ' + JSON.stringify(error));
}
// Add click handler to users in the "Users" pane
$('.user').live('click', function () {
    console.log('calling user... ');
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
        wsconn.invoke('callUser', { "connectionId": targetConnectionId });

        // UI in calling mode
        $('body').attr('data-mode', 'calling');
        $("#callstatus").text('Calling...');
    } else {
        alertify.error("Ah, nope.  Can't call yourself.");
    }
});

// Add handler for the hangup button
$('.hangup').click(function () {
    console.log('hangup....');
    // Only allow hangup if we are not idle
    //localStream.getTracks().forEach(track => track.stop());
    if ($('body').attr("data-mode") !== "idle") {
        wsconn.invoke('hangUp');
        closeAllConnections();
        $('body').attr('data-mode', 'idle');
        $("#callstatus").text('Idle');
    }
});

sendHubSignal = (candidate, partnerClientId) => {
    console.log('SignalR: called sendhubsignal ');
    wsconn.invoke('sendSignal', candidate, partnerClientId).catch(errorHandler);
}

setUsername = (username) => {
    //console.log('WebRTC: set username ');
    wsconn.invoke("Join", username).catch((err) => {
        console.log(err);
        alertify.alert('<h4>Failed SignalR Connection</h4> We were not able to connect you to the signaling server.<br/><br/>Error: ' + JSON.stringify(err));
        //viewModel.Loading(false);
    });
    WOWZA_STREAM_NAME = username;
    $("#upperUsername").text(username);
    $('div.username').text(username);
    initializeUserMedia();
}

askUsername = () => {
    //console.log('WebRTC: ask username ');
    alertify.prompt("What is your name?", function (e, username) {
        if (e == false || username == '') {
            username = 'User ' + Math.floor((Math.random() * 10000) + 1);
            alertify.success('You really need a username, so we will call you... ' + username);
        }

        setUsername(username);
    }, '');
}

wsconn.onclose(e => {
    if (e) {
        console.log("SignalR: closed with error.");
        console.log(e);
    }
    else {
        console.log("Disconnected");
    }
});

// Hub Callback: Update User List
wsconn.on('updateUserList', (userList) => {
    //console.log('SignalR: called');
    //console.log("UserList: ", userList);
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
wsconn.on('callAccepted', (acceptingUser) => {
    console.log('SignalR: call accepted from: ' + JSON.stringify(acceptingUser) + '.  Initiating WebRTC call and offering my stream up...');

    // Callee accepted our call, let's send them an offer with our video stream
    initiateOffer(acceptingUser.connectionId, localStream); // Will use driver email in production
    // Set UI into call mode
    $('body').attr('data-mode', 'incall');
    $("#callstatus").text('In Call');
});

// Hub Callback: Call Declined
wsconn.on('callDeclined', (decliningUser, reason) => {
    console.log('SignalR: call declined from: ' + decliningUser.connectionId);

    // Let the user know that the callee declined to talk
    alertify.error(reason);

    // Back to an idle UI
    $('body').attr('data-mode', 'idle');
});

// Hub Callback: Incoming Call
wsconn.on('incomingCall', (callingUser) => {
    console.log('SignalR: incoming call from: ' + JSON.stringify(callingUser));

    // Ask if we want to talk
    alertify.confirm(callingUser.username + ' is calling.  Do you want to chat?', function (e) {
        if (e) {
            // I want to chat
            wsconn.invoke('AnswerCall', true, callingUser).catch(err => console.log(err));

            // So lets go into call mode on the UI
            $('body').attr('data-mode', 'incall');
            $("#callstatus").text('In Call');
        } else {
            // Go away, I don't want to chat with you
            wsconn.invoke('AnswerCall', false, callingUser).catch(err => console.log(err));
        }
    });
});

// Hub Callback: WebRTC Signal Received
wsconn.on('receiveSignal', (signalingUser, signal) => {
    //console.log('WebRTC: receive signal ');
    //console.log(signalingUser);
    //console.log(signal);
    newSignal(signalingUser.connectionId, signal);
});

// Hub Callback: Call Ended
wsconn.on('callEnded', (signalingUser, signal) => {
    //console.log(signalingUser);
    //console.log(signal);

    console.log('SignalR: call with ' + signalingUser.connectionId + ' has ended: ' + signal);

    // Let the user know why the server says the call is over
    alertify.error(signal);

    // Close the WebRTC connection
    closeConnection(signalingUser.connectionId);

    // Set the UI back into idle mode
    $('body').attr('data-mode', 'idle');
    $("#callstatus").text('Idle');
});

initializeSignalR();