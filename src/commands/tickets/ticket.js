const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const ticketHandler = require('../../handlers/ticketHandler');
const voiceHandler = require('../../handlers/voiceHandler');
const embedBuilder = require('../../utils/embedBuilder');
const { dbQueries } = require('../../database/db');
const config = require('../../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Support ticket system operations')
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Admin: Post the Support Ticket Desk embed')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to post the ticket panel')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Close and archive the current support ticket')
    )
    .addSubcommand(sub =>
      sub
        .setName('claim')
        .setDescription('Staff: Claim this support ticket')
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Staff: Add another member to this private ticket')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('User to grant access to this ticket')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('unmute-voice')
        .setDescription('Admin: Unmute a user in the Support Voice Channel')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('User to unmute in the voice room')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('mute-voice')
        .setDescription('Admin: Re-mute a user in the Support Voice Channel')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('User to mute in the voice room')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;

    if (subcommand === 'panel') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '🚫 Only Admins can deploy the ticket panel.', ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      await ticketHandler.ensureTicketCategory(guild);

      const payload = embedBuilder.createTicketPanelEmbed();
      const panelMsg = await targetChannel.send(payload);
      await panelMsg.react(config.emojis.ticket).catch(() => null);

      dbQueries.updateGuildSettings(guild.id, { ticket_panel_message_id: panelMsg.id });

      return interaction.reply({
        content: `✅ Ticket Helpdesk panel posted in <#${targetChannel.id}>.`,
        ephemeral: true
      });
    }

    if (subcommand === 'close') {
      const isAdminOrStaff = member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        member.roles.cache.some(r =>
          r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
          r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
          r.name.toLowerCase() === 'support' ||
          r.name.toLowerCase().includes('support') ||
          r.name.toLowerCase().includes('staff') ||
          r.name.toLowerCase().includes('admin')
        );

      if (!isAdminOrStaff) {
        return interaction.reply({
          content: '🚫 Only Admins and Support Staff are authorized to close support tickets.',
          ephemeral: true
        });
      }

      const ticketRecord = dbQueries.getTicketByChannel(interaction.channel.id);
      if (!ticketRecord) {
        return interaction.reply({
          content: '❌ This channel is not recognized as an active support ticket.',
          ephemeral: true
        });
      }

      await interaction.reply({ content: '🔒 Closing ticket...' });
      await ticketHandler.closeTicket(interaction.channel, member);
    }

    if (subcommand === 'claim') {
      const isAdminOrStaff = member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages) ||
        member.roles.cache.some(r =>
          r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
          r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
          r.name.toLowerCase() === 'support' ||
          r.name.toLowerCase().includes('support') ||
          r.name.toLowerCase().includes('staff') ||
          r.name.toLowerCase().includes('admin')
        );

      if (!isAdminOrStaff) {
        return interaction.reply({
          content: '🚫 Only Admins and Support Staff can claim tickets.',
          ephemeral: true
        });
      }

      const ticketRecord = dbQueries.getTicketByChannel(interaction.channel.id);
      if (!ticketRecord) {
        return interaction.reply({
          content: '❌ This channel is not an active support ticket.',
          ephemeral: true
        });
      }

      await ticketHandler.claimTicket(interaction.channel, member);
      return interaction.reply({ content: '✅ You have claimed this ticket.', ephemeral: true });
    }

    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');
      const ticketRecord = dbQueries.getTicketByChannel(interaction.channel.id);
      if (!ticketRecord) {
        return interaction.reply({
          content: '❌ This command can only be used inside a support ticket channel.',
          ephemeral: true
        });
      }

      const isAdminOrStaff = member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        member.roles.cache.some(r =>
          r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
          r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
          r.name.toLowerCase() === 'support' ||
          r.name.toLowerCase().includes('support') ||
          r.name.toLowerCase().includes('staff') ||
          r.name.toLowerCase().includes('admin')
        );

      if (!isAdminOrStaff && ticketRecord.user_id !== member.id) {
        return interaction.reply({
          content: '🚫 Only Support Staff or the ticket owner can add users to this ticket.',
          ephemeral: true
        });
      }

      await interaction.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
      });

      return interaction.reply({
        content: `✅ Added <@${targetUser.id}> to this ticket.`
      });
    }

    if (subcommand === 'unmute-voice') {
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.some(r =>
          r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
          r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
          r.name.toLowerCase() === 'support' ||
          r.name.toLowerCase().includes('support') ||
          r.name.toLowerCase().includes('staff') ||
          r.name.toLowerCase().includes('admin')
        );

      if (!isAdmin) {
        return interaction.reply({ content: '🚫 Only Admins or Support Staff can unmute users in Support Voice.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('user');
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember) {
        return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
      }

      const res = await voiceHandler.unmuteUserInVoice(guild, targetMember, member);
      return interaction.reply({ content: res.message, ephemeral: true });
    }

    if (subcommand === 'mute-voice') {
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.some(r =>
          r.name.toLowerCase() === config.roles.admin.toLowerCase() ||
          r.name.toLowerCase() === config.roles.staff.toLowerCase() ||
          r.name.toLowerCase() === 'support' ||
          r.name.toLowerCase().includes('support') ||
          r.name.toLowerCase().includes('staff') ||
          r.name.toLowerCase().includes('admin')
        );

      if (!isAdmin) {
        return interaction.reply({ content: '🚫 Only Admins or Support Staff can mute users.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('user');
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember) {
        return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      }

      const res = await voiceHandler.muteUserInVoice(guild, targetMember, member);
      return interaction.reply({ content: res.message, ephemeral: true });
    }
  }
};
