/**
 * NEETS Bridge Stream Deck Plugin
 * Professional control for NEETS Amp systems
 */

// Global variables
let streamDeckWebSocket = null;
let neetsWebSocket = null;
let currentState = {};
let buttonContexts = {};
let reconnectInterval = null;
let heartbeatInterval = null;
let debugMode = false;

// Plugin initialization
function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    log('Initializing NEETS Bridge Plugin...');
    
    // Parse info
    const info = JSON.parse(inInfo);
    debugMode = info.application?.version ? true : false;
    
    // Connect to Stream Deck
    streamDeckWebSocket = new WebSocket('ws://localhost:' + inPort);
    
    streamDeckWebSocket.onopen = function() {
        log('✅ Connected to Stream Deck');
        register(inPluginUUID, inRegisterEvent);
        startHeartbeat();
    };
    
    streamDeckWebSocket.onmessage = function(evt) {
        try {
            const jsonObj = JSON.parse(evt.data);
            handleStreamDeckMessage(jsonObj);
        } catch (error) {
            log('❌ Error parsing Stream Deck message:', error);
        }
    };
    
    streamDeckWebSocket.onclose = function() {
        log('❌ Stream Deck connection closed');
        stopHeartbeat();
    };
    
    streamDeckWebSocket.onerror = function(error) {
        log('❌ Stream Deck connection error:', error);
    };
}

// Register plugin with Stream Deck
function register(inPluginUUID, inRegisterEvent) {
    const json = {
        event: inRegisterEvent,
        uuid: inPluginUUID
    };
    sendToStreamDeck(json);
    log('📝 Registered with Stream Deck');
}

// Handle messages from Stream Deck
function handleStreamDeckMessage(jsonObj) {
    const event = jsonObj.event;
    
    switch(event) {
        case 'keyDown':
            handleKeyDown(jsonObj);
            break;
        case 'keyUp':
            handleKeyUp(jsonObj);
            break;
        case 'willAppear':
            handleWillAppear(jsonObj);
            break;
        case 'willDisappear':
            handleWillDisappear(jsonObj);
            break;
        case 'didReceiveSettings':
            handleDidReceiveSettings(jsonObj);
            break;
        case 'applicationDidLaunch':
            log('📱 Stream Deck application launched');
            break;
        case 'applicationDidTerminate':
            log('📱 Stream Deck application terminated');
            break;
        default:
            log('🔸 Unhandled Stream Deck event:', event);
    }
}

// Handle button press
function handleKeyDown(jsonObj) {
    const context = jsonObj.context;
    const action = jsonObj.action;
    const settings = jsonObj.payload?.settings || {};
    
    log(`🔽 Button pressed: ${action}`);
    
    // Ensure NEETS connection
    ensureNEETSConnection(settings);
    
    // Handle different actions
    switch(action) {
        case 'com.neets.bridge.power':
            sendNEETSCommand({ action: 'power_toggle' });
            break;
            
        case 'com.neets.bridge.volume':
            const volumeAction = settings.volumeAction || 'volume_up';
            sendNEETSCommand({ action: volumeAction });
            break;
            
        case 'com.neets.bridge.mute':
            sendNEETSCommand({ action: 'mute_toggle' });
            break;
            
        case 'com.neets.bridge.source':
            const source = parseInt(settings.source) || 1;
            sendNEETSCommand({ action: 'source_select', source: source });
            break;
            
        case 'com.neets.bridge.status':
            sendNEETSCommand({ action: 'get_state' });
            break;
            
        case 'com.neets.bridge.mix':
            sendNEETSCommand({ action: 'mix_mode_toggle' });
            break;
            
        default:
            log('🔸 Unhandled action:', action);
    }
}

// Handle button release
function handleKeyUp(jsonObj) {
    // Currently no specific key up actions
}

// Handle button appearing on Stream Deck
function handleWillAppear(jsonObj) {
    const context = jsonObj.context;
    const action = jsonObj.action;
    const settings = jsonObj.payload?.settings || {};
    
    log(`👁️ Button appeared: ${action}`);
    
    // Store button context
    buttonContexts[context] = {
        action: action,
        settings: settings
    };
    
    // Connect to NEETS Bridge
    ensureNEETSConnection(settings);
    
    // Request initial state
    setTimeout(() => {
        sendNEETSCommand({ action: 'get_state' });
    }, 1000);
}

// Handle button disappearing from Stream Deck
function handleWillDisappear(jsonObj) {
    const context = jsonObj.context;
    delete buttonContexts[context];
    log(`👁️‍🗨️ Button disappeared: ${context}`);
}

