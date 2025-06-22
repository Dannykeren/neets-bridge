const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Configuration
const NEETS_IP = process.env.NEETS_IP || '192.168.254.252';
const NEETS_PORT = process.env.NEETS_PORT || 5000;
const SERVER_PORT = process.env.SERVER_PORT || 3000;

// Fixed timing (as requested)
const HOLD_TIME = 1000; // 1 second
const REPEAT_RATE = 500; // 0.5 seconds

// Complete state tracking (matching your Crestron module)
let deviceState = {
    connected: false,
    power: 0,
    volume: -40,
    source: 1,
    mute: 0,
    mixMode: 0,
    mixVolume: -40,
    mixMute: 0,
    inputGain: [0, 0, 0, 0, 0], // index 0 unused, 1-4 for inputs
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0
};

// Press & hold state tracking
let holdStates = {
    volumeUp: { holding: false, timer: null, repeatTimer: null },
    volumeDown: { holding: false, timer: null, repeatTimer: null },
    mixVolumeUp: { holding: false, timer: null, repeatTimer: null },
    mixVolumeDown: { holding: false, timer: null, repeatTimer: null },
    inputGainUp: [null, 
        { holding: false, timer: null, repeatTimer: null },
        { holding: false, timer: null, repeatTimer: null },
        { holding: false, timer: null, repeatTimer: null },
        { holding: false, timer: null, repeatTimer: null }
    ],
    inputGainDown: [null,
        { holding: false, timer: null, repeatTimer: null },
        { holding: false, timer: null, repeatTimer: null },
        { holding: false, timer: null, repeatTimer: null },
        { holding: false, timer: null, repeatTimer: null }
    ]
};

let tcpClient = null;
let reconnectTimer = null;

// Utility functions (from your Crestron module)
function dBToPercent(dbValue) {
    const adjustedValue = dbValue + 70;
    let percent = Math.round((adjustedValue * 100) / 82);
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    return percent;
}

function formatDBString(value) {
    if (value > 0) return `+${value}dB`;
    if (value === 0) return "0dB";
    return `${value}dB`;
}

function validateVolumeDB(value) {
    if (value < -70) return -70;
    if (value > 12) return 12;
    return value;
}

function validateGainDB(value) {
    if (value < -12) return -12;
    if (value > 12) return 12;
    return value;
}

// Send commands to Neets (like your SendCommand function)
function sendNeetsCommand(command) {
    if (tcpClient && deviceState.connected) {
        const fullCommand = `NEUNIT=1,${command}\r`;
        console.log('Sending:', fullCommand.trim());
        tcpClient.write(fullCommand);
        return true;
    }
    console.log('Not connected to Neets device');
    return false;
}

// Complete response parser (matching your ParseResponse function)
function parseNeetsResponse(data) {
    const response = data.toString();
    console.log('Received:', response.trim());
    
    if (response.includes('NEUNIT=')) {
        // Power
        if (response.includes(',POWER=')) {
            deviceState.power = response.includes('ON') ? 1 : 0;
        }
        
        // Volume
        if (response.includes(',VOL=')) {
            const match = response.match(/,VOL=(-?\d+)/);
            if (match) {
                deviceState.volume = validateVolumeDB(parseInt(match[1]));
            }
        }
        
        // Mix Volume
        if (response.includes(',MIXVOL=')) {
            const match = response.match(/,MIXVOL=(-?\d+)/);
            if (match) {
                deviceState.mixVolume = validateVolumeDB(parseInt(match[1]));
            }
        }
        
        // Source
        if (response.includes(',INPUT=')) {
            const match = response.match(/,INPUT=(\d+)/);
            if (match) {
                deviceState.source = parseInt(match[1]);
            }
        }
        
        // Mute
        if (response.includes(',MUTE=')) {
            deviceState.mute = response.includes('ON') ? 1 : 0;
        }
        
        // Mix Mute
        if (response.includes(',MIXMUTE=')) {
            deviceState.mixMute = response.includes('ON') ? 1 : 0;
        }
        
        // Mix Mode
        if (response.includes(',MIX=')) {
            deviceState.mixMode = response.includes('TRUE') ? 1 : 0;
        }
        
        // Input Gain
        if (response.includes(',GAIN=')) {
            const inputMatch = response.match(/INPUT=(\d+)/);
            const gainMatch = response.match(/,GAIN=([+-]?\d+)/);
            if (inputMatch && gainMatch) {
                const inputNum = parseInt(inputMatch[1]);
                const gainValue = validateGainDB(parseInt(gainMatch[1]));
                if (inputNum >= 1 && inputNum <= 4) {
                    deviceState.inputGain[inputNum] = gainValue;
                }
            }
        }
        
        // EQ
        if (response.includes(',EQLOW=')) {
            const match = response.match(/,EQLOW=([+-]?\d+)/);
            if (match) deviceState.eqLow = validateGainDB(parseInt(match[1]));
        }
        if (response.includes(',EQMID=')) {
            const match = response.match(/,EQMID=([+-]?\d+)/);
            if (match) deviceState.eqMid = validateGainDB(parseInt(match[1]));
        }
        if (response.includes(',EQHIGH=')) {
            const match = response.match(/,EQHIGH=([+-]?\d+)/);
            if (match) deviceState.eqHigh = validateGainDB(parseInt(match[1]));
        }
    }
}

