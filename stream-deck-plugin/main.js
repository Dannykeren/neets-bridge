// main.js - Stream Deck Plugin with proper feedback handling
import streamDeck from '@elgato/streamdeck';

let websocket = null;
let deviceState = {
    connected: false,
    power: false,
    source: 0,
    volume: 0,
    volumeDb: '0dB',
    volumePercent: '0%',
    mute: false,
    mixMode: false,
    mixVolume: 0,
    mixVolumeDb: '0dB',
    mixVolumePercent: '0%',
    mixMute: false,
    inputGains: [0, 0, 0, 0],
    inputGainsDb: ['0dB', '0dB', '0dB', '0dB'],
    inputGainsPercent: ['0%', '0%', '0%', '0%'],
    eqLow: '0dB',
    eqMid: '0dB',
    eqHigh: '0dB'
};

let reconnectTimer = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// WebSocket connection management
function connectWebSocket() {
    const bridgeUrl = 'ws://localhost:8080'; // Adjust if running on different host
    
    try {
        websocket = new WebSocket(bridgeUrl);
        
        websocket.onopen = () => {
            console.log('Connected to NEETS bridge');
            reconnectAttempts = 0;
            updateAllActionStates();
            
            // Request current state
            sendMessage({ action: 'get_state' });
        };
        
        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleBridgeMessage(data);
            } catch (error) {
                console.error('Error parsing bridge message:', error);
            }
        };
        
        websocket.onclose = () => {
            console.log('Disconnected from NEETS bridge');
            websocket = null;
            scheduleReconnect();
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts})`);
        
        reconnectTimer = setTimeout(() => {
            connectWebSocket();
        }, delay);
    }
}

function sendMessage(message) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
        return true;
    }
    console.warn('Cannot send message: WebSocket not connected');
    return false;
}

function handleBridgeMessage(data) {
    switch (data.type) {
        case 'state_update':
            deviceState = { ...deviceState, ...data.state };
            updateAllActionStates();
            break;
        case 'error':
            console.error('Bridge error:', data.message);
            break;
    }
}

function updateAllActionStates() {
    // Update all registered actions with current state
    streamDeck.actions.getAllInstances().forEach(action => {
        updateActionDisplay(action);
    });
}

function updateActionDisplay(action) {
    const settings = action.getSettings();
    const actionType = settings.actionType;
    
    switch (actionType) {
        case 'power':
            updatePowerAction(action);
            break;
        case 'source':
            updateSourceAction(action, settings.sourceNumber);
            break;
        case 'volume':
            updateVolumeAction(action);
            break;
        case 'mute':
            updateMuteAction(action);
            break;
        case 'mix_mode':
            updateMixModeAction(action);
            break;
        case 'mix_volume':
            updateMixVolumeAction(action);
            break;
        case 'mix_mute':
            updateMixMuteAction(action);
            break;
        case 'input_gain':
            updateInputGainAction(action, settings.inputNumber);
            break;
        case 'eq':
            updateEqAction(action, settings.band);
            break;
    }
}

function updatePowerAction(action) {
    const isOn = deviceState.connected && deviceState.power;
    action.setState(isOn ? 1 : 0);
    action.setTitle(isOn ? 'Power\nON' : 'Power\nOFF');
}

function updateSourceAction(action, sourceNumber) {
    const isActive = deviceState.source === sourceNumber;
    action.setState(isActive ? 1 : 0);
    action.setTitle(`Source\n${sourceNumber}${isActive ? '\n●' : ''}`);
}

function updateVolumeAction(action) {
    const volumeText = `Volume\n${deviceState.volumeDb}\n${deviceState.volumePercent}`;
    action.setTitle(volumeText);
    action.setState(deviceState.mute ? 2 : 0); // Different state for muted
}

function updateMuteAction(action) {
    action.setState(deviceState.mute ? 1 : 0);
    action.setTitle(deviceState.mute ? 'MUTED' : 'Mute');
}

function updateMixModeAction(action) {
    action.setState(deviceState.mixMode ? 1 : 0);
    action.setTitle(deviceState.mixMode ? 'Mix\nON' : 'Mix\nOFF');
}

function updateMixVolumeAction(action) {
    const volumeText = `Mix Vol\n${deviceState.mixVolumeDb}\n${deviceState.mixVolumePercent}`;
    action.setTitle(volumeText);
    action.setState(deviceState.mixMute ? 2 : 0);
}

function updateMixMuteAction(action) {
    action.setState(deviceState.mixMute ? 1 : 0);
    action.setTitle(deviceState.mixMute ? 'Mix\nMUTED' : 'Mix\nMute');
}

function updateInputGainAction(action, inputNumber) {
    const inputIndex = inputNumber - 1;
    if (inputIndex >= 0 && inputIndex < 4) {
        const gainText = `In${inputNumber}\n${deviceState.inputGainsDb[inputIndex]}\n${deviceState.inputGainsPercent[inputIndex]}`;
        action.setTitle(gainText);
    }
}

function updateEqAction(action, band) {
    let eqValue = '0dB';
    switch (band) {
        case 'low':
            eqValue = deviceState.eqLow;
            break;
        case 'mid':
            eqValue = deviceState.eqMid;
            break;
        case 'high':
            eqValue = deviceState.eqHigh;
            break;
    }
    action.setTitle(`EQ ${band.toUpperCase()}\n${eqValue}`);
}

// Action registrations with proper feedback handling

// Power Control
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.power')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'power' });
        updatePowerAction(action);
    })
    .onKeyDown(({ action }) => {
        const settings = action.getSettings();
        if (settings.toggleMode) {
            sendMessage({ action: 'power_toggle' });
        } else {
            sendMessage({ action: deviceState.power ? 'power_off' : 'power_on' });
        }
    })
);

// Source Selection (1-5)
for (let i = 1; i <= 5; i++) {
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.source${i}`)
        .onWillAppear(({ action }) => {
            action.setSettings({ actionType: 'source', sourceNumber: i });
            updateSourceAction(action, i);
        })
        .onKeyDown(() => {
            sendMessage({ action: 'source_select', source: i });
        })
    );
}