// Handle settings update
function handleDidReceiveSettings(jsonObj) {
    const context = jsonObj.context;
    const settings = jsonObj.payload?.settings || {};
    
    if (buttonContexts[context]) {
        buttonContexts[context].settings = settings;
        log('⚙️ Settings updated for context:', context);
        
        // Reconnect if connection settings changed
        if (settings.neetsHost || settings.neetsPort) {
            disconnectFromNEETS();
            ensureNEETSConnection(settings);
        }
    }
}

// Ensure connection to NEETS Bridge
function ensureNEETSConnection(settings) {
    if (neetsWebSocket && neetsWebSocket.readyState === WebSocket.OPEN) {
        return; // Already connected
    }
    
    if (neetsWebSocket && neetsWebSocket.readyState === WebSocket.CONNECTING) {
        return; // Already connecting
    }
    
    connectToNEETSBridge(settings);
}

// Connect to NEETS Bridge WebSocket
function connectToNEETSBridge(settings) {
    // Get connection details from settings or use defaults
    const host = settings.neetsHost || getDefaultHost();
    const port = settings.neetsPort || '8080';
    const wsUrl = `ws://${host}:${port}`;
    
    log(`🔌 Connecting to NEETS Bridge: ${wsUrl}`);
    
    try {
        neetsWebSocket = new WebSocket(wsUrl);
        
        neetsWebSocket.onopen = function() {
            log('✅ Connected to NEETS Bridge');
            clearInterval(reconnectInterval);
            updateAllButtonsConnectionStatus(true);
            
            // Request initial status
            setTimeout(() => {
                sendNEETSCommand({ action: 'get_state' });
            }, 500);
        };
        
        neetsWebSocket.onmessage = function(evt) {
            try {
                const data = JSON.parse(evt.data);
                handleNEETSMessage(data);
            } catch (error) {
                log('❌ Error parsing NEETS message:', error);
            }
        };
        
        neetsWebSocket.onclose = function(event) {
            log(`❌ NEETS Bridge disconnected (${event.code})`);
            updateAllButtonsConnectionStatus(false);
            scheduleReconnect(settings);
        };
        
        neetsWebSocket.onerror = function(error) {
            log('❌ NEETS Bridge connection error:', error);
            updateAllButtonsConnectionStatus(false);
        };
        
    } catch (error) {
        log('❌ Failed to create WebSocket connection:', error);
        scheduleReconnect(settings);
    }
}

// Disconnect from NEETS Bridge
function disconnectFromNEETS() {
    if (neetsWebSocket) {
        neetsWebSocket.close();
        neetsWebSocket = null;
    }
    clearInterval(reconnectInterval);
}

// Schedule reconnection attempt
function scheduleReconnect(settings) {
    if (reconnectInterval) return; // Already scheduled
    
    let attempts = 0;
    const maxAttempts = 10;
    const baseDelay = 5000; // 5 seconds
    
    reconnectInterval = setInterval(() => {
        attempts++;
        
        if (attempts > maxAttempts) {
            log('❌ Max reconnection attempts reached');
            clearInterval(reconnectInterval);
            reconnectInterval = null;
            return;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), 60000); // Exponential backoff, max 1 minute
        log(`🔄 Reconnection attempt ${attempts}/${maxAttempts} in ${delay/1000}s`);
        
        setTimeout(() => {
            connectToNEETSBridge(settings);
        }, delay);
        
    }, 1000);
}

// Send command to NEETS Bridge
function sendNEETSCommand(command) {
    if (neetsWebSocket && neetsWebSocket.readyState === WebSocket.OPEN) {
        const commandStr = JSON.stringify(command);
        neetsWebSocket.send(commandStr);
        log(`📤 Sent to NEETS: ${commandStr}`);
    } else {
        log('❌ Cannot send command - NEETS Bridge not connected');
    }
}

// Handle NEETS Bridge responses
function handleNEETSMessage(data) {
    log(`📥 Received from NEETS:`, data);
    
    if (data.type === 'state_update') {
        currentState = { ...currentState, ...data.state };
        updateAllButtons();
    } else if (data.type === 'response') {
        // Handle specific responses
        log('📋 NEETS Response:', data);
    } else if (data.type === 'error') {
        log('❌ NEETS Error:', data.message);
    }
}

// Update all Stream Deck buttons
function updateAllButtons() {
    for (const context in buttonContexts) {
        const buttonInfo = buttonContexts[context];
        updateButton(context, buttonInfo.action, buttonInfo.settings);
    }
}

