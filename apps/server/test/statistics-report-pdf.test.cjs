const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatisticsReportPdf } = require('../src/plugins/statistics/dashboard/statistics-report-pdf');

test('el informe PDF pagina tablas largas y conserva sus encabezados', () => {
    const pdf = buildStatisticsReportPdf({
        title: 'Inventario y reposición', channel: 'almacen', period: '2026-10-01 al 2026-10-28', scope: 'Canal',
        metrics: [['Variantes', 200]],
        sections: [{ title: 'Existencias', columns: ['Producto', 'Stock disponible'], rows: Array.from({ length: 200 }, (_, index) => [`Zapato ${index + 1}`, index]) }],
    });
    assert.ok(pdf.getNumberOfPages() > 1);
    assert.ok(pdf.output('arraybuffer').byteLength > 1000);
});
