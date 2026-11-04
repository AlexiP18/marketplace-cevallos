const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { VariantSkuSubscriber } = require('../src/plugins/footwear-catalog/services/variant-sku.subscriber');
const { QR_OPTIONS, code128Options } = require('../src/plugins/labeling/shared/label-symbols');
const { barcodeImage } = require('../src/plugins/labeling/shared/label-renderer');
const bwip = require('bwip-js');
const sharp = require('sharp');
const jsqr = require('jsqr');
const { MarketplaceFileService } = require('../src/plugins/marketplace/marketplace-file.service');
const { LabelPdfService } = require('../src/plugins/labeling/services/label-pdf.service');
const { Permission } = require('@vendure/core');
const { footwearCustomFields } = require('../src/plugins/footwear-catalog/catalog-custom-fields');

test('el servidor genera SKU únicos, ignora el provisional y conserva el SKU existente', () => {
    const connection = { rawConnection: { subscribers: [] } };
    const subscriber = new VariantSkuSubscriber(connection);
    subscriber.onModuleInit(); subscriber.onModuleInit();
    assert.equal(connection.rawConnection.subscribers.length, 1);
    const skus = new Set();
    for (let index = 0; index < 1000; index++) {
        const entity = { sku: 'IGNORAR-ESTE-VALOR', customFields: { colores: [] } };
        subscriber.beforeInsert({ entity });
        assert.match(entity.sku, /^PV-[A-F0-9]{32}$/);
        assert.equal(entity.customFields.codigoBarras, entity.sku);
        assert.deepEqual(entity.customFields.colores, []);
        skus.add(entity.sku);
    }
    assert.equal(skus.size, 1000);
    assert.throws(() => subscriber.beforeUpdate({ entity: { sku: 'CAMBIO' }, databaseEntity: { sku: 'ANTERIOR' } }), /no se puede modificar/);
    subscriber.beforeUpdate({ entity: { sku: 'ANTERIOR' }, databaseEntity: { sku: 'ANTERIOR' } });
    subscriber.beforeUpdate({ entity: { enabled: false }, databaseEntity: { sku: 'ANTERIOR' } });
});

test('el lector gratuito decodifica el QR emitido con nivel M y sin claves internas', async () => {
    const code = 'SBX1:71b25d6e-ef6c-4b0e-93a9-e73dfb7fa333';
    assert.equal(QR_OPTIONS.eclevel, 'M');
    assert.ok(QR_OPTIONS.paddingwidth >= 4 && QR_OPTIONS.paddingheight >= 4);
    const png = await bwip.toBuffer({ ...QR_OPTIONS, text: code });
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsqr(new Uint8ClampedArray(data), info.width, info.height);
    assert.equal(decoded?.data, code);
    assert.match(decoded.data, /^SBX1:[a-f0-9-]{36}$/);
});

test('la vista previa usa el mismo Code128 que el Worker y no imprime texto inferior', () => {
    const value = 'PV-AZUL-38';
    const options = code128Options(value);
    assert.equal(options.bcid, 'code128');
    assert.equal(options.includetext, false);
    const svg = decodeURIComponent(barcodeImage(value).split(',')[1]);
    assert.equal(svg, bwip.toSVG(options));
    assert.ok(!svg.includes('<text'));
});

test('las copias por par se validan como números antes de encolar el lote', async () => {
    const labelPdf = new LabelPdfService({}, { findOne: async () => ({ id: 9 }) }, {}, {});
    const files = new MarketplaceFileService({}, labelPdf, {}, {});
    files.add = async (_ctx, _kind, input) => input;
    const ctx = { userHasAllPermissions: permissions => !permissions.includes(Permission.SuperAdmin) };
    const input = { draft: { widthMm: 70, heightMm: 40, design: '{"objects":[]}' }, items: [{ variantId: 9, quantity: 2, copiesPerPair: 2 }], layout: { paper: 'a4', columns: 2, rows: 4, marginLeftMm: 0, marginRightMm: 0, marginTopMm: 0, marginBottomMm: 0 } };
    for (const copiesPerPair of [0, '2', 3, -1]) await assert.rejects(files.labels(ctx, { ...input, items: [{ ...input.items[0], copiesPerPair }] }), /cantidades/);
    const queued = await files.labels(ctx, input);
    assert.equal(queued.items[0].copiesPerPair, 2);
    assert.match(queued.batchCode, /^[a-f0-9-]{36}$/);
});

test('los campos del catálogo conservan su contrato y sus editores registrados', () => {
    assert.deepEqual(footwearCustomFields.Product.map(field => field.name), ['horma', 'combinacionesColores', 'codigo', 'genero', 'tipo', 'estilo', 'suela', 'capellada', 'rangoTallas', 'precioBase', 'margenGanancia', 'ajustesRangoTalla', 'ajustesCapellada', 'extrasPrecio', 'ajustesSuela']);
    assert.deepEqual(footwearCustomFields.ProductVariant.map(field => field.name), ['codigo', 'codigoBarras', 'colores']);
    const source = require('node:fs').readFileSync(path.join(__dirname, '../src/plugins/footwear-catalog/dashboard/index.tsx'), 'utf8');
    const ids = new Set([...source.matchAll(/\bid:\s*'([^']+)'/g)].map(match => match[1]));
    for (const fields of Object.values(footwearCustomFields)) for (const field of fields) if (field.ui?.component) assert.ok(ids.has(field.ui.component), field.ui.component);
    assert.ok(footwearCustomFields.ProductVariant.filter(field => ['codigo', 'codigoBarras'].includes(field.name)).every(field => field.readonly));
});
