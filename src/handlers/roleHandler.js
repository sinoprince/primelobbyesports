const { PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const { dbQueries } = require('../database/db');

const roleHandler = {
  /**
   * Ensures the Visitor and Member roles exist in the guild.
   */
  ensureRolesExist: async (guild) => {
    // Fetch all roles from Discord API
    await guild.roles.fetch().catch(() => null);

    const settings = dbQueries.getGuildSettings(guild.id) || {};
    let visitorRole = settings.visitor_role_id ? guild.roles.cache.get(settings.visitor_role_id) : null;
    let memberRole = settings.member_role_id ? guild.roles.cache.get(settings.member_role_id) : null;

    if (!visitorRole) {
      visitorRole = guild.roles.cache.find(r => r.name.toLowerCase() === config.roles.visitor.toLowerCase());
    }
    if (!visitorRole) {
      try {
        visitorRole = await guild.roles.create({
          name: config.roles.visitor,
          color: '#95a5a6',
          reason: 'Auto-created Visitor role for new user onboarding',
          permissions: []
        });
        console.log(`[RoleManager] Created role: ${visitorRole.name} (${visitorRole.id})`);
      } catch (err) {
        console.error('[RoleManager] Failed to create Visitor role:', err.message);
      }
    }

    if (!memberRole) {
      memberRole = guild.roles.cache.find(r => r.name.toLowerCase() === config.roles.member.toLowerCase());
    }
    if (!memberRole) {
      try {
        memberRole = await guild.roles.create({
          name: config.roles.member,
          color: '#2ecc71',
          reason: 'Auto-created Member role for verified users',
          permissions: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
          ]
        });
        console.log(`[RoleManager] Created role: ${memberRole.name} (${memberRole.id})`);
      } catch (err) {
        console.error('[RoleManager] Failed to create Member role:', err.message);
      }
    }

    // Save IDs in database
    if (visitorRole || memberRole) {
      dbQueries.updateGuildSettings(guild.id, {
        visitor_role_id: visitorRole ? visitorRole.id : null,
        member_role_id: memberRole ? memberRole.id : null
      });
    }

    return { visitorRole, memberRole };
  },

  /**
   * Assigns the Visitor role to a new member upon joining.
   */
  assignVisitorRole: async (member) => {
    try {
      if (member.user.bot) return;
      const { visitorRole } = await roleHandler.ensureRolesExist(member.guild);
      if (visitorRole) {
        await member.roles.add(visitorRole, 'New user join: assigned Visitor role');
        console.log(`[RoleManager] Assigned Visitor role to ${member.user.tag} (${member.id})`);
      }
    } catch (err) {
      console.error(`[RoleManager] Error assigning Visitor role to ${member.user.tag}:`, err.message);
      if (err.code === 50013) {
        console.warn('⚠️ [ROLE HIERARCHY WARNING] The bot role is placed below the target role in Server Settings > Roles! Drag the bot role higher.');
      }
    }
  },

  /**
   * Removes Visitor role and adds Member role upon verification.
   */
  verifyAndPromoteToMember: async (member) => {
    try {
      const guild = member.guild;
      const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);

      if (!memberRole) {
        return { success: false, message: 'Member role is not configured or could not be found.' };
      }

      // Refresh member data
      const refreshedMember = await guild.members.fetch(member.id).catch(() => member);

      // Check if already a Member
      if (refreshedMember.roles.cache.has(memberRole.id)) {
        return { success: true, message: 'You are already verified as a Member!' };
      }

      // Add Member role
      await refreshedMember.roles.add(memberRole, 'Verification confirmed: promoted to Member');

      // Remove Visitor role if present
      if (visitorRole && refreshedMember.roles.cache.has(visitorRole.id)) {
        await refreshedMember.roles.remove(visitorRole, 'Verification confirmed: removed Visitor role');
      }

      console.log(`[RoleManager] Verified and promoted ${refreshedMember.user.tag} to Member role.`);
      return { success: true, message: '✅ Verification successful! You now have access to all general chat and voice channels.' };
    } catch (err) {
      console.error(`[RoleManager] Error verifying member ${member.user.tag}:`, err.message);
      if (err.code === 50013) {
        console.warn('⚠️ [ROLE HIERARCHY WARNING] The bot role is placed below Member/Visitor in Server Settings > Roles! Drag the bot role higher.');
      }
      return { success: false, message: `Failed to update roles: ${err.message}` };
    }
  },

  /**
   * Configures channel permissions so ONLY the Bot and Admins can send messages in #rules,
   * while all regular users can only read and react.
   */
  configureDefaultServerPermissions: async (guild, rulesChannel) => {
    const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);
    if (!rulesChannel) return;

    const overwrites = [
      {
        id: guild.roles.everyone.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions
        ],
        deny: [
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.SendMessagesInThreads,
          PermissionsBitField.Flags.CreatePublicThreads,
          PermissionsBitField.Flags.CreatePrivateThreads
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.AddReactions
        ]
      }
    ];

    if (visitorRole) {
      overwrites.push({
        id: visitorRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions
        ],
        deny: [
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.SendMessagesInThreads,
          PermissionsBitField.Flags.CreatePublicThreads,
          PermissionsBitField.Flags.CreatePrivateThreads
        ]
      });
    }

    if (memberRole) {
      overwrites.push({
        id: memberRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions
        ],
        deny: [
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.SendMessagesInThreads,
          PermissionsBitField.Flags.CreatePublicThreads,
          PermissionsBitField.Flags.CreatePrivateThreads
        ]
      });
    }

    await rulesChannel.permissionOverwrites.set(overwrites);
  },

  /**
   * Configures channel permissions so ONLY the Bot and Admins can send messages in #announcements.
   */
  configureAnnouncementsPermissions: async (guild, announcementsChannel) => {
    const { visitorRole, memberRole } = await roleHandler.ensureRolesExist(guild);
    if (!announcementsChannel) return;

    const overwrites = [
      {
        id: guild.roles.everyone.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions
        ],
        deny: [
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.SendMessagesInThreads,
          PermissionsBitField.Flags.CreatePublicThreads,
          PermissionsBitField.Flags.CreatePrivateThreads
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.MentionEveryone
        ]
      }
    ];

    if (visitorRole) {
      overwrites.push({
        id: visitorRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions
        ],
        deny: [PermissionsBitField.Flags.SendMessages]
      });
    }

    if (memberRole) {
      overwrites.push({
        id: memberRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions
        ],
        deny: [PermissionsBitField.Flags.SendMessages]
      });
    }

    await announcementsChannel.permissionOverwrites.set(overwrites);
  }
};

module.exports = roleHandler;
