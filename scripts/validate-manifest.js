import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve('manifest.json');
const firefoxManifestPath = path.resolve('manifest.firefox.json');

console.log('🔍 Validating manifests...');

if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`✅ manifest.json found (v${manifest.version})`);
} else {
    console.error('❌ manifest.json missing!');
    process.exit(1);
}

if (fs.existsSync(firefoxManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));
    console.log(`✅ manifest.firefox.json found (v${manifest.version})`);
} else {
    console.warn('⚠️ manifest.firefox.json missing (optional)');
}

console.log('✨ Validation complete.');
