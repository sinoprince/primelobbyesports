const roleHandler = require('../handlers/roleHandler');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member) {
    console.log(`[Event:guildMemberAdd] New member joined: ${member.user.tag} (${member.id}) in ${member.guild.name}`);
    await roleHandler.assignVisitorRole(member);
  }
};
