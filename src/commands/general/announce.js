const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publish an official community announcement or tournament update')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target channel for the announcement')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('title')
        .setDescription('Announcement title / headline')
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Announcement content (supports markdown and emojis)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('ping')
        .setDescription('Notification ping to include')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: '@everyone', value: 'everyone' },
          { name: '@here', value: 'here' }
        )
    )
    .addStringOption(option =>
      option
        .setName('color')
        .setDescription('Embed color theme')
        .setRequired(false)
        .addChoices(
          { name: 'Gold / Orange (Esports)', value: '#FFA500' },
          { name: 'Electric Blue (Official)', value: '#0099FF' },
          { name: 'Emerald Green (Success / Registration Open)', value: '#2ECC71' },
          { name: 'Crimson Red (Urgent / Alert)', value: '#E74C3C' }
        )
    )
    .addStringOption(option =>
      option
        .setName('image')
        .setDescription('URL of a banner image to attach')
        .setRequired(false)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const ping = interaction.options.getString('ping') || 'none';
    const color = interaction.options.getString('color') || '#FFA500';
    const image = interaction.options.getString('image');

    // Parse newline escapes if passed as literal \n
    const formattedContent = message.replace(/\\n/g, '\n');

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📢 ${title}`)
      .setDescription(formattedContent)
      .setAuthor({
        name: `${interaction.guild.name} Official Announcement`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
      })
      .setFooter({
        text: `Announced by ${interaction.user.tag} • Prime Lobby eSports`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      })
      .setTimestamp();

    if (image && /^https?:\/\//i.test(image)) {
      embed.setImage(image);
    }

    let pingContent = null;
    if (ping === 'everyone') pingContent = '@everyone';
    else if (ping === 'here') pingContent = '@here';

    try {
      const sentMsg = await channel.send({
        content: pingContent,
        embeds: [embed]
      });

      return interaction.reply({
        content: `✅ **Announcement successfully published to <#${channel.id}>!**\n[Jump to Announcement](${sentMsg.url})`,
        ephemeral: true
      });
    } catch (err) {
      console.error('[AnnounceCommand] Error posting announcement:', err);
      return interaction.reply({
        content: `❌ Failed to send announcement to <#${channel.id}>: ${err.message}`,
        ephemeral: true
      });
    }
  }
};
