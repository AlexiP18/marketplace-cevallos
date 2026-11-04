const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { SellerProfileService } = require('../src/plugins/multivendor/services/seller-profile.service');
const { AdminSellerProfileResolver } = require('../src/plugins/multivendor/api/admin-seller-profile.resolver');

test('solo modifica la preferencia del canal activo', async () => {
    const profiles = new Map([['1', { allowsCombinedShipping: false }], ['2', { allowsCombinedShipping: false }]]);
    const repository = { findOne: async ({ where }) => profiles.get(where.channel.id), save: async profile => profile };
    const resolver = new AdminSellerProfileResolver(new SellerProfileService({ getRepository: () => repository }), null, null, null);
    const ctx = { channelId: '1', userHasAllPermissions: () => true };
    assert.equal(await resolver.channelCombinedShippingPreference(ctx), false);
    assert.equal(await resolver.setChannelCombinedShippingPreference(ctx, true), true);
    assert.equal(profiles.get('1').allowsCombinedShipping, true);
    assert.equal(profiles.get('2').allowsCombinedShipping, false);
    await assert.rejects(resolver.setChannelCombinedShippingPreference({ ...ctx, userHasAllPermissions: () => false }, true));
    await assert.rejects(resolver.setChannelCombinedShippingPreference({ ...ctx, channelId: '3' }, true));
});
