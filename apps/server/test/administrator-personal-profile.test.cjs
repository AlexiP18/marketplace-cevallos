const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { AssetType } = require('@vendure/core');
const { AdministratorPersonalProfile } = require('../src/plugins/multivendor/entities/administrator-personal-profile.entity');
const { AdministratorPersonalProfileService } = require('../src/plugins/multivendor/services/administrator-personal-profile.service');
const { SellerAdministratorPhotoResolver } = require('../src/plugins/multivendor/api/seller-administrator-photo.resolver');
const { AdminSellerProfileResolver } = require('../src/plugins/multivendor/api/admin-seller-profile.resolver');

function setup({ seller = true, assetType = AssetType.IMAGE, existing = null } = {}) {
    let current = existing;
    const sellerUpdates = [];
    let handler;
    let assetLookups = 0;
    const personalRepo = { findOne: async () => current, save: async profile => (current = profile) };
    const sellerRepo = { findOne: async () => seller ? { id: 2 } : null, createQueryBuilder: () => ({
        update() { return this; }, set(values) { this.values = values; return this; },
        where(_sql, params) { this.params = params; return this; },
        async execute() { sellerUpdates.push([this.params, this.values]); },
    }) };
    const service = new AdministratorPersonalProfileService(
        { getRepository: (_ctx, entity) => entity === AdministratorPersonalProfile ? personalRepo : sellerRepo },
        { findOne: async () => { assetLookups++; return { id: '9', type: assetType }; } },
        { registerBlockingEventHandler: entry => { handler = entry.handler; } },
    );
    return { service, sellerUpdates, getCurrent: () => current, getHandler: () => handler, getAssetLookups: () => assetLookups };
}

test('guarda foto y celular y sincroniza el celular del vendedor', async () => {
    const state = setup();
    await state.service.save({}, { id: '1' }, { phone: '0991234567', photoAssetId: '9' });
    assert.equal(state.getCurrent().phone, '099 123 4567');
    assert.equal(state.getCurrent().photo.id, '9');
    assert.equal(state.sellerUpdates[0][0].administratorId, '1');
    assert.equal(state.sellerUpdates[0][1].adminPhone, '099 123 4567');
});

test('rechaza imagen inválida y celular vacío para vendedores', async () => {
    const badImage = setup({ assetType: AssetType.BINARY });
    await assert.rejects(badImage.service.save({}, { id: '1' }, { photoAssetId: '9' }), /imagen válida/);
    assert.equal(badImage.getCurrent(), null);
    const badPhone = setup();
    await assert.rejects(badPhone.service.save({}, { id: '1' }, { phone: '' }), /obligatorio/);
    assert.equal(badPhone.getCurrent(), null);
});

test('conserva una foto existente aunque pertenezca a otro canal', async () => {
    const state = setup({ existing: { phone: '099 123 4567', photo: { id: '9' } } });
    await state.service.save({}, { id: '1' }, { phone: '0991234567', photoAssetId: '9' });
    assert.equal(state.getAssetLookups(), 0);
    assert.equal(state.getCurrent().photo.id, '9');
});

test('permite quitar la foto sin borrar el celular', async () => {
    const state = setup({ existing: { phone: '099 123 4567', photo: { id: '9' } } });
    await state.service.save({}, { id: '1' }, { photoAssetId: null });
    assert.equal(state.getCurrent().photo, null);
    assert.equal(state.getCurrent().phone, '099 123 4567');
    assert.equal(state.sellerUpdates.length, 0);
});

test('sincroniza cambios del perfil de Vendure con el vendedor', async () => {
    const state = setup();
    state.service.onModuleInit();
    await state.getHandler()({ type: 'updated', ctx: {}, entity: { id: '1', firstName: 'Ana', lastName: 'Vera', emailAddress: 'ana@example.com' } });
    assert.deepEqual(state.sellerUpdates[0][1], { adminFirstName: 'Ana', adminLastName: 'Vera', adminEmail: 'ana@example.com' });
});

test('no muestra la foto de un vendedor de otro canal', async () => {
    let lookups = 0;
    const resolver = new SellerAdministratorPhotoResolver({ find: async () => { lookups++; return { photo: { id: '9' } }; } });
    const profile = { channel: { id: '3' }, administrator: { id: '1' } };
    const ctx = { channelId: '4', userHasAllPermissions: () => false };
    assert.equal(await resolver.administratorPhoto(ctx, profile), null);
    assert.equal(lookups, 0);
    assert.equal((await resolver.administratorPhoto({ ...ctx, channelId: '3' }, profile)).id, '9');
});

test('actualiza únicamente el perfil del usuario autenticado', async () => {
    let savedAdministrator;
    const resolver = new AdminSellerProfileResolver({}, { findOneByUserId: async (_ctx, id) => ({ id }) }, {}, { save: async (_ctx, admin) => { savedAdministrator = admin.id; return {}; } });
    await resolver.updateMyAdministratorPersonalData({ activeUserId: '1' }, { photoAssetId: '9' });
    assert.equal(savedAdministrator, '1');
    await assert.rejects(resolver.updateMyAdministratorPersonalData({}, { photoAssetId: '9' }));
});