// Volume Control
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.volume.up')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'volume' });
        action.setTitle('Volume\nUP');
    })
    .onKeyDown(() => {
        sendMessage({ action: 'volume_up' });
    })
);

streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.volume.down')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'volume' });
        action.setTitle('Volume\nDOWN');
    })
    .onKeyDown(() => {
        sendMessage({ action: 'volume_down' });
    })
);

// Volume Display with Mute Toggle
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.volume.display')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'volume' });
        updateVolumeAction(action);
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mute_toggle' });
    })
);

// Dedicated Mute Button
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.mute')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'mute' });
        updateMuteAction(action);
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mute_toggle' });
    })
);

// Mix Mode Toggle
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.mixmode')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'mix_mode' });
        updateMixModeAction(action);
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mix_mode_toggle' });
    })
);

// Mix Volume Control
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.mixvolume.up')
    .onWillAppear(({ action }) => {
        action.setTitle('Mix Vol\nUP');
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mix_volume_up' });
    })
);

streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.mixvolume.down')
    .onWillAppear(({ action }) => {
        action.setTitle('Mix Vol\nDOWN');
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mix_volume_down' });
    })
);

// Mix Volume Display with Mute Toggle
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.mixvolume.display')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'mix_volume' });
        updateMixVolumeAction(action);
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mix_mute_toggle' });
    })
);

// Mix Mute
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.mixmute')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'mix_mute' });
        updateMixMuteAction(action);
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mix_mute_toggle' });
    })
);