// Press & Hold functions (simplified from your module)
function processVolumeUpStep() {
    if (deviceState.volume >= 12) return false;
    const newVolume = validateVolumeDB(deviceState.volume + 1);
    sendNeetsCommand(`VOL=${newVolume}`);
    setTimeout(() => sendNeetsCommand('VOL=?'), 100);
    return true;
}

function processVolumeDownStep() {
    if (deviceState.volume <= -70) return false;
    const newVolume = validateVolumeDB(deviceState.volume - 1);
    sendNeetsCommand(`VOL=${newVolume}`);
    setTimeout(() => sendNeetsCommand('VOL=?'), 100);
    return true;
}

function processMixVolumeUpStep() {
    if (deviceState.mixVolume >= 12) return false;
    const newVolume = validateVolumeDB(deviceState.mixVolume + 1);
    sendNeetsCommand(`MIXVOL=${newVolume}`);
    setTimeout(() => sendNeetsCommand('MIXVOL=?'), 100);
    return true;
}

function processMixVolumeDownStep() {
    if (deviceState.mixVolume <= -70) return false;
    const newVolume = validateVolumeDB(deviceState.mixVolume - 1);
    sendNeetsCommand(`MIXVOL=${newVolume}`);
    setTimeout(() => sendNeetsCommand('MIXVOL=?'), 100);
    return true;
}

function processInputGainUpStep(inputNum) {
    if (deviceState.inputGain[inputNum] >= 12) return false;
    const newGain = validateGainDB(deviceState.inputGain[inputNum] + 1);
    const gainStr = newGain >= 0 ? `+${newGain}` : newGain.toString();
    sendNeetsCommand(`SETTINGS=INPUT,INPUT=${inputNum},GAIN=${gainStr}`);
    setTimeout(() => sendNeetsCommand(`SETTINGS=INPUT,INPUT=${inputNum},GAIN=?`), 100);
    return true;
}

function processInputGainDownStep(inputNum) {
    if (deviceState.inputGain[inputNum] <= -12) return false;
    const newGain = validateGainDB(deviceState.inputGain[inputNum] - 1);
    const gainStr = newGain >= 0 ? `+${newGain}` : newGain.toString();
    sendNeetsCommand(`SETTINGS=INPUT,INPUT=${inputNum},GAIN=${gainStr}`);
    setTimeout(() => sendNeetsCommand(`SETTINGS=INPUT,INPUT=${inputNum},GAIN=?`), 100);
    return true;
}

// Hold management functions
function startHold(controlType, inputNum = null) {
    const key = inputNum ? `${controlType}_${inputNum}` : controlType;
    const holdState = inputNum ? holdStates[controlType][inputNum] : holdStates[controlType];
    
    if (holdState.holding) return; // Already holding
    
    holdState.holding = true;
    
    // Execute initial step
    let stepFunction;
    switch (controlType) {
        case 'volumeUp': stepFunction = processVolumeUpStep; break;
        case 'volumeDown': stepFunction = processVolumeDownStep; break;
        case 'mixVolumeUp': stepFunction = processMixVolumeUpStep; break;
        case 'mixVolumeDown': stepFunction = processMixVolumeDownStep; break;
        case 'inputGainUp': stepFunction = () => processInputGainUpStep(inputNum); break;
        case 'inputGainDown': stepFunction = () => processInputGainDownStep(inputNum); break;
    }
    
    stepFunction();
    
    // Start hold timer
    holdState.timer = setTimeout(() => {
        if (holdState.holding) {
            // Start repeat
            holdState.repeatTimer = setInterval(() => {
                if (holdState.holding) {
                    stepFunction();
                } else {
                    clearInterval(holdState.repeatTimer);
                }
            }, REPEAT_RATE);
        }
    }, HOLD_TIME);
}

function stopHold(controlType, inputNum = null) {
    const holdState = inputNum ? holdStates[controlType][inputNum] : holdStates[controlType];
    
    holdState.holding = false;
    if (holdState.timer) {
        clearTimeout(holdState.timer);
        holdState.timer = null;
    }
    if (holdState.repeatTimer) {
        clearInterval(holdState.repeatTimer);
        holdState.repeatTimer = null;
    }
}

