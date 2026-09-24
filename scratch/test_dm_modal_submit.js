const paymentHandler = require('../src/handlers/paymentHandler');

const mockGuild = {
  id: '1543502896753287198',
  name: 'prime lobby esports',
  channels: {
    cache: {
      find: () => ({ id: '1552000659044438136', send: async (m) => console.log('Admin send:', m) })
    }
  }
};

const mockUser = {
  id: '930810281972629596',
  username: 'malayalip',
  tag: 'malayalip'
};

const mockClient = {
  guilds: {
    cache: {
      first: () => mockGuild,
      get: () => mockGuild
    }
  },
  channels: {
    fetch: async () => ({ send: async (m) => console.log('Channel send:', m) })
  }
};

paymentHandler.submitPaymentProof(
  mockClient,
  mockGuild,
  { id: mockUser.id, user: mockUser, guild: mockGuild },
  {
    amount: '300',
    utr: '998877665544',
    purpose: 'Tournament',
    screenshotUrl: null
  }
).then(res => {
  console.log('Modal submitPaymentProof result:', res);
}).catch(err => {
  console.error('Modal submit crash:', err);
});
