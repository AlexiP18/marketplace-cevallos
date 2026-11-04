const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { Order, ProductVariant, StockLevel, Permission } = require('@vendure/core');
const { StatisticsService } = require('../src/plugins/statistics/services/statistics.service');

function builder(rows, entities = []) {
    const query = { getRawMany: async () => rows, getMany: async () => entities };
    for (const method of ['innerJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'select', 'addSelect', 'groupBy', 'distinct']) query[method] = () => query;
    return query;
}
function service() {
    const variant = { id: 2, productId: 1, sku: 'SKU-1', product: { id: 1, name: 'Calzado', translations: [], customFields: { codigo: 'HN-05' } }, options: [{ name: 'Azul', translations: [], group: { code: 'color' } }, { name: '38', translations: [], group: { code: 'talla' } }], trackInventory: 'TRUE', useGlobalOutOfStockThreshold: true };
    const connection = { getRepository: (_ctx, entity) => ({ createQueryBuilder: () => entity === Order ? builder([]) : entity === ProductVariant ? builder([{ id: '2' }], [variant]) : entity === StockLevel ? builder([{ id: '2', onHand: '12', allocated: '3' }]) : null }) };
    return new StatisticsService(connection);
}
test('el informe general oculta variantes al superadministrador y las conserva para el vendedor', async () => {
    const context = superadmin => ({ currencyCode: 'USD', channelId: 2, languageCode: 'es', channel: { trackInventory: true, outOfStockThreshold: 0 }, userHasAllPermissions: permissions => superadmin && permissions.includes(Permission.SuperAdmin) });
    const input = { startDate: '2026-01-01', endDate: '2026-01-02' };
    const general = await service().report(context(true), input);
    const seller = await service().report(context(false), input);
    assert.deepEqual(general.variants, []);
    assert.equal(seller.variants[0].productCode, 'HN-05');
    assert.equal(seller.variants[0].sku, 'SKU-1');
    assert.deepEqual(general.summary, seller.summary);
    assert.equal(general.overview.modelCount, 1);
    assert.equal(general.overview.variantCount, 1);
    assert.deepEqual(general.overview, seller.overview);
    assert.equal(general.overview.physicalPairs, 12);
    assert.equal(general.overview.allocatedPairs, 3);
    assert.deepEqual(general.segments, seller.segments);
    assert.deepEqual(general.matrix, seller.matrix);
    assert.deepEqual(general.matrix, [{ color: 'Azul', size: '38', pairCount: 0, stockAvailable: 9 }]);
    assert.ok(!JSON.stringify({ overview: general.overview, segments: general.segments, matrix: general.matrix }).includes('HN-05'));
    assert.ok(!JSON.stringify({ overview: general.overview, segments: general.segments, matrix: general.matrix }).includes('SKU-1'));
});
