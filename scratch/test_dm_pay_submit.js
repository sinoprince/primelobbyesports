const payCommand = require('../src/commands/payments/pay');

const mockDmInteraction = {
  options: {
    getSubcommand: () => 'submit',
    getString: (name) => {
      if (name === 'utr') return '998877665544';
      if (name === 'purpose') return 'eFootball Tournament';
      return null;
    },
    getNumber: (name) => {
      if (name === 'amount') return 300;
      return null;
    },
    getAttachment: () => null,
    getInteger: () => null
  },
  guild: null, // In DM, guild is null!
  member: null, // In DM, member is null!
  user: {
    id: '930810281972629596',
    tag: 'malayalip#0000',
    username: 'malayalip'
  },
  deferReply: async () => {},
  editReply: async (msg) => {
    console.log('editReply received:', msg);
  },
  client: {
    guilds: {
      cache: {
        first: () => ({ id: '1543502896753287198', name: 'prime lobby esports' })
      }
    }
  }
};

try {
  payCommand.execute(mockDmInteraction).then(() => {
    console.log('Execute finished without exception');
  }).catch(err => {
    console.error('CRASH in /pay submit in DM:', err);
  });
} catch (err) {
  console.error('Synchronous crash:', err);
}
