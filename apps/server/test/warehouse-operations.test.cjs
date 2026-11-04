const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { warehouseFulfillmentProcess } = require('../src/plugins/warehouse/warehouse-fulfillment-process');
const { WarehouseService } = require('../src/plugins/warehouse/services/warehouse.service');
const { WarehouseStockSubscriber } = require('../src/plugins/warehouse/services/warehouse-stock.subscriber');
const { shelfLocations, WarehouseStockLocationStrategy } = require('../src/plugins/warehouse/warehouse-stock-location-strategy');
const { MultiChannelStockLocationStrategy } = require('@vendure/core');

function fulfillmentState(scanned, paid = true, located = true, target = 'Pending') {
    const order = { id: '10', state: paid ? 'PaymentSettled' : 'ArrangingPayment', channels: [{ id: '2' }] };
    const line = { quantity: 2, orderLineId: '20', orderLine: { id: '20', productVariantId: '30', order } };
    const connection = { getRepository: (_ctx, type) => {
        if (type.name === 'FulfillmentLine') return {
            find: async () => [line],
            query: async (_sql, values) => { assert.deepEqual(values, [30, 0]); return []; },
            createQueryBuilder: () => ({ innerJoin() { return this; }, where() { return this; }, select() { return this; }, getRawOne: async () => ({ total: 0 }) }),
        };
        if (type.name === 'Allocation') return { find: async () => [{ stockLocationId: '5', quantity: 2 }] };
        if (type.name === 'WarehouseShelf') return { find: async () => located ? [{ stockLocation: { id: '5' } }] : [] };
        if (type.name === 'WarehousePickScan') return { count: async () => scanned };
        throw new Error(`Unexpected repository ${type.name}`);
    } };
    warehouseFulfillmentProcess.init({ get: () => connection });
    return warehouseFulfillmentProcess.onTransitionStart(target === 'Pending' ? 'Created' : 'Pending', target, { ctx: {}, fulfillment: { id: '40' }, orders: [order] });
}

test('bloquea el despacho si falta escanear algún par', async () => {
    assert.match(await fulfillmentState(1), /Falta escanear/);
});

test('el flujo nativo bloquea reservas antiguas sin percha y envíos sin escaneo', async () => {
    assert.match(await fulfillmentState(2, true, false), /percha/);
    assert.match(await fulfillmentState(1, true, true, 'Shipped'), /Falta escanear/);
});

test('permite el despacho al completar los QR y confirmar el pago', async () => {
    assert.equal(await fulfillmentState(2), undefined);
    assert.match(await fulfillmentState(2, false), /pago confirmado/);
});

test('la recepción suma stock en la percha indicada y asienta el usuario', async () => {
    const calls = [];
    const locks = [];
    const profile = { id: '2', channel: { id: '7' }, slug: 'zapateria' };
    const shelf = { id: '9', channel: profile.channel, code: 'P-A01', active: true, stockLocation: { id: '15' } };
    const connection = {
        findOneInChannel: async (_ctx, _type, id, channelId) => id === '5' && channelId === '7' ? { id: '5', deletedAt: null } : null,
        getRepository: (_ctx, type) => {
            if (type.name === 'SellerProfile') return { findOne: async () => profile };
            if (type.name === 'WarehouseShelf') return { findOne: async ({ where }) => where.id === '9' && where.channel.id === '7' ? shelf : null };
            if (type.name === 'StockLevel') return { query: async (_sql, values) => { locks.push(values); return []; }, findOne: async () => ({ stockOnHand: 4 }) };
            if (type.name === 'WarehouseMovementNote') return { upsert: async value => { calls.push(['note', value]); } };
            throw new Error(`Unexpected repository ${type.name}`);
        },
    };
    const movements = { adjustProductVariantStock: async (_ctx, id, levels) => { calls.push(['stock', id, levels]); return [{ id: '80' }]; } };
    const service = new WarehouseService(connection, {}, movements, {});
    const ctx = { activeUserId: '42', channelId: '7', userHasAllPermissions: () => true };
    assert.deepEqual(await service.receive(ctx, { variantId: '5', shelfId: '9', quantity: 3 }), { variantId: '5', shelfCode: 'P-A01', onHand: 7 });
    assert.equal(calls[0][2][0].stockLocationId, '15');
    assert.equal(calls[0][2][0].stockOnHand, 7);
    assert.equal(calls[1][1].actorUserId, 42);
    assert.deepEqual(locks, [[5, 0], [5, 15]], 'La recepción se coordina primero con las reservas de toda la variante');
    await assert.rejects(service.receive(ctx, { variantId: '5', shelfId: '9', quantity: -1 }), /cantidad/);
    await assert.rejects(service.receive(ctx, { variantId: '5', shelfId: '10', quantity: 1 }), /percha/);
    assert.equal(calls.length, 2);
});