// Input Gain Controls (1-4)
for (let i = 1; i <= 4; i++) {
    // Gain Up
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.input${i}.gain.up`)
        .onWillAppear(({ action }) => {
            action.setTitle(`In${i} Gain\nUP`);
        })
        .onKeyDown(() => {
            sendMessage({ action: 'input_gain_up', input: i });
        })
    );

    // Gain Down
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.input${i}.gain.down`)
        .onWillAppear(({ action }) => {
            action.setTitle(`In${i} Gain\nDOWN`);
        })
        .onKeyDown(() => {
            sendMessage({ action: 'input_gain_down', input: i });
        })
    );

    // Gain Display
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.input${i}.gain.display`)
        .onWillAppear(({ action }) => {
            action.setSettings({ actionType: 'input_gain', inputNumber: i });
            updateInputGainAction(action, i);
        })
        .onKeyDown(() => {
            // Optional: Could implement gain reset or other function
            console.log(`Input ${i} gain display pressed`);
        })
    );
}

// EQ Controls
const eqBands = ['low', 'mid', 'high'];
eqBands.forEach(band => {
    // EQ Up
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.eq.${band}.up`)
        .onWillAppear(({ action }) => {
            action.setTitle(`EQ ${band.toUpperCase()}\nUP`);
        })
        .onKeyDown(() => {
            sendMessage({ action: 'eq_adjust', band: band, direction: 'up' });
        })
    );

    // EQ Down
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.eq.${band}.down`)
        .onWillAppear(({ action }) => {
            action.setTitle(`EQ ${band.toUpperCase()}\nDOWN`);
        })
        .onKeyDown(() => {
            sendMessage({ action: 'eq_adjust', band: band, direction: 'down' });
        })
    );

    // EQ Display
    streamDeck.actions.registerAction(new streamDeck.Action(`com.neets.amp.eq.${band}.display`)
        .onWillAppear(({ action }) => {
            action.setSettings({ actionType: 'eq', band: band });
            updateEqAction(action, band);
        })
        .onKeyDown(() => {
            // Optional: Could implement EQ reset
            console.log(`EQ ${band} display pressed`);
        })
    );
});

// Connection Status Action
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.status')
    .onWillAppear(({ action }) => {
        updateConnectionStatus(action);
    })
    .onKeyDown(() => {
        sendMessage({ action: 'poll_status' });
    })
);

function updateConnectionStatus(action) {
    const isConnected = deviceState.connected;
    action.setState(isConnected ? 1 : 0);
    action.setTitle(isConnected ? 'NEETS\nCONNECTED' : 'NEETS\nDISCONNECTED');
}

// Utility Actions
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.refresh')
    .onWillAppear(({ action }) => {
        action.setTitle('Refresh\nStatus');
    })
    .onKeyDown(() => {
        sendMessage({ action: 'poll_status' });
        // Also request fresh state
        setTimeout(() => {
            sendMessage({ action: 'get_state' });
        }, 500);
    })
);

// Advanced Volume Slider (if Stream Deck supports encoders)
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.volume.slider')
    .onWillAppear(({ action }) => {
        action.setSettings({ actionType: 'volume' });
        updateVolumeAction(action);
    })
    .onDialRotate(({ action, payload }) => {
        // For Stream Deck devices with encoders
        const currentVolume = deviceState.volume;
        const step = payload.ticks * 1; // Adjust sensitivity
        const newVolume = Math.max(-70, Math.min(12, currentVolume + step));
        
        sendMessage({ action: 'volume_set', value: newVolume });
    })
    .onKeyDown(() => {
        sendMessage({ action: 'mute_toggle' });
    })
);

// Preset Configurations
streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.preset.meeting')
    .onWillAppear(({ action }) => {
        action.setTitle('Meeting\nPreset');
    })
    .onKeyDown(() => {
        // Example preset for meeting room
        sendMessage({ action: 'power_on' });
        setTimeout(() => sendMessage({ action: 'source_select', source: 1 }), 200);
        setTimeout(() => sendMessage({ action: 'volume_set', value: -20 }), 400);
        setTimeout(() => sendMessage({ action: 'mute_off' }), 600);
    })
);

streamDeck.actions.registerAction(new streamDeck.Action('com.neets.amp.preset.presentation')
    .onWillAppear(({ action }) => {
        action.setTitle('Present\nPreset');
    })
    .onKeyDown(() => {
        // Example preset for presentation
        sendMessage({ action: 'power_on' });
        setTimeout(() => sendMessage({ action: 'source_select', source: 2 }), 200);
        setTimeout(() => sendMessage({ action: 'volume_set', value: -10 }), 400);
        setTimeout(() => sendMessage({ action: 'mute_off' }), 600);
    })
);

// Initialize connection when plugin loads
streamDeck.onConnected(() => {
    console.log('Stream Deck connected, initializing NEETS bridge connection');
    connectWebSocket();
});

streamDeck.onDisconnected(() => {
    console.log('Stream Deck disconnected');
    if (websocket) {
        websocket.close();
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
});

// Periodic status update
setInterval(() => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        sendMessage({ action: 'get_state' });
    }
}, 10000); // Update every 10 seconds

export default streamDeck;
