var RTCPeerConnection = null;
var getUserMedia = null;
var attachMediaStream = null;
var attachMediaStream = null;
var reattachMediaStream = null;
//var streamInfo = { applicationName: WOWZA_APPLICATION_NAME, streamName: WOWZA_STREAM_NAME, sessionId: WOWZA_SESSION_ID_EMPTY };


var isEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveOrOpenBlob || !!navigator.msSaveBlob);
var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
var isChrome = !!window.chrome && !isOpera;
var isIE = typeof document !== 'undefined' && !!document.documentMode && !isEdge;

var nVer = navigator.appVersion;
var nAgt = navigator.udserAgent;
var browserName = navigator.appName;
var fullVersion = '' + parseFloat(navigator.appVersion);
var majorVersion = parseInt(navigator.appVersion, 10);
var nameOffset, verOffset, ix;

// In Opera, the true version is after 'Opera' or after 'Version'
if (isOpera) {
    browserName = 'Opera';
    try {
        fullVersion = navigator.userAgent.split('OPR/')[1].split(' ')[0];
        majorVersion = fullVersion.split('.')[0];
    } catch (e) {
        fullVersion = '0.0.0.0';
        majorVersion = 0;
    }
}
// In MSIE version <=10, the true version is after 'MSIE' in userAgent
// In IE 11, look for the string after 'rv:'
else if (isIE) {
    verOffset = nAgt.indexOf('rv:');
    if (verOffset > 0) { //IE 11
        fullVersion = nAgt.substring(verOffset + 3);
    } else { //IE 10 or earlier
        verOffset = nAgt.indexOf('MSIE');
        fullVersion = nAgt.substring(verOffset + 5);
    }
    browserName = 'IE';
}
// In Chrome, the true version is after 'Chrome' 
else if (isChrome) {
    if (nAgt) {
        verOffset = nAgt.indexOf('Chrome');
        fullVersion = nAgt.substring(verOffset + 7);
    } else {
        verOffset = navigator.userAgent.indexOf('Chrome');
        fullVersion = navigator.userAgent.substring(verOffset + 7);
    }

    browserName = 'Chrome';
}
// In Safari, the true version is after 'Safari' or after 'Version' 
else if (isSafari) {
    verOffset = nAgt.indexOf('Safari');

    browserName = 'Safari';
    fullVersion = nAgt.substring(verOffset + 7);

    if ((verOffset = nAgt.indexOf('Version')) !== -1) {
        fullVersion = nAgt.substring(verOffset + 8);
    }

    if (navigator.userAgent.indexOf('Version/') !== -1) {
        fullVersion = navigator.userAgent.split('Version/')[1].split(' ')[0];
    }
}
// In Firefox, the true version is after 'Firefox' 
else if (isFirefox) {
    if (nAgt) {
        verOffset = nAgt.indexOf('Firefox');
        fullVersion = nAgt.substring(verOffset + 7);
    } else {
        verOffset = navigator.userAgent.indexOf('Firefox');
        fullVersion = navigator.userAgent.substring(verOffset + 8);
    }

    browserName = 'Firefox';
}

// In most other browsers, 'name/version' is at the end of userAgent 
else if ((nameOffset = nAgt.lastIndexOf(' ') + 1) < (verOffset = nAgt.lastIndexOf('/'))) {
    browserName = nAgt.substring(nameOffset, verOffset);
    fullVersion = nAgt.substring(verOffset + 1);

    if (browserName.toLowerCase() === browserName.toUpperCase()) {
        browserName = navigator.appName;
    }
}

if (isEdge) {
    browserName = 'Edge';
    fullVersion = navigator.userAgent.split('Edge/')[1];
    // fullVersion = parseInt(navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)[2], 10).toString();
}

// trim the fullVersion string at semicolon/space/bracket if present
if ((ix = fullVersion.search(/[; \)]/)) !== -1) {
    fullVersion = fullVersion.substring(0, ix);
}

majorVersion = parseInt('' + fullVersion, 10);

if (isNaN(majorVersion)) {
    fullVersion = '' + parseFloat(navigator.appVersion);
    majorVersion = parseInt(navigator.appVersion, 10);
}

var detectedBrowserInfo = { fullVersion: fullVersion, version: majorVersion, name: browserName, isPrivateBrowsing: false };
console.log(detectedBrowserInfo.name);// Display browser info

var MediaDevices = [];
var audioInputDevices = [];
var audioOutputDevices = [];

if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.enumerateDevices = function (callback) {
        var enumerateDevices = navigator.mediaDevices.enumerateDevices();
        if (enumerateDevices && enumerateDevices.then) {
            navigator.mediaDevices.enumerateDevices().then(callback).catch(function () {
                callback([]);
            });
        } else {
            callback([]);
        }
    };
}

var hasMicrophone = false;
var hasSpeakers = false;

var isWebsiteHasMicrophonePermissions = false;

if (!navigator.enumerateDevices && window.MediaStreamTrack && window.MediaStreamTrack.getSources) {
    navigator.enumerateDevices = window.MediaStreamTrack.getSources.bind(window.MediaStreamTrack);
}

if (!navigator.enumerateDevices && navigator.enumerateDevices) {
    navigator.enumerateDevices = navigator.enumerateDevices.bind(navigator);
}

