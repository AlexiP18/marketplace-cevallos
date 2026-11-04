const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { WarehouseService } = require('../src/plugins/warehouse/services/warehouse.service');
const { LabelCodeService } = require('../src/plugins/labeling/services/label-code.service');

const ctx = { channelId: 2, activeUserId: 8 };
function setup() {
    const record = { details: { status: 'PENDING', amount: 5000, reference: 'REF-10', institution: 'Banco' } };
    const calls = [];
    const connection = { getRepository: (_ctx, type) => type.name === 'WarehousePickScan' ? { count: async () => 0 } : { findOne: async () => record, save: async value => calls.push(value) } };
    const service = new WarehouseService(connection, {}, {}, {}, {
        addManualPaymentToOrder: async () => { calls.push('paid'); return {}; },
        cancelOrder: async () => { calls.push('cancelled'); return {}; },
    }, {}, {}, {release:async()=>calls.push('released')});
    service.operationalOrder = async () => ({ id: 1, state: 'ArrangingPayment', totalWithTax: 5000 });
    return { service, record, calls };
}
test('aprobar el comprobante confirma el pago y conserva el responsable', async () => {
    const { service, record, calls } = setup();
    await service.reviewPayment(ctx, 1, true);
    assert.equal(calls[0], 'paid');
    assert.equal(record.details.status, 'APPROVED');
    assert.equal(record.details.reviewedBy, '8');
    await assert.rejects(service.reviewPayment(ctx, 1, true), /pendiente/);
});
test('rechazar exige motivo y cancela para liberar la reserva', async () => {
    const { service, record, calls } = setup();
    await assert.rejects(service.reviewPayment(ctx, 1, false, 'no'), /motivo/);
    assert.equal(calls.length, 0);
    await service.reviewPayment(ctx, 1, false, 'El importe no fue acreditado');
    assert.deepEqual(calls.slice(0,2), ['released','cancelled']);
    assert.equal(record.details.status, 'REJECTED');
});
test('el despacho rechaza pago insuficiente y pares pendientes de escaneo', async () => {
    const { service } = setup();
    service.operationalOrder = async () => ({ state: 'PaymentAuthorized', payments: [], totalWithTax: 5000 });
    await assert.rejects(service.dispatch(ctx, 1, 'Transportista', 'GUIA-1'), /pago/);
    service.operationalOrder = async () => ({ state: 'PaymentSettled', payments: [{ state: 'Settled', amount: 5000 }], totalWithTax: 5000, lines: [{ id: 1, quantity: 2 }] });
    await assert.rejects(service.dispatch(ctx, 1, 'Transportista', 'GUIA-1'), /validar/);
});
test('el comprobante rechaza un archivo de formato falso y un importe incorrecto', async () => {
    const { service } = setup();
    await assert.rejects(service.saveProof(ctx, { orderId: 1, reference: 'REF', institution: 'Banco', amount: 1, file: '' }), /importe/);
    await assert.rejects(service.saveProof(ctx, { orderId: 1, reference: 'REF', institution: 'Banco', amount: 5000, file: 'data:application/pdf;base64,SG9sYQ==' }), /contenido/);
});

test('el QR individual no permite validar dos veces la misma etiqueta', async () => {
    let saved;
    const issued = { id: 11, code: 'SBX1:71b25d6e-ef6c-4b0e-93a9-e73dfb7fa333', productVariantId: 9, channelId: 2, ready: true };
    const connection = { getRepository: (_ctx, type) => {
        if (type.name === 'OrderLine') return { findOne: async () => ({ id: 3, productVariantId: 9, quantity: 2, order: { state: 'PaymentSettled', channels: [{ id: 2 }] } }) };
        if (type.name === 'StockLevel') return { query: async () => [] };
        if (type.name === 'Allocation') return { find: async () => [{ quantity: 2 }] };
        if (type.name === 'WarehousePickScan') return { findOne: async () => saved, count: async () => saved ? 1 : 0, save: async value => (saved = value) };
        if (type.name === 'LabelCode') return { findOne: async ({ where }) => where.code === issued.code && where.channelId === issued.channelId && issued.ready ? issued : null };
        throw new Error(type.name);
    } };
    const service = new WarehouseService(connection, {}, {}, {}, {}, {}, new LabelCodeService(connection));
    service.actor = async () => ({ channel: { id: 2 } });
    service.shelf = async () => ({ code: 'P-01', stockLocation: { id: 5 } });
    const input = { orderLineId: 3, shelfId: 5, code: issued.code };
    await assert.rejects(service.scan(ctx, { ...input, code: 'SBX1:71b25d6e-ef6c-4b0e-93a9-e73dfb7fa334' }), /no está emitida/);
    issued.ready = false;
    await assert.rejects(service.scan(ctx, input), /no está emitida/);
    issued.ready = true;
    issued.productVariantId = 10;
    await assert.rejects(service.scan(ctx, input), /no corresponde a la variante/);
    issued.productVariantId = 9;
    issued.channelId = 3;
    await assert.rejects(service.scan(ctx, input), /no está emitida/);
    issued.channelId = 2;
    assert.equal((await service.scan(ctx, input)).scanned, 1);
    assert.equal(saved.labelCodeId, issued.id);
    await assert.rejects(service.scan(ctx, input), /ya fue utilizada/);
    await assert.rejects(service.scan(ctx, { ...input, code: 'PV:9' }), /etiquetas anteriores/);
});
