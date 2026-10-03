require('dotenv').config();
const { fork } = require('child_process');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Launching Prime Lobby Esports #8842 Unified Tournament & Broadcast Bot');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

let isShuttingDown = false;

// Helper to spawn a managed child process with automatic respawn
function spawnManagedProcess(name, scriptPath, restartDelay = 3000) {
  let child = null;

  function start() {
    if (isShuttingDown) return;
    console.log(`[Supervisor] Starting ${name}...`);
    child = fork(scriptPath, [], { env: process.env });

    child.on('exit', (code, signal) => {
      console.log(`[${name}] Process exited with code ${code}, signal: ${signal}`);
      if (!isShuttingDown) {
        console.log(`[Supervisor] 🔄 Restarting ${name} in ${restartDelay / 1000}s...`);
        setTimeout(start, restartDelay);
      }
    });

    child.on('error', (err) => {
      console.error(`[${name}] Encountered error:`, err);
    });
  }

  start();
  return {
    kill: () => {
      if (child) child.kill();
    }
  };
}

// 1. Launch Unified Prime Lobby Esports Bot (#8842)
const mainBot = spawnManagedProcess('PrimeLobbyBot', path.join(__dirname, 'index.js'));

// 3. Launch Web Tournament Management Software
const webServer = spawnManagedProcess('WebServer', path.join(__dirname, 'web/server.js'));

// Clean termination handling
process.on('SIGINT', () => {
  isShuttingDown = true;
  console.log('\n🛑 Shutting down all bot & web instances...');
  if (mainBot) mainBot.kill();
  if (webServer) webServer.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  isShuttingDown = true;
  console.log('\n🛑 Terminating all bot & web instances...');
  if (mainBot) mainBot.kill();
  if (webServer) webServer.kill();
  process.exit(0);
});
