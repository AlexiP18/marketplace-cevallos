const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { landingPath } = require('../src/plugins/multivendor/dashboard/superadmin-scope');

test('envía cada perfil a su área inicial según los permisos', () => {
    const channels = permissions => [{ permissions }];
    assert.equal(landingPath(channels(['SuperAdmin', 'UpdateSeller'])), '/seller-profiles');
    assert.equal(landingPath(channels(['UpdateSeller', 'ReadProduct', 'ReadOrder'])), '/products');
    assert.equal(landingPath(channels(['ReadProduct', 'ReadOrder'])), '/warehouse/receipts');
    assert.equal(landingPath(channels(['ReadOrder'])), '/warehouse/dispatch');
    assert.equal(landingPath(channels(['Authenticated'])), null);
    assert.equal(landingPath(undefined), null);
});