// TCP Connection Management
function connectToNeets() {
    if (tcpClient) {
        tcpClient.destroy();
    }
    
    tcpClient = new net.Socket();
    
    tcpClient.connect(NEETS_PORT, NEETS_IP, () => {
        console.log(`Connected to Neets device at ${NEETS_IP}:${NEETS_PORT}`);
        deviceState.connected = true;
        
        // Comprehensive polling on connection (like your SOCKETCONNECT)
        setTimeout(() => pollAllStatus(), 500);
    });
    
    tcpClient.on('data', parseNeetsResponse);
    
    tcpClient.on('close', () => {
        console.log('Connection to Neets device closed');
        deviceState.connected = false;
        // Auto-reconnect after 5 seconds
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectToNeets, 5000);
    });
    
    tcpClient.on('error', (err) => {
        console.error('Neets connection error:', err.message);
        deviceState.connected = false;
    });
}

// Comprehensive polling function
function pollAllStatus() {
    const commands = [
        'POWER=?',
        'VOL=?',
        'INPUT=?',
        'MUTE=?',
        'SETTINGS=INPUT,INPUT=1,MIX=?',
        'MIXVOL=?',
        'MIXMUTE=?',
        'SETTINGS=INPUT,INPUT=1,GAIN=?',
        'SETTINGS=INPUT,INPUT=2,GAIN=?',
        'SETTINGS=INPUT,INPUT=3,GAIN=?',
        'SETTINGS=INPUT,INPUT=4,GAIN=?',
        'SETTINGS=OUTPUT,EQLOW=?',
        'SETTINGS=OUTPUT,EQMID=?',
        'SETTINGS=OUTPUT,EQHIGH=?'
    ];
    
    commands.forEach((cmd, index) => {
        setTimeout(() => sendNeetsCommand(cmd), index * 100);
    });
}

function pollVolumeStatus() {
    sendNeetsCommand('VOL=?');
    setTimeout(() => sendNeetsCommand('MIXVOL=?'), 100);
}

// API Routes

// Get complete status with feedback
app.get('/status', (req, res) => {
    res.json({
        connected: deviceState.connected,
        power: {
            value: deviceState.power,
            on: deviceState.power === 1,
            off: deviceState.power === 0
        },
        volume: {
            db: deviceState.volume,
            dbString: formatDBString(deviceState.volume),
            percent: dBToPercent(deviceState.volume)
        },
        source: {
            value: deviceState.source,
            source1: deviceState.source === 1,
            source2: deviceState.source === 2,
            source3: deviceState.source === 3,
            source4: deviceState.source === 4,
            source5: deviceState.source === 5
        },
        mute: {
            value: deviceState.mute,
            on: deviceState.mute === 1,
            off: deviceState.mute === 0
        },
        mixMode: {
            value: deviceState.mixMode,
            on: deviceState.mixMode === 1,
            off: deviceState.mixMode === 0
        },
        mixVolume: {
            db: deviceState.mixVolume,
            dbString: formatDBString(deviceState.mixVolume),
            percent: dBToPercent(deviceState.mixVolume)
        },
        mixMute: {
            value: deviceState.mixMute,
            on: deviceState.mixMute === 1,
            off: deviceState.mixMute === 0
        },
        inputGain: {
            input1: {
                db: deviceState.inputGain[1],
                dbString: formatDBString(deviceState.inputGain[1])
            },
            input2: {
                db: deviceState.inputGain[2],
                dbString: formatDBString(deviceState.inputGain[2])
            },
            input3: {
                db: deviceState.inputGain[3],
                dbString: formatDBString(deviceState.inputGain[3])
            },
            input4: {
                db: deviceState.inputGain[4],
                dbString: formatDBString(deviceState.inputGain[4])
            }
        },
        eq: {
            low: {
                db: deviceState.eqLow,
                dbString: formatDBString(deviceState.eqLow)
            },
            mid: {
                db: deviceState.eqMid,
                dbString: formatDBString(deviceState.eqMid)
            },
            high: {
                db: deviceState.eqHigh,
                dbString: formatDBString(deviceState.eqHigh)
            }
        }
    });
});

// Power Control
app.post('/power/:action', (req, res) => {
    const action = req.params.action.toUpperCase();
    if (['ON', 'OFF', 'TOGGLE'].includes(action)) {
        if (action === 'TOGGLE') {
            const newState = deviceState.power === 1 ? 'OFF' : 'ON';
            sendNeetsCommand(`POWER=${newState}`);
        } else {
            sendNeetsCommand(`POWER=${action}`);
        }
        setTimeout(() => sendNeetsCommand('POWER=?'), 100);
        res.json({ success: true, action });
    } else {
        res.status(400).json({ error: 'Invalid power action. Use ON, OFF, or TOGGLE' });
    }
});

