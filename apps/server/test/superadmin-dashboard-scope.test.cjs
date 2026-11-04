const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { isSuperadmin, superadminCanVisit, superadminVisibleSections } = require('../src/plugins/multivendor/dashboard/superadmin-scope');

test('el alcance se aplica al superadministrador en cualquier canal, no a vendedores', () => {
    assert.equal(isSuperadmin([{ permissions: ['SuperAdmin'] }, { permissions: ['ReadProduct'] }]), true);
    assert.equal(isSuperadmin([{ permissions: ['ReadProduct', 'UpdateSeller'] }]), false);
    assert.equal(isSuperadmin(undefined), false);
});

test('permite vendedores, usuarios, clientes y estadísticas y limita las demás secciones', () => {
    for (const path of ['/', '/seller-profiles/new', '/seller-profiles/3/edit', '/customers/7', '/estadisticas-calzado', '/profile']) assert.equal(superadminCanVisit(path), true, path);
    for (const path of ['/products', '/product-variants/1', '/promotions', '/etiquetas', '/warehouse/receipts', '/warehouse-users', '/customers-extra']) assert.equal(superadminCanVisit(path), false, path);
    for (const section of ['customers', 'multivendor', 'footwear-statistics']) assert.equal(superadminVisibleSections.has(section), true);
    for (const section of ['catalog', 'marketing', 'labeling', 'warehouse']) assert.equal(superadminVisibleSections.has(section), false);
});