test('un ajuste nativo no puede saltarse la percha una vez activada la bodega', async () => {
    let handler;
    let inserted = false;
    const plugin = new WarehouseStockSubscriber({ registerBlockingEventHandler: options => { handler = options.handler; } }, {
        getRepository: (_ctx, type) => type.name === 'WarehouseShelf'
            ? { createQueryBuilder: () => ({ innerJoin() { return this; }, where() { return this; }, getExists: async () => true }) }
            : { createQueryBuilder: () => ({ insert() { return this; }, values() { return this; }, orIgnore() { return this; }, execute: async () => { inserted = true; } }) },
    });
    plugin.onApplicationBootstrap();
    const event = { ctx: { activeUserId: '1' }, stockMovements: [{ id: '80', type: 'ADJUSTMENT', productVariant: { id: '5' } }] };
    await assert.rejects(handler(event), /Bodega/);
    assert.equal(inserted, false);
    event.ctx.warehouseStockWrite = true;
    await handler(event);
    assert.equal(inserted, true);
});

test('el bodeguero no puede crear perchas ni registrar ajustes administrativos', async () => {
    const connection = { getRepository: (_ctx, type) => {
        if (type.name === 'SellerProfile') return { findOne: async () => ({ id: '2', slug: 'zapateria', channel: { id: '7' }, administrator: { user: { id: '11' } } }) };
        if (type.name === 'WarehouseUser') return { findOne: async () => ({ role: 'BODEGUERO' }) };
        throw new Error(`Unexpected repository ${type.name}`);
    } };
    const service = new WarehouseService(connection, {}, {}, {});
    const ctx = { activeUserId: '42', channelId: '7', userHasAllPermissions: () => false };
    await assert.rejects(service.createShelf(ctx, { code: 'P-A01' }));
    await assert.rejects(service.adjust(ctx, { variantId: '5', shelfId: '9', quantity: -1, reason: 'Merma por daño' }));
});

test('las reservas excluyen ubicaciones sin percha y conservan el orden de las perchas', () => {
    const locations = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
    assert.deepEqual(shelfLocations(locations, new Set(['3', '4'])).map(item => item.id), ['3', '4']);
    assert.deepEqual(locations.map(item => item.id), ['1', '2', '3', '4']);
});

test('el traslado entre perchas conserva pares y excluye los reservados', async () => {
    const profile = { id: '2', slug: 'zapateria', channel: { id: '7' } };
    const shelves = [
        { id: '9', code: 'P-A01', active: true, stockLocation: { id: '15', name: 'P-A01' } },
        { id: '10', code: 'P-B02', active: true, stockLocation: { id: '16', name: 'P-B02' } },
    ];
    const stockChanges = [], notes = [];
    const connection = {
        findOneInChannel: async () => ({ id: '5', deletedAt: null }),
        getRepository: (_ctx, type) => {
            if (type.name === 'SellerProfile') return { findOne: async () => profile };
            if (type.name === 'WarehouseShelf') return { findOne: async ({ where }) => shelves.find(shelf => shelf.id === where.id) };
            if (type.name === 'StockLevel') return { query: async () => [], find: async () => [
                { stockLocationId: '15', stockOnHand: 5, stockAllocated: 2 },
                { stockLocationId: '16', stockOnHand: 1, stockAllocated: 0 },
            ] };
            if (type.name === 'WarehouseMovementNote') return { upsert: async value => { notes.push(value); } };
            throw new Error(`Unexpected repository ${type.name}`);
        },
    };
    const service = new WarehouseService(connection, {}, { adjustProductVariantStock: async (_ctx, _id, values) => { stockChanges.push(values[0]); return [{ id: String(stockChanges.length) }]; } }, {});
    const ctx = { activeUserId: '42', channelId: '7', userHasAllPermissions: () => true };
    const input = { variantId: '5', fromShelfId: '9', toShelfId: '10', reason: 'Reorganización', quantity: 4 };
    await assert.rejects(service.move(ctx, input), /pares libres/);
    assert.equal(stockChanges.length, 0);
    assert.deepEqual(await service.move(ctx, { ...input, quantity: 2 }), { variantId: '5', shelfCode: 'P-B02', onHand: 3 });
    assert.deepEqual(stockChanges.map(change => change.stockOnHand), [3, 3]);
    assert.equal(notes.length, 2);
});

