const roleHandler = require('../handlers/roleHandler');
const ticketHandler = require('../handlers/ticketHandler');
const { dbQueries } = require('../database/db');
const config = require('../../config.json');

module.exports = {
  name: 'messageReactionAdd',
  once: false,
  async execute(reaction, user) {
    if (user.bot) return;

    // Handle partials (uncached messages/reactions)
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('[ReactionHandler] Error fetching partial reaction:', error);
        return;
      }
    }

    const message = reaction.message;
    const guild = message.guild;
    if (!guild) return;

    const settings = dbQueries.getGuildSettings(guild.id) || {};
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // 1. Rules Confirmation Message Reaction (Visitor -> Member)
    const isRulesMessage = settings.rules_message_id === message.id;
    if (isRulesMessage && (reaction.emoji.name === config.emojis.verify || reaction.emoji.name === '✅')) {
      console.log(`[ReactionHandler] ${user.tag} reacted to Rules message.`);
      await roleHandler.verifyAndPromoteToMember(member);
      return;
    }

    // 2. Ticket Desk Reaction (Opens private ticket channel)
    const isTicketMessage = settings.ticket_panel_message_id === message.id;
    if (isTicketMessage && (reaction.emoji.name === config.emojis.ticket || reaction.emoji.name === '📩' || reaction.emoji.name === '🎫')) {
      console.log(`[ReactionHandler] ${user.tag} reacted to Ticket Panel.`);
      
      // Remove user reaction to keep panel clean
      await reaction.users.remove(user.id).catch(() => null);

      // Create ticket
      const res = await ticketHandler.createTicketChannel(guild, member, 'General Support');
      if (!res.success) {
        // Send ephemeral DM if possible
        try {
          await user.send(`❌ Could not open ticket: ${res.message}`);
        } catch {
          // Ignore DM errors
        }
      }
    }
  }
};
