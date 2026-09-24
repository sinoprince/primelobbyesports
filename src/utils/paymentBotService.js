const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');

let paymentClient = null;
let isInitializing = false;

const paymentBotService = {
  /**
   * Initializes the Payment Bot client singleton inside the host process.
   */
  init: () => {
    if (paymentClient && paymentClient.isReady()) return paymentClient;
    if (isInitializing) return paymentClient;

    const token = process.env.PAYMENT_BOT_TOKEN;
    if (!token) {
      console.warn('[PaymentBotService] No PAYMENT_BOT_TOKEN found. DMs will fall back to main bot.');
      return null;
    }

    isInitializing = true;
    paymentClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
      ],
      partials: [Partials.Channel, Partials.User, Partials.Message]
    });

    paymentClient.once('ready', () => {
      console.log(`[PaymentBotService] Payment Bot Client ready as ${paymentClient.user.tag} (${paymentClient.user.id})`);
      isInitializing = false;
    });

    paymentClient.on('error', (err) => {
      console.error('[PaymentBotService] Error in payment client:', err.message);
    });

    paymentClient.login(token).catch(err => {
      console.error('[PaymentBotService] Login failed:', err.message);
      isInitializing = false;
    });

    return paymentClient;
  },

  /**
   * Returns the Payment Bot client instance.
   */
  getClient: () => {
    if (!paymentClient) {
      paymentBotService.init();
    }
    return paymentClient;
  },

  /**
   * Sends a Direct Message to a user explicitly using the Payment Bot.
   * @param {string} userId - The Discord user ID.
   * @param {object} payload - Message options (embeds, components, files, content).
   * @param {Client} [fallbackClient] - Main bot client if Payment Bot is unavailable.
   * @returns {Promise<{ success: boolean, message?: any, error?: string, code?: number, sender?: string }>}
   */
  sendDm: async (userId, payload, fallbackClient = null) => {
    try {
      const client = paymentBotService.getClient();

      // Wait a short moment if client is currently logging in
      if (client && !client.isReady() && isInitializing) {
        await new Promise(resolve => {
          const timeout = setTimeout(resolve, 3000);
          client.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      if (client && client.isReady()) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          const sent = await user.send(payload);
          console.log(`[PaymentBotService] Successfully sent DM to ${user.tag} (${userId}) via ${client.user.tag}`);
          return { success: true, message: sent, sender: client.user.tag };
        }
      }

      // If client not ready, try Discord REST API as Payment Bot
      const token = process.env.PAYMENT_BOT_TOKEN;
      if (token) {
        try {
          const rest = new REST({ version: '10' }).setToken(token);
          const dmChannel = await rest.post(Routes.userChannels(), {
            body: { recipient_id: userId }
          });
          if (dmChannel && dmChannel.id) {
            const body = {};
            if (payload.content) body.content = payload.content;
            if (payload.embeds) body.embeds = payload.embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e));
            if (payload.components) body.components = payload.components.map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c));
            const sent = await rest.post(Routes.channelMessages(dmChannel.id), { body });
            console.log(`[PaymentBotService] Successfully sent DM to ${userId} via Payment Bot REST API`);
            return { success: true, message: sent, sender: 'PLE Payments Bot (REST)' };
          }
        } catch (restErr) {
          console.warn('[PaymentBotService] REST delivery failed:', restErr.message);
        }
      }

      // Fallback to main client if payment bot is completely unreachable
      if (fallbackClient) {
        const fallbackUser = await fallbackClient.users.fetch(userId).catch(() => null);
        if (fallbackUser) {
          const sent = await fallbackUser.send(payload);
          console.log(`[PaymentBotService] Sent DM via fallback main bot to ${userId}`);
          return { success: true, message: sent, sender: fallbackClient.user.tag };
        }
      }

      return { success: false, error: 'Payment bot client is not available' };
    } catch (err) {
      console.error(`[PaymentBotService] Failed to send DM to ${userId}:`, err.message);
      return { success: false, error: err.message, code: err.code };
    }
  }
};

module.exports = paymentBotService;