// Volume Control with Press & Hold
app.post('/volume/up/start', (req, res) => {
    startHold('volumeUp');
    res.json({ success: true, action: 'volume_up_start' });
});

app.post('/volume/up/stop', (req, res) => {
    stopHold('volumeUp');
    res.json({ success: true, action: 'volume_up_stop' });
});

app.post('/volume/down/start', (req, res) => {
    startHold('volumeDown');
    res.json({ success: true, action: 'volume_down_start' });
});

app.post('/volume/down/stop', (req, res) => {
    stopHold('volumeDown');
    res.json({ success: true, action: 'volume_down_stop' });
});

// Simple volume step (for single press)
app.post('/volume/:action', (req, res) => {
    const action = req.params.action.toLowerCase();
    let success = false;
    
    if (action === 'up') {
        success = processVolumeUpStep();
    } else if (action === 'down') {
        success = processVolumeDownStep();
    } else if (action === 'set') {
        const level = parseInt(req.body.level);
        const validLevel = validateVolumeDB(level);
        if (level >= -70 && level <= 12) {
            sendNeetsCommand(`VOL=${validLevel}`);
            setTimeout(() => sendNeetsCommand('VOL=?'), 100);
            success = true;
        }
    }
    
    if (success) {
        res.json({ success: true, action });
    } else {
        res.status(400).json({ error: 'Invalid volume action or at limit' });
    }
});

// Source Selection
app.post('/source/:number', (req, res) => {
    const source = parseInt(req.params.number);
    if (source >= 1 && source <= 5) {
        sendNeetsCommand(`INPUT=${source}`);
        setTimeout(() => sendNeetsCommand('INPUT=?'), 100);
        res.json({ success: true, source });
    } else {
        res.status(400).json({ error: 'Invalid source. Use 1-5' });
    }
});

// Mute Control
app.post('/mute/:action', (req, res) => {
    const action = req.params.action.toUpperCase();
    if (['ON', 'OFF', 'TOGGLE'].includes(action)) {
        if (action === 'TOGGLE') {
            const newState = deviceState.mute === 1 ? 'OFF' : 'ON';
            sendNeetsCommand(`MUTE=${newState}`);
        } else {
            sendNeetsCommand(`MUTE=${action}`);
        }
        setTimeout(() => sendNeetsCommand('MUTE=?'), 100);
        res.json({ success: true, action });
    } else {
        res.status(400).json({ error: 'Invalid mute action. Use ON, OFF, or TOGGLE' });
    }
});

// Start the server
app.listen(SERVER_PORT, '0.0.0.0', () => {
    console.log(`Neets Bridge Server running on port ${SERVER_PORT}`);
    console.log(`Connecting to Neets device at ${NEETS_IP}:${NEETS_PORT}`);
    connectToNeets();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    
    // Stop all hold operations
    Object.keys(holdStates).forEach(key => {
        if (Array.isArray(holdStates[key])) {
            holdStates[key].forEach((state, index) => {
                if (state && index > 0) stopHold(key, index);
            });
        } else {
            stopHold(key);
        }
    });
    
    if (tcpClient) tcpClient.destroy();
    process.exit(0);
});
// GET endpoints for Stream Deck Website action
app.get('/control/power/toggle', (req, res) => {
    const newState = deviceState.power === 1 ? 'OFF' : 'ON';
    sendNeetsCommand(`POWER=${newState}`);
    res.send(`<h1>Power ${newState}</h1><script>setTimeout(() => window.close(), 1000);</script>`);
});

app.get('/control/volume/up', (req, res) => {
    sendNeetsCommand(`VOL=${deviceState.volume + 1}`);
    res.send(`<h1>Volume Up</h1><script>setTimeout(() => window.close(), 1000);</script>`);
});

app.get('/control/volume/down', (req, res) => {
    sendNeetsCommand(`VOL=${deviceState.volume - 1}`);
    res.send(`<h1>Volume Down</h1><script>setTimeout(() => window.close(), 1000);</script>`);
});

app.get('/control/source/:number', (req, res) => {
    const source = parseInt(req.params.number);
    sendNeetsCommand(`INPUT=${source}`);
    res.send(`<h1>Source ${source}</h1><script>setTimeout(() => window.close(), 1000);</script>`);
});

app.get('/control/mute/toggle', (req, res) => {
    const newState = deviceState.mute === 1 ? 'OFF' : 'ON';
    sendNeetsCommand(`MUTE=${newState}`);
    res.send(`<h1>Mute ${newState}</h1><script>setTimeout(() => window.close(), 1000);</script>`);
});
});
