const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { WarehouseUserService } = require('../src/plugins/multivendor/services/warehouse-user.service');
const { SellerProfileService } = require('../src/plugins/multivendor/services/seller-profile.service');

function setup({ actorRole = 'seller-admin-tienda', channelId = '7', existingStaff = null } = {}) {
    const profile = { id: '2', slug: 'tienda', businessName: 'Tienda', channel: { id: '7' }, administrator: { id: '1', firstName: 'Dueña', user: { id: '11' } } };
    const roles = [{ id: '8', code: 'seller-admin-tienda', channels: [{ id: '7' }] }];
    const created = [], updated = [], removed = [];
    const connection = { getRepository: (_ctx, type) => ({
        findOne: async ({ where }) => {
            if (type.name === 'SellerProfile') return where.channel.id === '7' ? profile : null;
            if (type.name === 'Role') return roles.find(role => role.code === where.code) || null;
            if (type.name === 'WarehouseUser') return existingStaff && where.sellerProfile.id === '2' && where.administrator.id === existingStaff.administrator.id ? existingStaff : null;
            return null;
        },
        save: async value => value,
    }) };
    const administrators = {
        findOneByUserId: async () => ({ user: { roles: [{ code: actorRole }] } }),
        create: async (_ctx, input) => { created.push(input); return { id: '20', ...input }; },
        update: async (_ctx, input) => { updated.push(input); return { id: input.id, ...input }; },
        softDelete: async (_ctx, id) => { removed.push(id); },
    };
    const roleService = { create: async (_ctx, input) => { const role = { id: '9', ...input, channels: [{ id: '7' }] }; roles.push(role); return role; } };
    const service = new WarehouseUserService(connection, administrators, roleService);
    const ctx = { activeUserId: '11', channelId, userHasAllPermissions: permissions => !permissions.includes('SuperAdmin') };
    return { service, ctx, created, updated, removed, roles };
}

const input = { firstName: 'Ana', lastName: 'Vera', emailAddress: 'ANA@example.com', password: 'segura123', role: 'BODEGUERO' };

test('crea un bodeguero solo con permisos de consulta del canal propio', async () => {
    const state = setup();
    await state.service.save(state.ctx, { ...input });
    assert.deepEqual(state.created[0].roleIds, ['9']);
    assert.equal(state.created[0].emailAddress, 'ana@example.com');
    assert.deepEqual(state.roles[1].channelIds, ['7']);
    assert.ok(!state.roles[1].permissions.includes('UpdateProduct'));
    assert.ok(!state.roles[1].permissions.includes('UpdateOrder'));
});

test('impide gestionar usuarios de otro canal o sin rol administrador', async () => {
    const otherChannel = setup({ channelId: '8' });
    await assert.rejects(otherChannel.service.save(otherChannel.ctx, { ...input }));
    assert.equal(otherChannel.created.length, 0);
    const bodeguero = setup({ actorRole: 'warehouse-bodeguero-2' });
    await assert.rejects(bodeguero.service.save(bodeguero.ctx, { ...input }));
    assert.equal(bodeguero.created.length, 0);
});

test('no edita cuentas ajenas ni desactiva la propia', async () => {
    const state = setup();
    await assert.rejects(state.service.save(state.ctx, { ...input, id: '30' }));
    assert.equal(state.updated.length, 0);
    const self = setup({ existingStaff: { administrator: { id: '20', user: { id: '11' } }, role: 'ADMINISTRADOR' } });
    await assert.rejects(self.service.remove(self.ctx, '20'));
    assert.equal(self.removed.length, 0);
});

test('valida rol, correo y contraseña antes de crear una cuenta', async () => {
    const state = setup();
    await assert.rejects(state.service.save(state.ctx, { ...input, role: 'SUPERADMIN' }), /perfil válido/);
    await assert.rejects(state.service.save(state.ctx, { ...input, emailAddress: 'invalido' }), /correo válido/);
    await assert.rejects(state.service.save(state.ctx, { ...input, password: 'corta' }), /contraseña/);
    assert.equal(state.created.length, 0);
});

test('la lista y ficha de vendedores respetan el canal del usuario', async () => {
    let channelFilter;
    const query = { andWhere: (_sql, args) => { channelFilter = args.channelId; return query; }, getManyAndCount: async () => [[], 0] };
    const service = Object.create(SellerProfileService.prototype);
    service.listQueryBuilder = { build: () => query };
    service.connection = { getRepository: () => ({ findOne: async () => ({ id: '1', channel: { id: '2' } }) }) };
    const ctx = { channelId: '1', userHasAllPermissions: () => false };
    await service.findAll(ctx);
    assert.equal(channelFilter, '1');
    assert.equal(await service.findOne(ctx, '1'), null);
    assert.equal((await service.findOne({ ...ctx, userHasAllPermissions: () => true }, '1')).id, '1');
});
