// Container-friendly installer for NEETS Bridge Plugin
const fs = require('fs');
const path = require('path');

const pluginFile = 'com.neets.bridge.sdPlugin';
const buildPath = path.join('stream-deck-plugin', 'build', pluginFile);

console.log('🐳 NEETS Bridge Plugin - Container Installation Helper');
console.log('');

// Check if plugin file exists
if (!fs.existsSync(buildPath)) {
    console.error('❌ Plugin file not found!');
    console.log('');
    console.log('🔧 First run: npm run build-plugin');
    process.exit(1);
}

// Get file size
const stats = fs.statSync(buildPath);
const fileSizeKB = (stats.size / 1024).toFixed(1);

console.log('✅ Plugin file ready!');
console.log(`📦 File: ${buildPath}`);
console.log(`📏 Size: ${fileSizeKB} KB`);
console.log('');
console.log('🎯 INSTALLATION STEPS:');
console.log('');
console.log('1. 📁 Navigate to your project folder');
console.log('2. 🔍 Find: stream-deck-plugin/build/com.neets.bridge.sdPlugin');
console.log('3. 🖱️  Double-click the .sdPlugin file');
console.log('4. 🚀 Stream Deck software will open and install it');
console.log('5. 🔄 Restart Stream Deck software');
console.log('6. 🎮 Look for "NEETS Bridge" in the plugin list');
console.log('');
console.log('📋 CONFIGURATION:');
console.log('• Drag buttons to your Stream Deck');
console.log('• Click each button to configure settings');
console.log('• Set your NEETS Bridge host/port');
console.log('• Test connection in settings panel');
console.log('');
console.log('🆘 TROUBLESHOOTING:');
console.log('• If install fails: Right-click → "Open with Stream Deck"');
console.log('• If buttons don\'t work: Check NEETS Bridge is running');
console.log('• If no connection: Verify host/port in button settings');
console.log('');
console.log('🎉 Ready to control your NEETS Amp!');
