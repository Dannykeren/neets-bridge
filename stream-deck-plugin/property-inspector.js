// Property Inspector for NEETS Bridge Plugin
let websocket = null;
let uuid = null;
let actionInfo = {};

// Connect to Stream Deck
function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
    uuid = inPropertyInspectorUUID;
    actionInfo = JSON.parse(inActionInfo);
    
    websocket = new WebSocket('ws://localhost:' + inPort);
    
    websocket.onopen = function() {
        register(inPropertyInspectorUUID, inRegisterEvent);
        initializeUI();
    };
    
    websocket.onmessage = function(evt) {
        const jsonObj = JSON.parse(evt.data);
        if (jsonObj.event === 'didReceiveSettings') {
            handleSettings(jsonObj.payload.settings);
        }
    };
}

// Register with Stream Deck
function register(inPropertyInspectorUUID, inRegisterEvent) {
    const json = {
        event: inRegisterEvent,
        uuid: inPropertyInspectorUUID
    };
    websocket.send(JSON.stringify(json));
}

// Initialize UI based on action type
function initializeUI() {
    const action = actionInfo.action;
    
    // Show/hide relevant settings based on action type
    if (action === 'com.neets.bridge.volume') {
        document.getElementById('volumeActionItem').style.display = 'block';
    } else if (action === 'com.neets.bridge.source') {
        document.getElementById('sourceItem').style.display = 'block';
    }
    
    // Load existing settings
    requestSettings();
    
    // Add event listeners
    document.getElementById('neetsHost').addEventListener('input', saveSettings);
    document.getElementById('neetsPort').addEventListener('input', saveSettings);
    document.getElementById('volumeAction').addEventListener('change', saveSettings);
    document.getElementById('source').addEventListener('change', saveSettings);
    document.getElementById('testConnection').addEventListener('click', testConnection);
}

// Request current settings
function requestSettings() {
    const json = {
        event: 'getSettings',
        context: uuid
    };
    websocket.send(JSON.stringify(json));
}

// Handle received settings
function handleSettings(settings) {
    document.getElementById('neetsHost').value = settings.neetsHost || 'localhost';
    document.getElementById('neetsPort').value = settings.neetsPort || '8080';
    document.getElementById('volumeAction').value = settings.volumeAction || 'volume_up';
    document.getElementById('source').value = settings.source || '1';
}

// Save settings to Stream Deck
function saveSettings() {
    const settings = {
        neetsHost: document.getElementById('neetsHost').value,
        neetsPort: document.getElementById('neetsPort').value,
        volumeAction: document.getElementById('volumeAction').value,
        source: document.getElementById('source').value
    };
    
    const json = {
        event: 'setSettings',
        context: uuid,
        payload: settings
    };
    websocket.send(JSON.stringify(json));
}

// Test connection to NEETS Bridge
function testConnection() {
    const host = document.getElementById('neetsHost').value || 'localhost';
    const port = document.getElementById('neetsPort').value || '8080';
    const statusElement = document.getElementById('connectionStatus');
    
    statusElement.textContent = 'Status: Testing...';
    
    const testWS = new WebSocket(`ws://${host}:${port}`);
    
    testWS.onopen = function() {
        statusElement.textContent = 'Status: ✅ Connected!';
        statusElement.style.color = 'green';
        testWS.close();
    };
    
    testWS.onerror = function() {
        statusElement.textContent = 'Status: ❌ Connection failed';
        statusElement.style.color = 'red';
    };
    
    testWS.ontimeout = function() {
        statusElement.textContent = 'Status: ⏱️ Timeout';
        statusElement.style.color = 'orange';
    };
}

// Make function available globally
if (typeof window !== 'undefined') {
    window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
}
