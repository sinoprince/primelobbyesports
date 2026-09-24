require('dotenv').config();
const { fork } = require('child_process');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Launching Prime Lobby Esports Dual-Bot System');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 1. Launch Main Community & Tournament Bot
const mainBotPath = path.join(__dirname, 'index.js');
const mainBot = fork(mainBotPath);

mainBot.on('exit', (code) => {
  console.log(`[MainBot] Process exited with code ${code}`);
});

// 2. Launch Dedicated Payment Bot (Prime Pay)
let payBot = null;
if (process.env.PAYMENT_BOT_TOKEN) {
  const payBotPath = path.join(__dirname, '../payment-bot/src/index.js');
  payBot = fork(payBotPath);

  payBot.on('exit', (code) => {
    console.log(`[PaymentBot] Process exited with code ${code}`);
  });
} else {
  console.log('ℹ️ PAYMENT_BOT_TOKEN not found. Running payment features inside Main Bot.');
}

// 3. Launch Web Tournament Management Software
const webServerPath = path.join(__dirname, 'web/server.js');
const webServer = fork(webServerPath);

webServer.on('exit', (code) => {
  console.log(`[WebServer] Process exited with code ${code}`);
});

// Clean termination handling
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down all bot & web instances...');
  if (mainBot) mainBot.kill();
  if (payBot) payBot.kill();
  if (webServer) webServer.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating all bot & web instances...');
  if (mainBot) mainBot.kill();
  if (payBot) payBot.kill();
  if (webServer) webServer.kill();
  process.exit(0);
});
