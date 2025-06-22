// healthcheck.js - Health check script for Docker container
const WebSocket = require('ws');
const net = require('net');

const config = {
    wsPort: process.env.WS_PORT || 8080,
    neetsHost: process.env.NEETS_HOST || '192.168.10.109',
    neetsPort: process.env.NEETS_PORT || 5000,
    timeout: 5000
};

async function checkWebSocket() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${config.wsPort}`);
        
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
        }, config.timeout);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

async function checkNeetsConnection() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        
        const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error('NEETS connection timeout'));
        }, config.timeout);
        
        socket.connect(config.neetsPort, config.neetsHost, () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve(true);
        });
        
        socket.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

async function runHealthCheck() {
    const checks = {
        websocket: false,
        neets: false,
        timestamp: new Date().toISOString()
    };
    
    try {
        // Check WebSocket server
        await checkWebSocket();
        checks.websocket = true;
        console.log('✓ WebSocket server is healthy');
    } catch (error) {
        console.error('✗ WebSocket server check failed:', error.message);
    }
    
    try {
        // Check NEETS connection
        await checkNeetsConnection();
        checks.neets = true;
        console.log('✓ NEETS connection is healthy');
    } catch (error) {
        console.error('✗ NEETS connection check failed:', error.message);
    }
    
    // Determine overall health
    const isHealthy = checks.websocket; // WebSocket is critical, NEETS may be temporarily unavailable
    
    if (isHealthy) {
        console.log('✓ Overall health: HEALTHY');
        process.exit(0);
    } else {
        console.log('✗ Overall health: UNHEALTHY');
        process.exit(1);
    }
}

// Run the health check
runHealthCheck().catch((error) => {
    console.error('Health check failed:', error);
    process.exit(1);
});
