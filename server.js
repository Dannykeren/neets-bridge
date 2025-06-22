// server.js - Direct NEETS Amp Bridge
const WebSocket = require('ws');
const net = require('net');

class NeetsAmpDirectBridge {
    constructor() {
        this.wsServer = null;
        this.neetsClient = null;
        this.wsClients = new Set();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        
        // Current device state from NEETS amp feedback
        this.deviceState = {
            connected: false,
            power: false,
            source: 0,
            volume: -40, // dB value
            volumePercent: 0,
            mute: false,
            mixMode: false,
            mixVolume: -40,
            mixVolumePercent: 0,
            mixMute: false,
            inputGains: [0, 0, 0, 0], // dB values for 4 inputs
            inputGainsPercent: [50, 50, 50, 50],
            eqLow: 0,
            eqMid: 0,
            eqHigh: 0
        };
        
        this.config = {
            neetsHost: process.env.NEETS_HOST || '192.168.10.109',
            neetsPort: process.env.NEETS_PORT || 5000,
            wsPort: process.env.WS_PORT || 8080,
            pollInterval: process.env.POLL_INTERVAL || 5000
        };
        
        this.responseBuffer = '';
        this.pollTimer = null;
        
        this.init();
    }
    
    init() {
        this.setupWebSocketServer();
        this.connectToNeets();
        this.startPolling();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down gracefully...');
            this.cleanup();
            process.exit(0);
        });
    }
    
    setupWebSocketServer() {
        this.wsServer = new WebSocket.Server({ 
            port: this.config.wsPort,
            perMessageDeflate: false
        });
        
        this.wsServer.on('connection', (ws, req) => {
            console.log(`New WebSocket connection from ${req.socket.remoteAddress}`);
            this.wsClients.add(ws);
            
            // Send current state immediately upon connection
            this.sendStateUpdate(ws);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleWebSocketMessage(data, ws);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: 'Invalid JSON format' 
                    }));
                }
            });
            
            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                this.wsClients.delete(ws);
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.wsClients.delete(ws);
            });
        });
        
        console.log(`WebSocket server listening on port ${this.config.wsPort}`);
    }
    
    connectToNeets() {
        if (this.neetsClient) {
            this.neetsClient.destroy();
        }
        
        this.neetsClient = new net.Socket();
        
        this.neetsClient.connect(this.config.neetsPort, this.config.neetsHost, () => {
            console.log(`Connected to NEETS Amp at ${this.config.neetsHost}:${this.config.neetsPort}`);
            this.isConnected = true;
            this.deviceState.connected = true;
            this.reconnectAttempts = 0;
            this.broadcastStateUpdate();
            
            // Send initial status requests
            this.requestAllStatus();
        });
        
        this.neetsClient.on('data', (data) => {
            this.handleNeetsData(data.toString());
        });
        
        this.neetsClient.on('close', () => {
            console.log('NEETS connection closed');
            this.isConnected = false;
            this.deviceState.connected = false;
            this.broadcastStateUpdate();
            this.scheduleReconnect();
        });
        
        this.neetsClient.on('error', (error) => {
            console.error('NEETS connection error:', error);
            this.isConnected = false;
            this.deviceState.connected = false;
            this.broadcastStateUpdate();
            this.scheduleReconnect();
        });
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect in ${this.reconnectDelay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connectToNeets();
            }, this.reconnectDelay);
            
            // Exponential backoff
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
        } else {
            console.error('Max reconnection attempts reached. Please check NEETS amp connection.');
        }
    }
    
    handleNeetsData(data) {
        // Accumulate data in buffer for complete response parsing
        this.responseBuffer += data;
        
        // Process complete lines ending with carriage return
        const lines = this.responseBuffer.split('\r');
        
        // Keep the last incomplete line in buffer
        this.responseBuffer = lines.pop() || '';
        
        // Process each complete line
        lines.forEach(line => {
            if (line.trim()) {
                this.parseNeetsResponse(line.trim());
            }
        });
    }
    
    parseNeetsResponse(response) {
        console.log('NEETS Response:', response);
        
        try {
            // Parse NEETS responses
            if (response.includes('NEUNIT=1,')) {
                this.parseNeetsStatusResponse(response);
            } else if (response.includes('ERROR')) {
                console.error('NEETS Error:', response);
            }
        } catch (error) {
            console.error('Error parsing NEETS response:', error, 'Response:', response);
        }
    }
    
    parseNeetsStatusResponse(response) {
        let stateChanged = false;
        
        // Parse power status
        if (response.includes('POWER=')) {
            const powerMatch = response.match(/POWER=(\w+)/);
            if (powerMatch) {
                const newPower = powerMatch[1] === 'ON';
                if (this.deviceState.power !== newPower) {
                    this.deviceState.power = newPower;
                    stateChanged = true;
                }
            }
        }
        
        // Parse volume
        if (response.includes('VOL=')) {
            const volMatch = response.match(/VOL=([+-]?\d+)/);
            if (volMatch) {
                const newVolume = parseInt(volMatch[1]);
                if (this.deviceState.volume !== newVolume) {
                    this.deviceState.volume = newVolume;
                    this.deviceState.volumePercent = this.dbToPercent(newVolume);
                    stateChanged = true;
                }
            }
        }
        
        // Parse input/source
        if (response.includes('INPUT=')) {
            const inputMatch = response.match(/INPUT=(\d+)/);
            if (inputMatch) {
                const newSource = parseInt(inputMatch[1]);
                if (this.deviceState.source !== newSource) {
                    this.deviceState.source = newSource;
                    stateChanged = true;
                }
            }
        }
        
        // Parse mute status
        if (response.includes('MUTE=')) {
            const muteMatch = response.match(/MUTE=(\w+)/);
            if (muteMatch) {
                const newMute = muteMatch[1] === 'ON';
                if (this.deviceState.mute !== newMute) {
                    this.deviceState.mute = newMute;
                    stateChanged = true;
                }
            }
        }
        
        // Parse mix mode
        if (response.includes('MIX=')) {
            const mixMatch = response.match(/MIX=(\w+)/);
            if (mixMatch) {
                const newMixMode = mixMatch[1] === 'TRUE';
                if (this.deviceState.mixMode !== newMixMode) {
                    this.deviceState.mixMode = newMixMode;
                    stateChanged = true;
                }
            }
        }
        
        // Parse mix volume
        if (response.includes('MIXVOL=')) {
            const mixVolMatch = response.match(/MIXVOL=([+-]?\d+)/);
            if (mixVolMatch) {
                const newMixVolume = parseInt(mixVolMatch[1]);
                if (this.deviceState.mixVolume !== newMixVolume) {
                    this.deviceState.mixVolume = newMixVolume;
                    this.deviceState.mixVolumePercent = this.dbToPercent(newMixVolume);
                    stateChanged = true;
                }
            }
        }
        
        // Parse mix mute
        if (response.includes('MIXMUTE=')) {
            const mixMuteMatch = response.match(/MIXMUTE=(\w+)/);
            if (mixMuteMatch) {
                const newMixMute = mixMuteMatch[1] === 'ON';
                if (this.deviceState.mixMute !== newMixMute) {
                    this.deviceState.mixMute = newMixMute;
                    stateChanged = true;
                }
            }
        }
        
        // Parse input gains
        const gainMatch = response.match(/INPUT=(\d+),GAIN=([+-]?\d+)/);
        if (gainMatch) {
            const inputNum = parseInt(gainMatch[1]) - 1; // Convert to 0-based index
            const gainValue = parseInt(gainMatch[2]);
            
            if (inputNum >= 0 && inputNum < 4) {
                if (this.deviceState.inputGains[inputNum] !== gainValue) {
                    this.deviceState.inputGains[inputNum] = gainValue;
                    this.deviceState.inputGainsPercent[inputNum] = this.gainDbToPercent(gainValue);
                    stateChanged = true;
                }
            }
        }
        
        // Parse EQ settings
        if (response.includes('EQLOW=')) {
            const eqLowMatch = response.match(/EQLOW=([+-]?\d+)/);
            if (eqLowMatch) {
                const newEqLow = parseInt(eqLowMatch[1]);
                if (this.deviceState.eqLow !== newEqLow) {
                    this.deviceState.eqLow = newEqLow;
                    stateChanged = true;
                }
            }
        }
        
        if (response.includes('EQMID=')) {
            const eqMidMatch = response.match(/EQMID=([+-]?\d+)/);
            if (eqMidMatch) {
                const newEqMid = parseInt(eqMidMatch[1]);
                if (this.deviceState.eqMid !== newEqMid) {
                    this.deviceState.eqMid = newEqMid;
                    stateChanged = true;
                }
            }
        }
        
        if (response.includes('EQHIGH=')) {
            const eqHighMatch = response.match(/EQHIGH=([+-]?\d+)/);
            if (eqHighMatch) {
                const newEqHigh = parseInt(eqHighMatch[1]);
                if (this.deviceState.eqHigh !== newEqHigh) {
                    this.deviceState.eqHigh = newEqHigh;
                    stateChanged = true;
                }
            }
        }
        
        // Broadcast state update if anything changed
        if (stateChanged) {
            this.broadcastStateUpdate();
        }
    }
    
    dbToPercent(dbValue) {
        // Convert dB to percentage
        // Volume range: -70dB to +12dB (82dB total range)
        const adjustedValue = dbValue + 70;
        const percent = Math.round((adjustedValue * 100) / 82);
        return Math.max(0, Math.min(100, percent));
    }
    
    gainDbToPercent(dbValue) {
        // Convert gain dB to percentage
        // Gain range: -12dB to +12dB (24dB total range)
        const adjustedValue = dbValue + 12;
        const percent = Math.round((adjustedValue * 100) / 24);
        return Math.max(0, Math.min(100, percent));
    }
    
    handleWebSocketMessage(data, ws) {
        if (!this.isConnected) {
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Not connected to NEETS amp' 
            }));
            return;
        }
        
        try {
            switch (data.action) {
                case 'power_on':
                    this.sendToNeets('POWER=ON');
                    break;
                case 'power_off':
                    this.sendToNeets('POWER=OFF');
                    break;
                case 'power_toggle':
                    this.sendToNeets(this.deviceState.power ? 'POWER=OFF' : 'POWER=ON');
                    setTimeout(() => this.sendToNeets('POWER=?'), 250);
                    break;
                case 'source_select':
                    if (data.source >= 1 && data.source <= 5) {
                        this.sendToNeets(`INPUT=${data.source}`);
                        setTimeout(() => this.sendToNeets('INPUT=?'), 250);
                    }
                    break;
                case 'volume_up':
                    this.adjustVolume(1);
                    break;
                case 'volume_down':
                    this.adjustVolume(-1);
                    break;
                case 'volume_set':
                    if (data.value !== undefined) {
                        this.sendToNeets(`VOL=${data.value}`);
                    }
                    break;
                case 'mute_toggle':
                    this.sendToNeets(this.deviceState.mute ? 'MUTE=OFF' : 'MUTE=ON');
                    setTimeout(() => this.sendToNeets('MUTE=?'), 100);
                    break;
                case 'mute_on':
                    this.sendToNeets('MUTE=ON');
                    break;
                case 'mute_off':
                    this.sendToNeets('MUTE=OFF');
                    break;
                case 'mix_mode_toggle':
                    this.sendToNeets(`SETTINGS=INPUT,INPUT=1,MIX=${this.deviceState.mixMode ? 'FALSE' : 'TRUE'}`);
                    setTimeout(() => this.sendToNeets('SETTINGS=INPUT,INPUT=1,MIX=?'), 100);
                    break;
                case 'mix_volume_up':
                    this.adjustMixVolume(1);
                    break;
                case 'mix_volume_down':
                    this.adjustMixVolume(-1);
                    break;
                case 'mix_mute_toggle':
                    this.sendToNeets(this.deviceState.mixMute ? 'MIXMUTE=OFF' : 'MIXMUTE=ON');
                    break;
                case 'input_gain_up':
                    if (data.input >= 1 && data.input <= 4) {
                        this.adjustInputGain(data.input, 1);
                    }
                    break;
                case 'input_gain_down':
                    if (data.input >= 1 && data.input <= 4) {
                        this.adjustInputGain(data.input, -1);
                    }
                    break;
                case 'eq_adjust':
                    if (data.band && data.direction) {
                        this.adjustEq(data.band, data.direction === 'up' ? 1 : -1);
                    }
                    break;
                case 'poll_status':
                    this.requestAllStatus();
                    break;
                case 'get_state':
                    this.sendStateUpdate(ws);
                    break;
                default:
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: `Unknown action: ${data.action}` 
                    }));
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Internal server error' 
            }));
        }
    }
    
    sendToNeets(command) {
        if (this.isConnected && this.neetsClient) {
            const fullCommand = `NEUNIT=1,${command}\r`;
            this.neetsClient.write(fullCommand);
            console.log(`Sent to NEETS: ${fullCommand.trim()}`);
        } else {
            console.error('Cannot send command: Not connected to NEETS amp');
        }
    }
    
    adjustVolume(direction) {
        const newVolume = Math.max(-70, Math.min(12, this.deviceState.volume + direction));
        let dbStr;
        if (newVolume < 0) {
            dbStr = `-${Math.abs(newVolume)}`;
        } else if (newVolume === 0) {
            dbStr = '0';
        } else {
            dbStr = `${newVolume}`;
        }
        this.sendToNeets(`VOL=${dbStr}`);
        this.sendToNeets('VOL=?');
    }
    
    adjustMixVolume(direction) {
        const newVolume = Math.max(-70, Math.min(12, this.deviceState.mixVolume + direction));
        let dbStr;
        if (newVolume < 0) {
            dbStr = `-${Math.abs(newVolume)}`;
        } else if (newVolume === 0) {
            dbStr = '0';
        } else {
            dbStr = `${newVolume}`;
        }
        this.sendToNeets(`MIXVOL=${dbStr}`);
        this.sendToNeets('MIXVOL=?');
    }
    
    adjustInputGain(inputNum, direction) {
        const currentGain = this.deviceState.inputGains[inputNum - 1] || 0;
        const newGain = Math.max(-12, Math.min(12, currentGain + direction));
        let dbStr;
        if (newGain < 0) {
            dbStr = `-${Math.abs(newGain)}`;
        } else if (newGain === 0) {
            dbStr = '0';
        } else {
            dbStr = `+${newGain}`;
        }
        this.sendToNeets(`SETTINGS=INPUT,INPUT=${inputNum},GAIN=${dbStr}`);
        this.sendToNeets(`SETTINGS=INPUT,INPUT=${inputNum},GAIN=?`);
    }
    
    adjustEq(band, direction) {
        const currentEq = this.deviceState[`eq${band.charAt(0).toUpperCase() + band.slice(1)}`] || 0;
        const newEq = Math.max(-12, Math.min(12, currentEq + direction));
        let dbStr;
        if (newEq < 0) {
            dbStr = `-${Math.abs(newEq)}`;
        } else if (newEq === 0) {
            dbStr = '0';
        } else {
            dbStr = `+${newEq}`;
        }
        const eqCommand = `EQ${band.toUpperCase()}`;
        this.sendToNeets(`SETTINGS=OUTPUT,${eqCommand}=${dbStr}`);
        this.sendToNeets(`SETTINGS=OUTPUT,${eqCommand}=?`);
    }
    
    requestAllStatus() {
        // Request all status information
        this.sendToNeets('POWER=?');
        setTimeout(() => this.sendToNeets('VOL=?'), 100);
        setTimeout(() => this.sendToNeets('INPUT=?'), 200);
        setTimeout(() => this.sendToNeets('MUTE=?'), 300);
        setTimeout(() => this.sendToNeets('SETTINGS=INPUT,INPUT=1,MIX=?'), 400);
        setTimeout(() => this.sendToNeets('MIXVOL=?'), 500);
        setTimeout(() => this.sendToNeets('MIXMUTE=?'), 600);
        setTimeout(() => this.sendToNeets('SETTINGS=INPUT,INPUT=1,GAIN=?'), 700);
        setTimeout(() => this.sendToNeets('SETTINGS=INPUT,INPUT=2,GAIN=?'), 800);
        setTimeout(() => this.sendToNeets('SETTINGS=INPUT,INPUT=3,GAIN=?'), 900);
        setTimeout(() => this.sendToNeets('SETTINGS=INPUT,INPUT=4,GAIN=?'), 1000);
        setTimeout(() => this.sendToNeets('SETTINGS=OUTPUT,EQLOW=?'), 1100);
        setTimeout(() => this.sendToNeets('SETTINGS=OUTPUT,EQMID=?'), 1200);
        setTimeout(() => this.sendToNeets('SETTINGS=OUTPUT,EQHIGH=?'), 1300);
    }
    
    startPolling() {
        // Poll status every 5 seconds to keep state updated
        this.pollTimer = setInterval(() => {
            if (this.isConnected) {
                this.sendToNeets('POWER=?');
                setTimeout(() => this.sendToNeets('VOL=?'), 100);
                setTimeout(() => this.sendToNeets('INPUT=?'), 200);
            }
        }, this.config.pollInterval);
    }
    
    sendStateUpdate(client) {
        const stateMessage = {
            type: 'state_update',
            state: {
                ...this.deviceState,
                // Format display values
                volumeDb: this.formatDbValue(this.deviceState.volume),
                mixVolumeDb: this.formatDbValue(this.deviceState.mixVolume),
                inputGainsDb: this.deviceState.inputGains.map(gain => this.formatDbValue(gain)),
                eqLowDb: this.formatDbValue(this.deviceState.eqLow),
                eqMidDb: this.formatDbValue(this.deviceState.eqMid),
                eqHighDb: this.formatDbValue(this.deviceState.eqHigh)
            },
            timestamp: new Date().toISOString()
        };
        
        client.send(JSON.stringify(stateMessage));
    }
    
    formatDbValue(value) {
        if (value > 0) {
            return `+${value}dB`;
        } else if (value === 0) {
            return '0dB';
        } else {
            return `${value}dB`;
        }
    }
    
    broadcastStateUpdate() {
        const stateMessage = {
            type: 'state_update',
            state: {
                ...this.deviceState,
                // Format display values
                volumeDb: this.formatDbValue(this.deviceState.volume),
                mixVolumeDb: this.formatDbValue(this.deviceState.mixVolume),
                inputGainsDb: this.deviceState.inputGains.map(gain => this.formatDbValue(gain)),
                eqLowDb: this.formatDbValue(this.deviceState.eqLow),
                eqMidDb: this.formatDbValue(this.deviceState.eqMid),
                eqHighDb: this.formatDbValue(this.deviceState.eqHigh)
            },
            timestamp: new Date().toISOString()
        };
        
        const messageStr = JSON.stringify(stateMessage);
        
        this.wsClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
    
    cleanup() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        if (this.neetsClient) {
            this.neetsClient.destroy();
        }
        if (this.wsServer) {
            this.wsServer.close();
        }
    }
}

// Start the bridge
const bridge = new NeetsAmpDirectBridge();

module.exports = NeetsAmpDirectBridge;