test('la asignación nueva toma primero la percha y nunca reserva más pares que los pedidos', async () => {
    const original = MultiChannelStockLocationStrategy.prototype.forAllocation;
    let ordered;
    MultiChannelStockLocationStrategy.prototype.forAllocation = async (_ctx, locations) => {
        ordered = locations.map(location => location.id);
        return locations.map(location => ({ location, quantity: 2 }));
    };
    try {
        const strategy = new WarehouseStockLocationStrategy();
        strategy.connection = { getRepository: () => ({ find: async () => [{ stockLocation: { id: '2' } }, { stockLocation: { id: '3' } }] }) };
        const result = await strategy.forAllocation({ channelId: '1' }, [{ id: '1' }, { id: '2' }, { id: '3' }], {}, 3);
        assert.deepEqual(ordered, ['2', '3']);
        assert.deepEqual(result.map(item => item.quantity), [2, 1]);
    } finally {
        MultiChannelStockLocationStrategy.prototype.forAllocation = original;
    }
});

test('el stock publicado excluye ubicaciones sin percha', async () => {
    const original = MultiChannelStockLocationStrategy.prototype.getAvailableStock;
    MultiChannelStockLocationStrategy.prototype.getAvailableStock = async (_ctx, _variantId, levels) => ({ stockOnHand: levels.reduce((sum, level) => sum + level.stockOnHand, 0), stockAllocated: levels.reduce((sum, level) => sum + level.stockAllocated, 0) });
    try {
        const strategy = new WarehouseStockLocationStrategy();
        strategy.connection = { getRepository: () => ({ find: async () => [{ stockLocation: { id: 2 } }] }) };
        assert.deepEqual(await strategy.getAvailableStock({ channel: { code: '__default_channel__' } }, 5, [
            { stockLocationId: 1, stockOnHand: 100, stockAllocated: 0 },
            { stockLocationId: 2, stockOnHand: 3, stockAllocated: 1 },
        ]), { stockOnHand: 3, stockAllocated: 1 });
    } finally { MultiChannelStockLocationStrategy.prototype.getAvailableStock = original; }
});

test('vincular una ubicación anterior conserva su stock y rechaza stock de otro almacén', async () => {
    let foreign = false, created = 0;
    const location = { id: '15', channels: [{ id: '7' }] };
    const connection = { getRepository: (_ctx, type) => {
        if (type.name === 'WarehouseShelf') return { findOne: async () => null, save: async value => { created++; return { ...value, id: '9' }; } };
        if (type.name === 'StockLocation') return { findOne: async () => location };
        if (type.name === 'StockLevel') return { query: async () => foreign ? [{}] : [] };
        throw new Error(type.name);
    } };
    const service = new WarehouseService(connection, { update: async () => location }, { adjustProductVariantStock: () => { throw new Error('No debe mover stock'); } }, { getDefaultChannel: async () => ({ id: '1' }) });
    service.actor = async () => ({ channel: { id: '7' }, slug: 'almacen' });
    const input = { code: 'P-A01', sourceLocationId: '15' };
    assert.equal((await service.createShelf({}, input)).stockLocationId, '15');
    assert.equal(created, 1);
    foreign = true;
    await assert.rejects(service.createShelf({}, input), /otro almacén/);
    location.channels = [{ id: '8' }];
    await assert.rejects(service.createShelf({}, input), /exclusiva/);
    assert.equal(created, 1);
});
