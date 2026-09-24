const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

// In-memory rate limiting and message history cache
const userMessageHistory = new Map(); // userId -> array of timestamps
const userLastMessage = new Map();    // userId -> { content, count }

// Known phishing and scam patterns
const SCAM_PATTERNS = [
  /discord(?:app)?\.(?:gift|nitro|gg|xyz|top|me|link|club|store|info|ru|live)/i,
  /discorcl\.(?:com|gift|net|org|xyz)/i,
  /dlscord\.(?:com|gift|net|org|xyz)/i,
  /discord-[a-z0-9]+\.(?:com|gift|net|org|xyz)/i,
  /free-nitro\.[a-z]+/i,
  /steamcommunity-[a-z0-9]+\.[a-z]+/i,
  /steam-gift\.[a-z]+/i,
  /steamcommunity\.(?:link|top|ru|xyz|gift)/i,
  /claim.*nitro.*(?:free|here|gift)/i,
  /@everyone.*(?:free|steam|nitro|airdrop|crypto|claim|gift)/i
];

const DISCORD_INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discordapp\.com\/invite)\/([a-zA-Z0-9\-]+)/i;

const securityHandler = {
  /**
   * Main message inspector for anti-scam, anti-phishing, and anti-spam protection.
   * @param {import('discord.js').Message} message
   * @returns {Promise<boolean>} True if message was deleted/blocked as malicious, false otherwise
   */
  handleMessage: async (message) => {
    // Ignore bot messages, DMs, or webhook messages
    if (!message.guild || message.author.bot || message.webhookId) return false;

    // Check if author is server administrator or moderator
    const member = message.member;
    if (member) {
      const hasPerm = member.permissions && typeof member.permissions.has === 'function';
      const isAdminPerm = hasPerm && (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageMessages)
      );
      const rolesArray = member.roles?.cache ? Array.from(member.roles.cache.values()) : [];
      const isStaffRole = rolesArray.some(r => r.name && r.name.toLowerCase() === config.roles.admin.toLowerCase());
      if (isAdminPerm || isStaffRole) return false; // Whitelist staff
    }

    const content = message.content || '';
    const now = Date.now();
    const userId = message.author.id;

    // 1. Phishing & Scam Link Detection
    for (const pattern of SCAM_PATTERNS) {
      if (pattern.test(content)) {
        await securityHandler.handleScamViolation(message, 'Suspected Phishing / Nitro / Steam Scam Link');
        return true;
      }
    }

    // 2. Unauthorized Discord Server Invite Spam
    if (DISCORD_INVITE_PATTERN.test(content)) {
      // Check if user has Member or Staff role
      const rolesArray = member?.roles?.cache ? Array.from(member.roles.cache.values()) : [];
      const hasMemberRole = rolesArray.some(
        r => r.name && r.name.toLowerCase() === config.roles.member.toLowerCase()
      );
      if (!hasMemberRole) {
        await securityHandler.handleInviteSpam(message);
        return true;
      }
    }

    // 3. Anti-Spam & Message Flood Rate Limiter (Max 5 messages in 4 seconds)
    let timestamps = userMessageHistory.get(userId) || [];
    // Keep only timestamps from the last 4 seconds
    timestamps = timestamps.filter(ts => now - ts < 4000);
    timestamps.push(now);
    userMessageHistory.set(userId, timestamps);

    if (timestamps.length >= 5) {
      await securityHandler.handleFloodSpam(message);
      return true;
    }

    // 4. Duplicate Message Spam Protection (3 identical messages in a row)
    const lastMsg = userLastMessage.get(userId);
    if (lastMsg && lastMsg.content === content && content.length > 5) {
      lastMsg.count += 1;
      if (lastMsg.count >= 3) {
        await securityHandler.handleDuplicateSpam(message);
        return true;
      }
    } else {
      userLastMessage.set(userId, { content, count: 1 });
    }

    return false;
  },

  /**
   * Action when scam/phishing link is detected.
   */
  handleScamViolation: async (message, reason) => {
    try {
      await message.delete().catch(() => null);

      // Timeout the malicious account for 1 hour to prevent mass compromise
      if (message.member && message.member.moderatable && typeof message.member.timeout === 'function') {
        await message.member.timeout(60 * 60 * 1000, `Automated Security: ${reason}`).catch(() => null);
      }

      // Send DM warning to the user
      await message.author.send({
        content: `⚠️ **Security Alert from ${message.guild.name}:**\nYour message was automatically removed because it contained a detected scam or phishing link (\`${reason}\`).\nIf your Discord account was compromised, please immediately change your Discord password and enable 2FA.`
      }).catch(() => null);

      // Log alert to staff moderation channel
      await securityHandler.logSecurityIncident(message.guild, {
        title: '🛡️ Automated Scam Link Neutralized',
        user: message.author,
        channel: message.channel,
        reason: reason,
        content: message.content,
        action: 'Message deleted & user timed out for 1 hour'
      });
    } catch (err) {
      console.error('[SecurityHandler] Error handling scam violation:', err);
    }
  },

  /**
   * Action when unauthorized invite spam is detected.
   */
  handleInviteSpam: async (message) => {
    try {
      await message.delete().catch(() => null);

      await message.author.send({
        content: `⚠️ **Notice from ${message.guild.name}:** External Discord server invites are restricted to verified community members only. Please verify your membership in \`#verification\` first!`
      }).catch(() => null);

      await securityHandler.logSecurityIncident(message.guild, {
        title: '🚫 Unauthorized Invite Link Removed',
        user: message.author,
        channel: message.channel,
        reason: 'Unverified member posted external invite link',
        content: message.content,
        action: 'Message deleted & warning sent'
      });
    } catch (err) {
      console.error('[SecurityHandler] Error handling invite spam:', err);
    }
  },

  /**
   * Action when message flooding is detected.
   */
  handleFloodSpam: async (message) => {
    try {
      await message.delete().catch(() => null);

      // Apply short timeout (1 minute) to stop spam script
      if (message.member && message.member.moderatable) {
        await message.member.timeout(60 * 1000, 'Automated Anti-Spam: Message flooding').catch(() => null);
      }

      const warnMsg = await message.channel.send({
        content: `⚠️ <@${message.author.id}>, please slow down! You are sending messages too quickly.`
      }).catch(() => null);

      if (warnMsg) {
        setTimeout(() => warnMsg.delete().catch(() => null), 5000);
      }

      // Reset timestamps
      userMessageHistory.delete(message.author.id);
    } catch (err) {
      console.error('[SecurityHandler] Error handling flood spam:', err);
    }
  },

  /**
   * Action when duplicate message spam is detected.
   */
  handleDuplicateSpam: async (message) => {
    try {
      await message.delete().catch(() => null);
      userLastMessage.delete(message.author.id);

      const warnMsg = await message.channel.send({
        content: `⚠️ <@${message.author.id}>, please do not repeat identical messages.`
      }).catch(() => null);

      if (warnMsg) {
        setTimeout(() => warnMsg.delete().catch(() => null), 5000);
      }
    } catch (err) {
      console.error('[SecurityHandler] Error handling duplicate spam:', err);
    }
  },

  /**
   * Logs a security action to the mod-log or admin channel.
   */
  logSecurityIncident: async (guild, info) => {
    try {
      if (!guild || !guild.channels || !guild.channels.cache) return;
      const logChannel = typeof guild.channels.cache.find === 'function' ? guild.channels.cache.find(
        c => c.name === 'mod-logs' || c.name === '🛡️-payment-verification' || c.name === 'admin-logs'
      ) : null;
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle(info.title)
        .addFields(
          { name: '👤 User', value: `<@${info.user.id}> (\`${info.user.tag}\` / \`${info.user.id}\`)`, inline: true },
          { name: '📍 Channel', value: `<#${info.channel.id}>`, inline: true },
          { name: '⚖️ Action Taken', value: `\`${info.action}\``, inline: false },
          { name: '📝 Reason', value: info.reason, inline: false },
          { name: '💬 Flagged Content', value: `\`\`\`\n${(info.content || 'N/A').substring(0, 500)}\n\`\`\``, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Prime Lobby eSports Automated Security Sentinel' });

      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[SecurityHandler] Error logging incident:', err);
    }
  }
};

module.exports = securityHandler;
