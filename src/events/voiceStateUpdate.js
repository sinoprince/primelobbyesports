const voiceHandler = require('../handlers/voiceHandler');

module.exports = {
  name: 'voiceStateUpdate',
  once: false,
  async execute(oldState, newState) {
    await voiceHandler.handleVoiceStateUpdate(oldState, newState);
  }
};
