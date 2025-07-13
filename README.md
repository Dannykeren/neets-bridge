# NEETS Amp 2:25 Direct Bridge

A comprehensive WebSocket bridge for controlling NEETS Amp 2:25 directly via TCP with full Stream Deck integration and real-time feedback support.

## 🎯 Architecture

**Direct Connection**: Raspberry Pi ↔ NEETS Amp 2:25 (TCP Port 5000)

- **Direct TCP communication** with NEETS Amp
- **Real-time feedback** and state synchronization
- **Stream Deck integration** with live status updates
- **Docker deployment** on Raspberry Pi

## 📋 Prerequisites

- **Raspberry Pi** (4B recommended) with Docker
- **NEETS Amp 2:25** with network connectivity
- **Stream Deck** with Elgato Stream Deck software
- **Network access** between all devices

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/Dannykeren/neets-bridge.git
cd neets-bridge
cp .env.example .env
```

### 2. Configure NEETS Amp IP Address

Edit `.env` file with your NEETS Amp settings:

```bash
# ⚠️ IMPORTANT: Set your NEETS Amp IP address here
NEETS_HOST=192.168.10.109
NEETS_PORT=5000

# Bridge server ports  
WS_PORT=8080
WEB_PORT=3000
```

**⚠️ CRITICAL**: You MUST set `NEETS_HOST` to your actual NEETS Amp IP address!

### 3. Find Your NEETS Amp IP Address

If you don't know your NEETS Amp IP address:

```bash
# Scan your network (replace with your network range)
nmap -sn 192.168.1.0/24

# Or check your router's admin interface for connected devices
# Look for device named "NEETS" or similar
```

### 4. Deploy with Docker

```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f neets-bridge

# Check health
docker-compose exec neets-bridge npm run health
```

### 5. Install Stream Deck Plugin

1. Copy the plugin folder to Stream Deck plugins directory:
   - **Windows**: `%appdata%\Elgato\StreamDeck\Plugins\`
   - **macOS**: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`

2. Restart Stream Deck software

3. Add NEETS actions to your Stream Deck

## 🔧 NEETS Amp Integration

### TCP Communication Protocol

The bridge communicates with NEETS Amp using TCP on port 5000 with commands in format:
`NEUNIT=1,COMMAND\r`

### Supported Commands

#### Power Control:
- `NEUNIT=1,POWER=ON\r` - Power on
- `NEUNIT=1,POWER=OFF\r` - Power off
- `NEUNIT=1,POWER=?\r` - Query power status

#### Volume Control:
- `NEUNIT=1,VOL=0\r` - Set volume to 0dB
- `NEUNIT=1,VOL=-20\r` - Set volume to -20dB
- `NEUNIT=1,VOL=?\r` - Query current volume

#### Source Selection:
- `NEUNIT=1,INPUT=1\r` - Select source 1
- `NEUNIT=1,INPUT=2\r` - Select source 2
- `NEUNIT=1,INPUT=?\r` - Query current source

#### Mute Control:
- `NEUNIT=1,MUTE=ON\r` - Mute on
- `NEUNIT=1,MUTE=OFF\r` - Mute off
- `NEUNIT=1,MUTE=?\r` - Query mute status

#### Input Gain Control:
- `NEUNIT=1,SETTINGS=INPUT,INPUT=1,GAIN=+5\r` - Set input 1 gain to +5dB
- `NEUNIT=1,SETTINGS=INPUT,INPUT=1,GAIN=?\r` - Query input 1 gain

#### EQ Control:
- `NEUNIT=1,SETTINGS=OUTPUT,EQLOW=+2\r` - Set low EQ to +2dB
- `NEUNIT=1,SETTINGS=OUTPUT,EQLOW=?\r` - Query low EQ

## 📡 API Reference

### WebSocket Connection

Connect to: `ws://raspberry-pi-ip:8080`

### Commands

```javascript
// Power control
{ "action": "power_on" }
{ "action": "power_off" }
{ "action": "power_toggle" }

// Source selection
{ "action": "source_select", "source": 1-5 }

// Volume control
{ "action": "volume_up" }
{ "action": "volume_down" }
{ "action": "volume_set", "value": -20 }
{ "action": "mute_toggle" }

// Mix controls
{ "action": "mix_mode_toggle" }
{ "action": "mix_volume_up" }
{ "action": "mix_volume_down" }
{ "action": "mix_mute_toggle" }

// Input gain control
{ "action": "input_gain_up", "input": 1-4 }
{ "action": "input_gain_down", "input": 1-4 }

// EQ control
{ "action": "eq_adjust", "band": "low|mid|high", "direction": "up|down" }

// Status
{ "action": "get_state" }
{ "action": "poll_status" }
```