if (!navigator.enumerateDevices) {
    console.log(navigator.enumerateDevices);
}

MediaDevices = [];

audioInputDevices = [];
audioOutputDevices = [];

hasMicrophone = false;
hasSpeakers = false;

isWebsiteHasMicrophonePermissions = false;

// to prevent duplication
var alreadyUsedDevices = {};

navigator.enumerateDevices(function (devices) {
    devices.forEach(function (_device) {
        var device = {};
        for (var d in _device) {
            try {
                if (typeof _device[d] !== 'function') {
                    device[d] = _device[d];
                }
            } catch (e) { }
        }

        if (alreadyUsedDevices[device.deviceId + device.label + device.kind]) {
            return;
        }

        // if it is MediaStreamTrack.getSources
        if (device.kind === 'audio') {
            device.kind = 'audioinput';
        }

        if (!device.deviceId) {
            device.deviceId = device.id;
        }

        if (!device.id) {
            device.id = device.deviceId;
        }

        if (!device.label) {
            device.isCustomLabel = true;

            if (device.kind === 'audioinput') {
                device.label = 'Microphone ' + (audioInputDevices.length + 1);
            } else if (device.kind === 'audiooutput') {
                device.label = 'Speaker ' + (audioOutputDevices.length + 1);
            } else {
                device.label = 'Please invoke getUserMedia once.';
            }

            if (typeof DetectRTC !== 'undefined' && DetectRTC.browser.isChrome && DetectRTC.browser.version >= 46 && !/^(https:|chrome-extension:)$/g.test(location.protocol || '')) {
                if (typeof document !== 'undefined' && typeof document.domain === 'string' && document.domain.search && document.domain.search(/localhost|127.0./g) === -1) {
                    device.label = 'HTTPs is required to get label of this ' + device.kind + ' device.';
                }
            }
        } else {
            if (device.kind === 'audioinput' && !isWebsiteHasMicrophonePermissions) {
                isWebsiteHasMicrophonePermissions = true;
            }
        }

        if (device.kind === 'audioinput') {
            hasMicrophone = true;

            if (audioInputDevices.indexOf(device) === -1) {
                audioInputDevices.push(device);
            }
        }

        if (device.kind === 'audiooutput') {
            hasSpeakers = true;

            if (audioOutputDevices.indexOf(device) === -1) {
                audioOutputDevices.push(device);
            }
        }

        MediaDevices.push(device);

        alreadyUsedDevices[device.deviceId + device.label + device.kind] = device;
    });

    //console.log("hasMicrophone: ", hasMicrophone);
    //console.log("hasSpeakers: ", hasSpeakers);
    //console.log("MediaDevices: ", MediaDevices);
    //console.log("audioInputDevices: ", audioInputDevices);
    //console.log("audioOutputDevices: ", audioOutputDevices);
    console.log("isWebsiteHasMicrophonePermissions: ", isWebsiteHasMicrophonePermissions);
});

// --------- Detect if system supports WebRTC 1.0 or WebRTC 1.1.
var isWebRTCSupported = false;
['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'RTCIceGatherer'].forEach(function (item) {
    if (isWebRTCSupported) {
        return;
    }

    if (item in window) {
        isWebRTCSupported = true;
    }
});

console.log("isWebRTCSupported: ", isWebRTCSupported);


var isWebSocketsSupported = 'WebSocket' in window && 2 === window.WebSocket.CLOSING;
var isWebSocketsBlocked = false;

try {
    var starttime;
    var websocket = new WebSocket('wss://echo.websocket.org:443/');
    websocket.onopen = function () {
        isWebSocketsBlocked = false;
        starttime = (new Date).getTime();
        websocket.send('ping');
    };
    websocket.onmessage = function () {
        WebsocketLatency = (new Date).getTime() - starttime + 'ms';
        websocket.close();
        websocket = null;
    };
    websocket.onerror = function () {
        isWebSocketsBlocked = true;
    };
} catch (e) {
    isWebSocketsBlocked = true;
}

console.log("isWebSocketsSupported: ", isWebSocketsSupported);
console.log("isWebSocketsBlocked: ", isWebSocketsBlocked);

// --------- Detect if WebAudio API are supported
var webAudio = {
    isSupported: false,
    isCreateMediaStreamSourceSupported: false
};

['AudioContext', 'webkitAudioContext', 'mozAudioContext', 'msAudioContext'].forEach(function (item) {
    if (webAudio.isSupported) {
        return;
    }

    if (item in window) {
        webAudio.isSupported = true;

        if (window[item] && 'createMediaStreamSource' in window[item].prototype) {
            webAudio.isCreateMediaStreamSourceSupported = true;
        }
    }
});
console.log("webAudio is Supported: ", webAudio.isSupported);
console.log("Create Media Stream Source Supported: ", webAudio.isCreateMediaStreamSourceSupported);

userMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.mediaDevices.getUserMedia;
getUserMedia = userMedia.bind(navigator);

attachMediaStream = function (element, stream) {
    if (isFirefox)
        element.mozSrcObject = stream;
    else
        element.src = URL.createObjectURL(stream);

    element.play();
};