// Update specific button based on current state
function updateButton(context, action, settings) {
    switch(action) {
        case 'com.neets.bridge.power':
            updatePowerButton(context);
            break;
        case 'com.neets.bridge.volume':
            updateVolumeButton(context, settings);
            break;
        case 'com.neets.bridge.mute':
            updateMuteButton(context);
            break;
        case 'com.neets.bridge.source':
            updateSourceButton(context, settings);
            break;
        case 'com.neets.bridge.status':
            updateStatusButton(context);
            break;
        case 'com.neets.bridge.mix':
            updateMixButton(context);
            break;
    }
}

// Update power button
function updatePowerButton(context) {
    const state = currentState.power ? 1 : 0;
    const title = currentState.power ? 'ON' : 'OFF';
    
    setButtonState(context, state);
    setButtonTitle(context, title);
}

// Update volume button
function updateVolumeButton(context, settings) {
    const volumeAction = settings.volumeAction || 'volume_up';
    const volumeText = currentState.volumeDb || '0dB';
    const volumePercent = currentState.volumePercent || 0;
    
    const title = `${volumeAction === 'volume_up' ? '▲' : '▼'}\n${volumeText}\n${volumePercent}%`;
    setButtonTitle(context, title);
}

// Update mute button
function updateMuteButton(context) {
    const state = currentState.mute ? 1 : 0;
    const title = currentState.mute ? 'MUTED' : '';
    
    setButtonState(context, state);
    setButtonTitle(context, title);
}

// Update source button
function updateSourceButton(context, settings) {
    const targetSource = parseInt(settings.source) || 1;
    const currentSource = currentState.source || 0;
    const isActive = currentSource === targetSource;
    
    setButtonState(context, isActive ? 1 : 0);
    setButtonTitle(context, `SRC ${targetSource}${isActive ? '\n●' : ''}`);
}

// Update status button
function updateStatusButton(context) {
    const connected = neetsWebSocket && neetsWebSocket.readyState === WebSocket.OPEN;
    const connectionIcon = connected ? '🟢' : '🔴';
    const power = currentState.power ? 'ON' : 'OFF';
    const volume = currentState.volumeDb || '0dB';
    const source = currentState.source || '?';
    
    const title = `${connectionIcon}\n${power}\nVol: ${volume}\nSrc: ${source}`;
    setButtonTitle(context, title);
}

// Update mix button
function updateMixButton(context) {
    const state = currentState.mixMode ? 1 : 0;
    const title = currentState.mixMode ? 'MIX ON' : 'MIX OFF';
    
    setButtonState(context, state);
    setButtonTitle(context, title);
}

// Update connection status for all buttons
function updateAllButtonsConnectionStatus(connected) {
    // This can be used to show/hide connection indicators
    log(`🔗 Connection status changed: ${connected ? 'Connected' : 'Disconnected'}`);
}

// Utility functions for Stream Deck communication
function setButtonState(context, state) {
    const json = {
        event: 'setState',
        context: context,
        payload: {
            state: state
        }
    };
    sendToStreamDeck(json);
}

function setButtonTitle(context, title) {
    const json = {
        event: 'setTitle',
        context: context,
        payload: {
            title: title,
            target: 0 // Hardware and software
        }
    };
    sendToStreamDeck(json);
}

function setButtonImage(context, image) {
    const json = {
        event: 'setImage',
        context: context,
        payload: {
            image: image,
            target: 0
        }
    };
    sendToStreamDeck(json);
}

function sendToStreamDeck(json) {
    if (streamDeckWebSocket && streamDeckWebSocket.readyState === WebSocket.OPEN) {
        streamDeckWebSocket.send(JSON.stringify(json));
    }
}

// Heartbeat to keep connection alive
function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
        if (neetsWebSocket && neetsWebSocket.readyState === WebSocket.OPEN) {
            sendNEETSCommand({ action: 'ping' });
        }
    }, 30000); // 30 seconds
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// Get default host (try to detect Raspberry Pi on network)
function getDefaultHost() {
    // Default to localhost, but could be enhanced to scan for Pi
    return 'localhost';
}

// Logging function
function log(...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] NEETS Plugin:`, ...args);
    
    if (debugMode) {
        const debugEl = document.getElementById('debug');
        if (debugEl) {
            debugEl.style.display = 'block';
            debugEl.textContent = args.join(' ');
        }
    }
}

// Cleanup on unload
window.addEventListener('beforeunload', function() {
    disconnectFromNEETS();
    stopHeartbeat();
});

// Make function available globally for Stream Deck
if (typeof window !== 'undefined') {
    window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
}

// Initialize
log('🚀 NEETS Bridge Plugin loaded and ready');