### State Updates

The bridge sends real-time state updates:

```javascript
{
  "type": "state_update",
  "state": {
    "connected": true,
    "power": true,
    "source": 2,
    "volume": -20,
    "volumeDb": "-20dB",
    "volumePercent": 50,
    "mute": false,
    "mixMode": true,
    "mixVolume": -40,
    "mixVolumeDb": "-40dB",
    "mixVolumePercent": 25,
    "mixMute": false,
    "inputGains": [0, 0, 0, 0],
    "inputGainsDb": ["0dB", "0dB", "0dB", "0dB"],
    "inputGainsPercent": [50, 50, 50, 50],
    "eqLow": 2,
    "eqMid": 0,
    "eqHigh": -1,
    "eqLowDb": "+2dB",
    "eqMidDb": "0dB", 
    "eqHighDb": "-1dB"
  },
  "timestamp": "2025-01-21T10:30:00.000Z"
}
```

## 🎛️ Stream Deck Actions

### Available Actions:

1. **Power Control** - Toggle with status indication
2. **Source Selection** (1-5) - Buttons highlight when active
3. **Volume Control** - Up/Down/Display with mute toggle
4. **Mute Toggle** - Visual mute indication
5. **Mix Mode** - Toggle with status
6. **Mix Volume** - Separate mix volume controls
7. **Input Gains** (1-4) - Individual input gain controls
8. **EQ Controls** - Low/Mid/High frequency adjustment
9. **Status Display** - Connection and device status
10. **Presets** - Meeting and presentation presets

### Button States:

- **Active/Inactive** states for sources
- **On/Off** states for power, mute, mix mode
- **Real-time value display** for volumes and gains
- **Connection status** indication

## 🔍 Troubleshooting

### Common Issues:

#### 1. Stream Deck Not Connecting
```bash
# Check bridge is running
docker-compose ps

# Check WebSocket port
netstat -an | grep 8080

# Check logs
docker-compose logs neets-bridge
```

#### 2. NEETS Amp Connection Issues
```bash
# Test TCP connection
telnet <neets-amp-ip> 5000

# Check bridge logs for connection errors
docker-compose logs neets-bridge | grep -i error

# Verify NEETS amp is powered on and networked
```

#### 3. No Feedback from NEETS Amp
- Verify NEETS amp is powered on
- Check network connectivity between Raspberry Pi and amp
- Ensure TCP port 5000 is open on the amp
- Check amp's network configuration

#### 4. Stream Deck Buttons Not Updating
- Check WebSocket connection in browser console
- Verify bridge is receiving NEETS feedback (check logs)
- Restart Stream Deck software
- Re-add plugin actions

### Debug Mode:

```bash
# Enable verbose logging
echo "DEBUG=true" >> .env
echo "VERBOSE_LOGGING=true" >> .env

# Restart with debug logging
docker-compose restart neets-bridge

# Watch detailed logs
docker-compose logs -f neets-bridge
```

## 📊 Monitoring

### Health Checks:

```bash
# Manual health check
docker-compose exec neets-bridge npm run health

# View health status
curl http://localhost:3000/health

# Check connection status
curl http://localhost:3000/api/status
```

### Log Files:

```bash
# View application logs
docker-compose exec neets-bridge tail -f /app/logs/neets-bridge.log

# View error logs
docker-compose exec neets-bridge tail -f /app/logs/error.log
```

## 🛠️ Development

### Local Development:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Testing WebSocket Connection:

```javascript
// Browser console test
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data));
ws.send(JSON.stringify({ action: 'get_state' }));
```

## 📝 Configuration

### Advanced Configuration:

The bridge supports extensive configuration via environment variables:

- **Connection settings**: Timeouts, retry attempts, delays
- **Logging**: Levels, file rotation, formats  
- **Security**: Rate limiting, CORS, authentication
- **Monitoring**: Health checks, metrics, alerts

See `.env.example` for complete configuration options.

## 🚀 Deployment

### Production Deployment:

1. **Security**: Change default passwords, enable HTTPS
2. **Monitoring**: Set up log aggregation and alerting
3. **Backup**: Configure data persistence and backups
4. **Updates**: Set up automated updates and rollback procedures

### Docker Compose Services:

- **neets-bridge**: Main application
- **neets-web**: Optional web interface
- **mosquitto**: MQTT broker for additional integrations
- **influxdb**: Time-series database for logging
- **grafana**: Visualization and dashboards

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## 📞 Support

- **Issues**: Use GitHub Issues for bug reports
- **Discussions**: Use GitHub Discussions for questions
- **Email**: Contact for commercial support
