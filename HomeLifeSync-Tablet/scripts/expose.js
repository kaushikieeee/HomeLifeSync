const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.resolve(__dirname, '../../../elder/lib/config.ts');
const ELDER_APP_PATH = path.resolve(__dirname, '../../../elder');

(async () => {
  console.log('🚀 Starting LocalTunnel...');
  
  const tunnel = await localtunnel({ port: 3001 });

  console.log(`✅ Tunnel Active: ${tunnel.url}`);

  // 1. Read the Config File
  let configContent = fs.readFileSync(CONFIG_PATH, 'utf8');

  // 2. Replace the Server URL
  // Regex to find: const SERVER_URL = '...';
  const newConfig = configContent.replace(
    /const SERVER_URL = '.*';/,
    `const SERVER_URL = '${tunnel.url}';`
  );

  fs.writeFileSync(CONFIG_PATH, newConfig);
  console.log('🔄 Updated Elder App Config with new URL.');

  // 3. Re-sync Capacitor (to copy the new config to the Android project)
  console.log('📱 Syncing Elder App (this may take a moment)...');
  try {
    execSync('npx cap copy', { cwd: ELDER_APP_PATH, stdio: 'inherit' });
    console.log('✨ Done! You can now run the app in Android Studio.');
  } catch (e) {
    console.error('❌ Failed to sync Capacitor:', e);
  }

  console.log('\n⚠️  KEEP THIS TERMINAL OPEN to keep the connection alive!');
  console.log('   If you close this, the URL will stop working.\n');

  tunnel.on('close', () => {
    console.log('Tunnel closed');
  });
})();
