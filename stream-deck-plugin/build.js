// Simple build script for NEETS Bridge Plugin
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const pluginName = 'com.neets.bridge.sdPlugin';
const buildDir = './build';
const sourceDir = './';

console.log('🚀 Building NEETS Bridge Stream Deck Plugin...');

// Create build directory
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
    console.log('📁 Created build directory');
}

// Create zip archive
const output = fs.createWriteStream(path.join(buildDir, pluginName));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function() {
    console.log(`✅ Plugin built successfully!`);
    console.log(`📦 Size: ${(archive.pointer() / 1024).toFixed(1)} KB`);
    console.log(`📂 Output: ${path.join(buildDir, pluginName)}`);
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Double-click the .sdPlugin file to install');
    console.log('2. Restart Stream Deck software');
    console.log('3. Find "NEETS Bridge" in the plugin list');
});

output.on('error', function(err) {
    console.error('❌ Build failed:', err);
});

archive.on('error', function(err) {
    console.error('❌ Archive error:', err);
    throw err;
});

archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
        console.warn('⚠️ Warning:', err.message);
    } else {
        throw err;
    }
});

archive.pipe(output);

// Add core files to archive
console.log('📄 Adding core files...');
archive.file('manifest.json', { name: 'manifest.json' });
archive.file('app.html', { name: 'app.html' });
archive.file('app.js', { name: 'app.js' });
archive.file('property-inspector.html', { name: 'property-inspector.html' });
archive.file('property-inspector.js', { name: 'property-inspector.js' });

// Add images directory
console.log('🖼️ Adding images...');
archive.directory('images/', 'images/');

// Check for optional files
const optionalFiles = ['README.md', 'LICENSE'];
optionalFiles.forEach(file => {
    if (fs.existsSync(file)) {
        archive.file(file, { name: file });
        console.log(`📄 Added optional file: ${file}`);
    }
});

console.log('📦 Finalizing archive...');
archive.finalize();
