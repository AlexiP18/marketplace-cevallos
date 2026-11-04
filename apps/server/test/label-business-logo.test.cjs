const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { LabelTemplateService } = require('../src/plugins/labeling/services/label-template.service');
const { LabelTemplateResolver } = require('../src/plugins/labeling/api/label-template.resolver');
const { labelFields, renderLabel } = require('../src/plugins/labeling/dashboard/label-renderer');
const { fabric } = require('fabric');

function setup({ profiles = [], allProfiles = profiles, visible = true, channelId = '1', superadmin = false } = {}) {
    const resolver = new LabelTemplateResolver(new LabelTemplateService({ getRepository: () => ({ find: async options => options.where ? profiles : allProfiles }) }, { findOne: async () => visible ? { channels: [{ id: '1' }, { id: '2' }, { id: '3' }] } : undefined }));
    const ctx = { channelId, userHasAllPermissions: () => superadmin };
    return { resolver, ctx };
}
const seller = (id, logo) => ({ id, businessName: `Negocio ${id}`, channel: { id }, logo: logo ? { preview: logo } : null });

test('usa el logo del almacén activo, incluso si el producto está en varios canales', async () => {
    const { resolver, ctx } = setup({ channelId: '2', profiles: [seller('2', '/logo-a'), seller('3', '/logo-b')] });
    assert.deepEqual(await resolver.labelProductBusinessLogo(ctx, '10'), { status: 'AVAILABLE', logo: { preview: '/logo-a' }, candidates: [] });
});

test('el canal general solo identifica el logo cuando hay un único vendedor', async () => {
    const one = setup({ superadmin: true, profiles: [seller('2', '/logo-a')] });
    assert.equal((await one.resolver.labelProductBusinessLogo(one.ctx, '10')).logo.preview, '/logo-a');
    const many = setup({ superadmin: true, profiles: [seller('2', '/logo-a'), seller('3', '/logo-b')] });
    const choices = await many.resolver.labelProductBusinessLogo(many.ctx, '10');
    assert.equal(choices.status, 'AMBIGUOUS');
    assert.equal(choices.candidates.length, 2);
    assert.equal((await many.resolver.labelProductBusinessLogo(many.ctx, '10', '3')).logo.preview, '/logo-b');
    await assert.rejects(many.resolver.labelProductBusinessLogo(many.ctx, '10', '4'), /negocio disponible/);
});

test('permite al superadministrador elegir el negocio para un producto sin asociación', async () => {
    const { resolver, ctx } = setup({ superadmin: true, profiles: [], allProfiles: [seller('2', '/logo-a')] });
    const result = await resolver.labelProductBusinessLogo(ctx, '10');
    assert.equal(result.status, 'NO_SELLER');
    assert.equal(result.candidates[0].id, '2');
    assert.equal((await resolver.labelProductBusinessLogo(ctx, '10', '2')).logo.preview, '/logo-a');
});

test('distingue un logo ausente y protege productos o canales ajenos', async () => {
    const missing = setup({ channelId: '2', profiles: [seller('2', null)] });
    assert.equal((await missing.resolver.labelProductBusinessLogo(missing.ctx, '10')).status, 'MISSING');
    const other = setup({ profiles: [seller('2', '/logo')] });
    assert.equal((await other.resolver.labelProductBusinessLogo(other.ctx, '10')).status, 'NO_SELLER');
    const invisible = setup({ visible: false });
    await assert.rejects(invisible.resolver.labelProductBusinessLogo(invisible.ctx, '10'), /producto en el canal/);
});

test('la variable se obtiene del logo del negocio y no de la foto del producto', () => {
    const variant = { sku: 'SKU', priceWithTax: 100, currencyCode: 'USD', options: [], product: { name: 'Zapato', featuredAsset: { preview: '/foto' } }, businessLogo: { status: 'AVAILABLE', logo: { preview: '/logo' } } };
    assert.equal(labelFields(variant).logoNegocio, '/logo');
    assert.equal(labelFields(variant).foto, '/foto');
    assert.equal(labelFields({ ...variant, businessLogo: { status: 'MISSING', logo: null } }).logoNegocio, '');
});

test('el renderizador usa el logo seleccionado y respeta su orientación', async () => {
    const originalDocument = global.document;
    const originalCanvas = fabric.StaticCanvas;
    const originalFromUrl = fabric.Image.fromURL;
    let loadedSource, imageSettings;
    global.document = { createElement: () => ({}) };
    fabric.StaticCanvas = class {
        loadFromJSON(design, done) { this.objects = design.objects; done(); }
        getObjects() { return this.objects; }
        remove(object) { this.objects.splice(this.objects.indexOf(object), 1); }
        insertAt(object, index) { this.objects.splice(index, 0, object); }
        renderAll() {}
        toDataURL() { return 'data:image/png;base64,example'; }
        dispose() {}
    };
    fabric.Image.fromURL = (url, callback) => { loadedSource = url; callback({ width: 100, height: 50, set: settings => { imageSettings = settings; } }); };
    try {
        const variant = { sku: 'SKU', priceWithTax: 100, currencyCode: 'USD', options: [], product: { name: 'Zapato' }, businessLogo: { status: 'AVAILABLE', logo: { preview: '/logo-negocio' }, candidates: [] } };
        const design = JSON.stringify({ objects: [{ left: 0, top: 0, getScaledWidth: undefined, data: { field: 'logoNegocio', grid: { fromColumn: 0, toColumn: 2, fromRow: 0, toRow: 1 }, rotation: 90 } }] });
        const result = await renderLabel({ name: 'Prueba', widthMm: 70, heightMm: 40, design }, variant);
        assert.equal(result, 'data:image/png;base64,example');
        assert.equal(loadedSource, '/logo-negocio');
        assert.equal(imageSettings.angle, 90);
    } finally {
        global.document = originalDocument;
        fabric.StaticCanvas = originalCanvas;
        fabric.Image.fromURL = originalFromUrl;
    }
});
