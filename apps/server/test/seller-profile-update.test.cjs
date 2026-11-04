const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { AssetType } = require('@vendure/core');
const { SellerProfileService } = require('../src/plugins/multivendor/services/seller-profile.service');
const { SellerRegistrationService } = require('../src/plugins/multivendor/services/seller-registration.service');

function setup({ sameChannel = true, superAdmin = false, assetType = AssetType.IMAGE } = {}) {
    const profile = { id: '1', seller: { id: '2' }, channel: { id: '3' }, administrator: { id: '4' }, businessName: 'Taller', primaryBankAccount: { bankName: 'Banco', accountNumber: '1234', accountType: 'AHORROS' } };
    const saved = [];
    const administratorUpdates = [];
    const sellerUpdates = [];
    const personalUpdates = [];
    const connection = { getRepository: () => ({ findOne: async () => profile, save: async value => { saved.push(value); return value; } }) };
    const registration = Object.create(SellerRegistrationService.prototype);
    registration.isEmailAvailable = async () => true;
    const service = new SellerProfileService(connection, {}, registration,
        { update: async (_ctx, input) => administratorUpdates.push(input) },
        { update: async (_ctx, input) => sellerUpdates.push(input) },
        { findOne: async () => ({ id: '9', type: assetType, preview: '/logo' }) },
        { save: async (_ctx, _administrator, input) => personalUpdates.push(input) });
    const ctx = { channelId: sameChannel ? '3' : '5', userHasAllPermissions: () => superAdmin };
    return { service, profile, ctx, saved, administratorUpdates, sellerUpdates, personalUpdates };
}

test('actualiza perfil, cuenta de acceso y logo en el canal autorizado', async () => {
    const state = setup();
    await state.service.update(state.ctx, { id: '1', business: { name: 'Taller Nuevo', logoAssetId: '9' }, administrator: { firstName: 'Ana', lastName: 'Vera', emailAddress: 'ANA@example.com', contactPhone: '0991234567' } });
    assert.equal(state.saved[0].logo.id, '9');
    assert.equal(state.saved[0].adminEmail, 'ana@example.com');
    assert.equal(state.saved[0].adminPhone, '099 123 4567');
    assert.equal(state.administratorUpdates[0].emailAddress, 'ana@example.com');
    assert.equal(state.sellerUpdates[0].name, 'Taller Nuevo');
});

test('permite quitar el logo y rechaza archivos que no son imágenes', async () => {
    const state = setup();
    await state.service.update(state.ctx, { id: '1', business: { logoAssetId: null } });
    assert.equal(state.saved[0].logo, null);
    const invalid = setup({ assetType: AssetType.BINARY });
    await assert.rejects(invalid.service.update(invalid.ctx, { id: '1', business: { logoAssetId: '9' } }), /imagen válida/);
    assert.equal(invalid.saved.length, 0);
});

test('impide modificar otro canal y valida el RUC antes de guardar', async () => {
    const other = setup({ sameChannel: false });
    await assert.rejects(other.service.update(other.ctx, { id: '1', business: { name: 'Otro taller' } }));
    assert.equal(other.sellerUpdates.length, 0);
    const invalid = setup();
    await assert.rejects(invalid.service.update(invalid.ctx, { id: '1', tax: { ruc: '123' } }), /RUC/);
    assert.equal(invalid.saved.length, 0);
});

test('valida el logo antes de crear los recursos del vendedor', async () => {
    const service = Object.create(SellerRegistrationService.prototype);
    let created = false;
    service.validateRegistrationInput = async () => {};
    service.assetService = { findOne: async () => ({ type: AssetType.BINARY }) };
    service.sellerService = { create: async () => { created = true; } };
    await assert.rejects(service.registerSeller({ apiType: 'admin' }, { business: { name: 'Taller', slug: 'taller', logoAssetId: '9' } }), /imagen válida/);
    assert.equal(created, false);
});

test('rechaza un correo usado antes de actualizar la cuenta', async () => {
    const state = setup();
    state.service.registration.isEmailAvailable = async () => false;
    await assert.rejects(state.service.update(state.ctx, { id: '1', administrator: { emailAddress: 'ocupado@example.com' } }), /correo ya está registrado/);
    assert.equal(state.administratorUpdates.length, 0);
    assert.equal(state.saved.length, 0);
});

test('permite conservar el correo de la propia cuenta', async () => {
    const state = setup();
    state.profile.administrator.emailAddress = 'ana@example.com';
    state.service.registration.isEmailAvailable = async () => false;
    await state.service.update(state.ctx, { id: '1', administrator: { emailAddress: 'ANA@example.com' } });
    assert.equal(state.saved[0].adminEmail, 'ana@example.com');
});

test('guarda la foto personal sin cambiar el logo del negocio', async () => {
    const state = setup();
    state.profile.logo = { id: 'logo-negocio' };
    await state.service.update(state.ctx, { id: '1', administrator: { photoAssetId: '9' } });
    assert.equal(state.personalUpdates[0].photoAssetId, '9');
    assert.equal(state.saved[0].logo.id, 'logo-negocio');
});

test('rechaza la foto personal inválida antes de crear el vendedor', async () => {
    const service = Object.create(SellerRegistrationService.prototype);
    let created = false;
    service.validateRegistrationInput = async () => {};
    service.assetService = { findOne: async () => ({ type: AssetType.BINARY }) };
    service.sellerService = { create: async () => { created = true; } };
    await assert.rejects(service.registerSeller({ apiType: 'admin' }, { business: { name: 'Taller', slug: 'taller' }, administrator: { photoAssetId: '9' } }), /foto de perfil/);
    assert.equal(created, false);
});

test('no permite asociar activos del administrador desde el registro público', async () => {
    const service = Object.create(SellerRegistrationService.prototype);
    service.validateRegistrationInput = async () => {};
    await assert.rejects(service.registerSeller({ apiType: 'shop' }, { administrator: { photoAssetId: '9' } }), /desde el administrador/);
});
