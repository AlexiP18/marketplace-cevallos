import { generateWorkerFile } from '../../marketplace/dashboard/file-jobs';
import { api, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger, useAuth, useChannel, useQuery } from '@vendure/dashboard';
import { isSuperadmin } from '../../multivendor/dashboard/superadmin-scope';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildStatisticsReportPdf, type StatisticsReportDocument } from './statistics-report-pdf';

type Summary = {
    currencyCode: string; orderCount: number; pairCount: number; refundedPairs: number;
    articleSales: number; refundedAmount: number; averageOrderValue: number;
    previousOrderCount: number; previousPairCount: number; previousArticleSales: number;
};
type Day = { date: string; orderCount: number; pairCount: number; articleSales: number };
type Variant = {
    variantId: string; productId: string; productName: string; productCode: string; sku: string;
    color: string; size: string; upper: string; sole: string; gender: string; type: string; style: string;
    pairCount: number; refundedPairs: number; articleSales: number; stockOnHand: number; stockAllocated: number;
    tracksInventory: boolean; outOfStockThreshold: number; inCatalog: boolean;
};
type Overview = { modelCount: number; variantCount: number; unsoldModelCount: number; stagnantModelCount: number; trackedVariantCount: number; physicalPairs: number; allocatedPairs: number; depletedVariantCount: number };
type Segment = { dimension: string; value: string; pairCount: number; stockAvailable: number };
type MatrixCell = { color: string; size: string; pairCount: number; stockAvailable: number };
type Report = { summary: Summary; days: Day[]; overview: Overview; segments: Segment[]; matrix: MatrixCell[]; variants: Variant[] };
type ProductTotal = { id: string; name: string; code: string; pairCount: number; refundedPairs: number; articleSales: number; available: number };
type ReportTab = 'resumen' | 'productos' | 'matriz' | 'inventario' | 'catalogo';
const reportTitles: Record<ReportTab, string> = { resumen: 'Resumen de ventas', productos: 'Productos y variantes', matriz: 'Tallas y colores', inventario: 'Inventario y reposición', catalogo: 'Catálogo y rotación' };
const dimensionLabels: Record<string, string> = { gender: 'género', type: 'tipo', style: 'estilo', upper: 'capellada', sole: 'suela' };

const query = `query FootwearStatistics($input: FootwearStatisticsInput!) {
    footwearStatistics(input: $input) {
        summary { currencyCode orderCount pairCount refundedPairs articleSales refundedAmount averageOrderValue previousOrderCount previousPairCount previousArticleSales }
        days { date orderCount pairCount articleSales }
        overview { modelCount variantCount unsoldModelCount stagnantModelCount trackedVariantCount physicalPairs allocatedPairs depletedVariantCount }
        segments { dimension value pairCount stockAvailable }
        matrix { color size pairCount stockAvailable }
        variants { variantId productId productName productCode sku color size upper sole gender type style pairCount refundedPairs articleSales stockOnHand stockAllocated tracksInventory outOfStockThreshold inCatalog }
    }
}`;
const dayMs = 86_400_000;
const businessDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' });

function dayKey(value: Date) {
    const parts = Object.fromEntries(businessDate.formatToParts(value).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function startOfDay(value: string) { return new Date(`${value}T00:00:00-05:00`); }
function money(cents: number, currency: string) { return new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(cents / 100); }
function available(row: Variant) { return Math.max(0, row.stockOnHand - row.stockAllocated); }
function saleable(row: Variant) { return Math.max(0, row.stockOnHand - row.stockAllocated - row.outOfStockThreshold); }
function netSold(row: Variant) { return Math.max(0, row.pairCount - row.refundedPairs); }
function coverage(stock: number, sold: number, days: number) { return sold > 0 ? Math.round(stock * days / sold) : null; }
function reorder(row: Variant, days: number, leadDays: number, safetyStock: number) {
    if (netSold(row) === 0) return 0;
    return Math.max(0, Math.ceil(netSold(row) * leadDays / days) + safetyStock - available(row));
}

function change(previous: number, current: number) {
    if (previous === 0) return current === 0 ? 'Sin variación' : 'Nuevo en este período';
    const percent = Math.round((current - previous) / previous * 100);
    return `${percent > 0 ? '+' : ''}${percent}% frente al período anterior`;
}

function periodKey(date: string, grouping: 'day' | 'week' | 'month') {
    if (grouping === 'day') return date;
    if (grouping === 'month') return date.slice(0, 7);
    const first = new Date(`${date}T12:00:00Z`);
    first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
    return first.toISOString().slice(0, 10);
}

function csvCell(value: string | number) {
    const text = String(value);
    const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: Variant[], start: string, end: string, currency: string) {
    const columns = ['Desde', 'Hasta', 'Moneda', 'Código', 'Producto', 'SKU', 'Color', 'Talla', 'Capellada', 'Suela', 'Género', 'Tipo', 'Estilo', 'Pares vendidos', 'Pares reembolsados', 'Venta artículos', 'Stock disponible'];
    const records = rows.map(row => [start, end, currency, row.productCode, row.productName, row.sku, row.color, row.size, row.upper, row.sole, row.gender, row.type, row.style, row.pairCount, row.refundedPairs, (row.articleSales / 100).toFixed(2), available(row)]);
    const csv = `\uFEFF${[columns, ...records].map(record => record.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventas-calzado-${start}-${end}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadAnalysisCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
    const csv = `\uFEFF${[headers, ...rows].map(record => record.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StatisticsPage() {
    const { activeChannel } = useChannel();
    const { channels } = useAuth();
    const generalOnly = isSuperadmin(channels);
    const [start, setStart] = useState(() => dayKey(new Date(Date.now() - 29 * dayMs)));
    const [end, setEnd] = useState(() => dayKey(new Date()));
    const [grouping, setGrouping] = useState<'day' | 'week' | 'month'>('day');
    const [productId, setProductId] = useState('');
    const [upper, setUpper] = useState('');
    const [sole, setSole] = useState('');
    const [matrixValue, setMatrixValue] = useState<'sales' | 'stock'>('sales');
    const [generalDimension, setGeneralDimension] = useState('gender');
    const [search, setSearch] = useState('');
    const [gender, setGender] = useState('');
    const [type, setType] = useState('');
    const [style, setStyle] = useState('');
    const [reportUpper, setReportUpper] = useState('');
    const [reportSole, setReportSole] = useState('');
    const [leadDays, setLeadDays] = useState(14);
    const [safetyStock, setSafetyStock] = useState(5);
    const [inventorySearch, setInventorySearch] = useState('');
    const [inventoryFilter, setInventoryFilter] = useState<'all' | 'reorder' | 'zero'>('all');
    const [activeTab, setActiveTab] = useState<ReportTab>('resumen');
    const [pdfPreview, setPdfPreview] = useState<{ pdf: ReturnType<typeof buildStatisticsReportPdf>; url: string; filename: string; title: string } | null>(null);
    const [pdfError, setPdfError] = useState('');
    const [excelBusy, setExcelBusy] = useState(false);
    useEffect(() => () => { if (pdfPreview) URL.revokeObjectURL(pdfPreview.url); }, [pdfPreview]);
    const startDate = startOfDay(start);
    const endDate = new Date(startOfDay(end).getTime() + dayMs);
    const valid = Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime()) && endDate > startDate && endDate.getTime() - startDate.getTime() <= 366 * dayMs;
    const statistics = useQuery({
        queryKey: ['footwear-statistics', activeChannel?.id, start, end],
        queryFn: async () => (await api.query<{ footwearStatistics: Report }>(query, { input: { startDate: startDate.toISOString(), endDate: endDate.toISOString() } })).footwearStatistics,
        enabled: valid && Boolean(activeChannel?.id),
    });
    const report = statistics.data;
    const currency = report?.summary.currencyCode || 'USD';
    const periodDays = valid ? Math.max(1, (endDate.getTime() - startDate.getTime()) / dayMs) : 1;

    const chart = useMemo(() => {
        const grouped = new Map<string, Day>();
        for (const day of report?.days || []) {
            const date = periodKey(day.date, grouping);
            const current = grouped.get(date) || { date, orderCount: 0, pairCount: 0, articleSales: 0 };
            current.orderCount += day.orderCount;
            current.pairCount += day.pairCount;
            current.articleSales += day.articleSales;
            grouped.set(date, current);
        }
        return [...grouped.values()];
    }, [report, grouping]);
    const allVariants = report?.variants || [];
    const choices = (field: 'gender' | 'type' | 'style' | 'upper' | 'sole') => [...new Set(allVariants.map(row => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const reportVariants = allVariants.filter(row =>
        (!gender || row.gender === gender) && (!type || row.type === type) && (!style || row.style === style) &&
        (!reportUpper || row.upper === reportUpper) && (!reportSole || row.sole === reportSole));
    const products = useMemo(() => {
        const grouped = new Map<string, ProductTotal>();
        for (const row of reportVariants) {
            const product = grouped.get(row.productId) || { id: row.productId, name: row.productName, code: row.productCode, pairCount: 0, refundedPairs: 0, articleSales: 0, available: 0 };
            product.pairCount += row.pairCount;
            product.refundedPairs += row.refundedPairs;
            product.articleSales += row.articleSales;
            product.available += available(row);
            grouped.set(row.productId, product);
        }
        return [...grouped.values()].sort((a, b) => b.articleSales - a.articleSales);
    }, [report, gender, type, style, reportUpper, reportSole]);
    const activeProductIds = new Set(reportVariants.filter(row => row.inCatalog).map(row => row.productId));
    const matrixProducts = products.filter(product => activeProductIds.has(product.id));
    const selectedProductId = matrixProducts.some(product => product.id === productId) ? productId : matrixProducts[0]?.id || '';
    const productVariants = reportVariants.filter(row => row.inCatalog && row.productId === selectedProductId);
    const upperOptions = [...new Set(productVariants.map(row => row.upper).filter(Boolean))].sort();
    const soleOptions = [...new Set(productVariants.map(row => row.sole).filter(Boolean))].sort();
    const selectedUpper = upperOptions.includes(upper) ? upper : '';
    const selectedSole = soleOptions.includes(sole) ? sole : '';
    const filteredVariants = productVariants.filter(row => (!selectedUpper || row.upper === selectedUpper) && (!selectedSole || row.sole === selectedSole));
    const sizes = [...new Set(filteredVariants.map(row => row.size).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const colors = [...new Set(filteredVariants.map(row => row.color || 'Sin color'))].sort((a, b) => a.localeCompare(b, 'es'));
    const matrix = new Map<string, { sales: number; stock: number }>();
    for (const row of filteredVariants) {
        const key = `${row.color || 'Sin color'}\u0000${row.size}`;
        const cell = matrix.get(key) || { sales: 0, stock: 0 };
        cell.sales += Math.max(0, row.pairCount - row.refundedPairs);
        cell.stock += available(row);
        matrix.set(key, cell);
    }
    const filteredProducts = products.filter(product => product.pairCount > 0 && `${product.name} ${product.code}`.toLowerCase().includes(search.toLowerCase()));
    const exportVariants = reportVariants.filter(row => `${row.productName} ${row.productCode}`.toLowerCase().includes(search.toLowerCase()));
    const selectedSalesProductId = filteredProducts.some(product => product.id === productId) ? productId : filteredProducts[0]?.id || '';
    const salesVariants = reportVariants.filter(row => row.productId === selectedSalesProductId && row.pairCount > 0);
    const inventory = allVariants.filter(row => row.inCatalog && row.tracksInventory);
    const inventoryRows = inventory.filter(row => {
        const matches = `${row.productName} ${row.productCode} ${row.sku} ${row.color} ${row.size}`.toLowerCase().includes(inventorySearch.toLowerCase());
        return matches && (inventoryFilter === 'all' || (inventoryFilter === 'reorder' && reorder(row, periodDays, leadDays, safetyStock) > 0) || (inventoryFilter === 'zero' && available(row) === 0));
    }).sort((a, b) => reorder(b, periodDays, leadDays, safetyStock) - reorder(a, periodDays, leadDays, safetyStock) || a.productName.localeCompare(b.productName, 'es'));
    const catalog = new Map<string, { id: string; code: string; name: string; variants: number; tracked: number; withoutSales: number; sold: number; stock: number }>();
    for (const row of allVariants.filter(row => row.inCatalog)) {
        const item = catalog.get(row.productId) || { id: row.productId, code: row.productCode, name: row.productName, variants: 0, tracked: 0, withoutSales: 0, sold: 0, stock: 0 };
        item.variants++;
        item.withoutSales += netSold(row) === 0 ? 1 : 0;
        item.sold += netSold(row);
        if (row.tracksInventory) { item.tracked++; item.stock += available(row); }
        catalog.set(row.productId, item);
    }
    const catalogRows = [...catalog.values()].sort((a, b) => a.sold - b.sold || b.stock - a.stock);
    const catalogStatus = (sold: number, stock: number, tracked: number) => tracked === 0 ? 'Inventario no controlado' : sold === 0 ? (stock > 0 ? 'Sin ventas; stock inmóvil' : 'Sin ventas ni stock') : stock === 0 ? 'Sin stock' : coverage(stock, sold, periodDays)! >= periodDays * 2 ? 'Rotación lenta' : 'Con ventas';

    function generateReport() {
        if (!report || !valid || statistics.isFetching) return;
        try {
            const document: StatisticsReportDocument = {
                title: reportTitles[activeTab],
                channel: activeChannel?.code || String(activeChannel?.id || ''),
                period: `${start} al ${end}`,
                scope: generalOnly ? 'General' : 'Canal y filtros actuales',
                sections: [],
            };
            if (activeTab === 'resumen') {
                document.metrics = [
                    ['Ventas de artículos', money(report.summary.articleSales, currency)],
                    ['Pedidos pagados', report.summary.orderCount],
                    ['Pares vendidos', report.summary.pairCount],
                    ['Promedio por pedido', money(report.summary.averageOrderValue, currency)],
                    ['Reembolsos', money(report.summary.refundedAmount, currency)],
                ];
                document.sections.push({ title: `Evolución por ${grouping === 'day' ? 'día' : grouping === 'week' ? 'semana' : 'mes'}`, columns: ['Período', 'Pedidos', 'Pares', 'Ventas de artículos'], rows: chart.map(day => [day.date, day.orderCount, day.pairCount, money(day.articleSales, currency)]) });
                document.note = 'Ventas de artículos con descuentos e impuestos; no incluyen envío y se muestran antes de restar reembolsos.';
            } else if (activeTab === 'productos') {
                if (generalOnly) {
                    document.metrics = [['Modelos con variantes', report.overview.modelCount], ['Variantes activas', report.overview.variantCount]];
                    document.sections.push({ title: `Distribución por ${dimensionLabels[generalDimension]}`, columns: ['Categoría', 'Pares vendidos netos', 'Stock disponible'], rows: report.segments.filter(row => row.dimension === generalDimension).map(row => [row.value, row.pairCount, row.stockAvailable]) });
                } else {
                    document.sections.push({ title: 'Ventas por producto', columns: ['Código', 'Producto', 'Pares', 'Reembolsados', 'Ventas de artículos', 'Stock disponible'], rows: filteredProducts.map(row => [row.code, row.name, row.pairCount, row.refundedPairs, money(row.articleSales, currency), row.available]) });
                    document.sections.push({ title: 'Detalle de variantes', columns: ['Código', 'Producto', 'SKU', 'Color', 'Talla', 'Capellada', 'Suela', 'Pares netos', 'Ventas', 'Stock'], rows: exportVariants.map(row => [row.productCode, row.productName, row.sku, row.color, row.size, row.upper, row.sole, netSold(row), money(row.articleSales, currency), available(row)]) });
                    document.note = `Filtros: género ${gender || 'todos'}, tipo ${type || 'todos'}, estilo ${style || 'todos'}, capellada ${reportUpper || 'todas'}, suela ${reportSole || 'todas'}, búsqueda ${search || 'todas'}.`;
                }
            } else if (activeTab === 'matriz') {
                document.note = `Métrica: ${matrixValue === 'sales' ? 'pares vendidos netos' : 'stock disponible'}.`;
                if (generalOnly) {
                    document.sections.push({ title: 'Todas las variantes', columns: ['Color', 'Talla', 'Cantidad'], rows: report.matrix.map(row => [row.color, row.size, matrixValue === 'sales' ? row.pairCount : row.stockAvailable]) });
                } else {
                    document.note += ` Producto: ${matrixProducts.find(row => row.id === selectedProductId)?.name || 'Sin seleccionar'}. Capellada: ${selectedUpper || 'todas'}. Suela: ${selectedSole || 'todas'}.`;
                    document.sections.push({ title: 'Variantes seleccionadas', columns: ['Color', 'Talla', 'Cantidad'], rows: filteredVariants.map(row => [row.color, row.size, matrixValue === 'sales' ? netSold(row) : available(row)]) });
                }
            } else if (activeTab === 'inventario') {
                if (generalOnly) {
                    document.metrics = [['Variantes con inventario', report.overview.trackedVariantCount], ['Pares físicos', report.overview.physicalPairs], ['Pares reservados', report.overview.allocatedPairs], ['Variantes agotadas', report.overview.depletedVariantCount]];
                    document.sections.push({ title: 'Stock por talla', columns: ['Talla', 'Pares vendidos netos', 'Stock disponible'], rows: report.segments.filter(row => row.dimension === 'size').map(row => [row.value, row.pairCount, row.stockAvailable]) });
                } else {
                    document.metrics = [['Plazo de reposición (días)', leadDays], ['Reserva por variante (pares)', safetyStock]];
                    document.sections.push({ title: 'Existencias y reposición', columns: ['Código', 'Producto', 'SKU', 'Color', 'Talla', 'Físico', 'Reservado', 'Disponible', 'Reponer'], rows: inventoryRows.map(row => [row.productCode, row.productName, row.sku, row.color, row.size, row.stockOnHand, row.stockAllocated, available(row), reorder(row, periodDays, leadDays, safetyStock)]) });
                }
                document.note = generalOnly ? 'Las existencias son actuales. La demanda corresponde al período seleccionado.' : `Las existencias son actuales. La demanda corresponde al período seleccionado. Mostrar: ${inventoryFilter}. Búsqueda: ${inventorySearch || 'todas'}.`;
            } else {
                if (generalOnly) {
                    document.metrics = [['Modelos con variantes', report.overview.modelCount], ['Modelos sin ventas', report.overview.unsoldModelCount], ['Modelos con stock inmóvil', report.overview.stagnantModelCount]];
                    document.sections.push({ title: 'Rotación por tipo', columns: ['Tipo', 'Pares vendidos netos', 'Stock disponible'], rows: report.segments.filter(row => row.dimension === 'type').map(row => [row.value, row.pairCount, row.stockAvailable]) });
                } else {
                    document.sections.push({ title: 'Rotación por modelo', columns: ['Código', 'Modelo', 'Variantes', 'Sin ventas', 'Vendido neto', 'Stock', 'Cobertura días', 'Diagnóstico'], rows: catalogRows.map(row => [row.code, row.name, row.variants, row.withoutSales, row.sold, row.tracked ? row.stock : 'No controlado', row.tracked ? coverage(row.stock, row.sold, periodDays) ?? 'Sin demanda' : 'No controlado', catalogStatus(row.sold, row.stock, row.tracked)]) });
                }
                document.note = 'La rotación se estima con las ventas del período y las existencias actuales.';
            }
            const pdf = buildStatisticsReportPdf(document);
            setPdfPreview({ pdf, url: URL.createObjectURL(pdf.output('blob')), filename: `estadisticas-${activeTab}-${start}-${end}.pdf`, title: document.title });
            setPdfError('');
        } catch (error) {
            setPdfError(`No se pudo generar el informe: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async function exportExcel() {
        setExcelBusy(true); setPdfError('');
        try {
            const output = await generateWorkerFile('report', { startDate: startDate.toISOString(), endDate: endDate.toISOString() });
            const url = URL.createObjectURL(output.blob);
            const link = document.createElement('a'); link.href = url; link.download = output.result.name; link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) { setPdfError(error instanceof Error ? error.message : 'No se pudo crear el Excel.'); }
        finally { setExcelBusy(false); }
    }

    function printReport() {
        if (!pdfPreview) return;
        const tab = window.open('about:blank', '_blank');
        if (!tab) { setPdfError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para imprimir.'); return; }
        pdfPreview.pdf.autoPrint();
        const url = URL.createObjectURL(pdfPreview.pdf.output('blob'));
        tab.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
    }

    return <div className="space-y-6 p-6">
        <div><h1 className="text-2xl font-semibold">Estadísticas de calzado</h1><p className="text-sm text-muted-foreground">Pedidos pagados del canal activo, en su moneda. Ventas de artículos con descuentos e impuestos, sin envío y antes de reembolsos.</p></div>
        <div className="flex flex-wrap items-end gap-3 rounded-md border p-4">
            <label className="text-sm">Desde<input type="date" value={start} onChange={event => setStart(event.target.value)} className="mt-1 block h-9 rounded-md border bg-background px-2" /></label>
            <label className="text-sm">Hasta<input type="date" value={end} onChange={event => setEnd(event.target.value)} className="mt-1 block h-9 rounded-md border bg-background px-2" /></label>
            <span className="pb-2 text-xs text-muted-foreground">Fechas de Ecuador (UTC−5) · máximo 366 días</span>
        </div>
        {!valid && <p className="text-sm text-destructive">Selecciona un rango válido de hasta 366 días.</p>}
        {statistics.isLoading && <p className="text-sm">Cargando estadísticas…</p>}
        {statistics.error && <p className="text-sm text-destructive">No se pudieron cargar las estadísticas: {String(statistics.error)}</p>}
        {report && valid && <Tabs value={activeTab} onValueChange={value => setActiveTab(value as ReportTab)} className="space-y-4">
            <TabsList className="h-auto flex-wrap"><TabsTrigger value="resumen">Resumen</TabsTrigger><TabsTrigger value="productos">Productos y variantes</TabsTrigger><TabsTrigger value="matriz">Tallas y colores</TabsTrigger><TabsTrigger value="inventario">Inventario y reposición</TabsTrigger><TabsTrigger value="catalogo">Catálogo y rotación</TabsTrigger></TabsList>
            <div className="flex flex-wrap items-center gap-3"><Button type="button" onClick={generateReport} disabled={statistics.isFetching}>Generar informe PDF</Button><span className="text-xs text-muted-foreground">El PDF incluye la pestaña y filtros actuales.</span><Button type="button" variant="outline" onClick={() => void exportExcel()} disabled={excelBusy || statistics.isFetching}>{excelBusy ? 'Generando Excel en el Worker…' : 'Descargar Excel del período'}</Button></div>
            {pdfError && <p className="text-sm text-destructive" role="alert">{pdfError}</p>}
            <TabsContent value="resumen" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Ventas de artículos', value: money(report.summary.articleSales, currency), previous: change(report.summary.previousArticleSales, report.summary.articleSales) },
                        { label: 'Pedidos pagados', value: report.summary.orderCount.toLocaleString('es-EC'), previous: change(report.summary.previousOrderCount, report.summary.orderCount) },
                        { label: 'Pares vendidos', value: report.summary.pairCount.toLocaleString('es-EC'), previous: change(report.summary.previousPairCount, report.summary.pairCount) },
                        { label: 'Promedio por pedido', value: money(report.summary.averageOrderValue, currency), previous: 'Solo artículos, sin envío' },
                    ].map(card => <div key={card.label} className="rounded-md border p-4"><div className="text-sm text-muted-foreground">{card.label}</div><div className="mt-2 text-2xl font-semibold">{card.value}</div><div className="mt-1 text-xs text-muted-foreground">{card.previous}</div></div>)}
                </div>
                <div className="rounded-md border p-4 text-sm">Reembolsos registrados para estos pedidos: <strong>{money(report.summary.refundedAmount, currency)}</strong> · pares asociados a reembolsos: <strong>{report.summary.refundedPairs}</strong>. El importe de reembolsos puede incluir envío o ajustes generales.</div>
                <section className="rounded-md border p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">Evolución de ventas</h2><label className="text-sm">Agrupar por <select value={grouping} onChange={event => setGrouping(event.target.value as typeof grouping)} className="ml-2 h-9 rounded-md border bg-background px-2"><option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option></select></label></div>
                    <div role="img" aria-label="Gráfico de ventas de artículos por período" className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" minTickGap={24} /><YAxis tickFormatter={value => String(Math.round(Number(value) / 100))} /><Tooltip formatter={value => money(Number(value), currency)} /><Bar dataKey="articleSales" name="Ventas" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                </section>
            </TabsContent>
            {generalOnly && <>
                <TabsContent value="productos" className="space-y-4">
                    <p className="text-sm text-muted-foreground">Distribución general del catálogo, sin identificar modelos ni variantes.</p>
                    <div className="grid gap-3 sm:grid-cols-2">{[
                        { label: 'Modelos con variantes', value: report.overview.modelCount },
                        { label: 'Variantes activas', value: report.overview.variantCount },
                    ].map(item => <div key={item.label} className="rounded-md border p-4"><div className="text-sm text-muted-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value.toLocaleString('es-EC')}</div></div>)}</div>
                    <label className="text-sm">Agrupar por <select value={generalDimension} onChange={event => setGeneralDimension(event.target.value)} className="ml-2 h-9 rounded-md border bg-background px-2"><option value="gender">Género</option><option value="type">Tipo</option><option value="style">Estilo</option><option value="upper">Capellada</option><option value="sole">Suela</option></select></label>
                    <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Categoría</th><th className="p-3 text-right">Pares vendidos netos</th><th className="p-3 text-right">Stock disponible</th></tr></thead><tbody>{report.segments.filter(row => row.dimension === generalDimension).map(row => <tr key={row.value} className="border-t"><td className="p-3">{row.value}</td><td className="p-3 text-right">{row.pairCount}</td><td className="p-3 text-right">{row.stockAvailable}</td></tr>)}</tbody></table></div>
                </TabsContent>
                <TabsContent value="matriz" className="space-y-4">
                    <p className="text-sm text-muted-foreground">Pares acumulados de todos los modelos por talla y combinación de color.</p>
                    <div className="flex gap-2"><Button type="button" size="sm" variant={matrixValue === 'sales' ? 'default' : 'outline'} onClick={() => setMatrixValue('sales')}>Pares vendidos netos</Button><Button type="button" size="sm" variant={matrixValue === 'stock' ? 'default' : 'outline'} onClick={() => setMatrixValue('stock')}>Stock disponible</Button></div>
                    <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Color</th><th className="p-3">Talla</th><th className="p-3 text-right">{matrixValue === 'sales' ? 'Pares vendidos netos' : 'Stock disponible'}</th></tr></thead><tbody>{report.matrix.map(row => <tr key={`${row.color}\u0000${row.size}`} className="border-t"><td className="p-3">{row.color}</td><td className="p-3">{row.size}</td><td className="p-3 text-right">{matrixValue === 'sales' ? row.pairCount : row.stockAvailable}</td></tr>)}</tbody></table></div>
                </TabsContent>
                <TabsContent value="inventario" className="space-y-4">
                    <p className="text-sm text-muted-foreground">Inventario total del catálogo con control de existencias.</p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
                        { label: 'Variantes con inventario', value: report.overview.trackedVariantCount },
                        { label: 'Pares físicos', value: report.overview.physicalPairs },
                        { label: 'Pares reservados', value: report.overview.allocatedPairs },
                        { label: 'Variantes agotadas', value: report.overview.depletedVariantCount },
                    ].map(item => <div key={item.label} className="rounded-md border p-4"><div className="text-sm text-muted-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value.toLocaleString('es-EC')}</div></div>)}</div>
                    <p className="text-sm">Stock disponible total: <strong>{Math.max(0, report.overview.physicalPairs - report.overview.allocatedPairs).toLocaleString('es-EC')}</strong> pares.</p>
                </TabsContent>
                <TabsContent value="catalogo" className="space-y-4">
                    <p className="text-sm text-muted-foreground">Rotación general durante el período seleccionado.</p>
                    <div className="grid gap-3 sm:grid-cols-3">{[
                        { label: 'Modelos con variantes', value: report.overview.modelCount },
                        { label: 'Modelos sin ventas', value: report.overview.unsoldModelCount },
                        { label: 'Modelos con stock inmóvil', value: report.overview.stagnantModelCount },
                    ].map(item => <div key={item.label} className="rounded-md border p-4"><div className="text-sm text-muted-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value.toLocaleString('es-EC')}</div></div>)}</div>
                </TabsContent>
            </>}
            {!generalOnly && <><TabsContent value="productos" className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
                    { label: 'Género', value: gender, set: setGender, values: choices('gender') },
                    { label: 'Tipo', value: type, set: setType, values: choices('type') },
                    { label: 'Estilo', value: style, set: setStyle, values: choices('style') },
                    { label: 'Capellada', value: reportUpper, set: setReportUpper, values: choices('upper') },
                    { label: 'Suela', value: reportSole, set: setReportSole, values: choices('sole') },
                ].map(filter => <label key={filter.label} className="text-sm">{filter.label}<select value={filter.value} onChange={event => filter.set(event.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-2"><option value="">Todos</option>{filter.values.map(value => <option key={value}>{value}</option>)}</select></label>)}</div>
                <div className="flex flex-wrap items-end justify-between gap-3"><label className="text-sm">Buscar modelo o código<input value={search} onChange={event => setSearch(event.target.value)} className="mt-1 block h-9 w-64 rounded-md border bg-background px-3" /></label><Button type="button" variant="outline" onClick={() => downloadCsv(exportVariants, start, end, currency)}>Descargar reporte CSV</Button></div>
                <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Código</th><th className="p-3">Producto</th><th className="p-3 text-right">Pares</th><th className="p-3 text-right">Reembolsados</th><th className="p-3 text-right">Ventas de artículos</th><th className="p-3 text-right">Stock disponible</th></tr></thead><tbody>{filteredProducts.map(product => <tr key={product.id} className="border-t"><td className="p-3">{product.code || '—'}</td><td className="p-3"><button type="button" onClick={() => setProductId(product.id)} className="text-left text-primary underline-offset-2 hover:underline">{product.name}</button></td><td className="p-3 text-right">{product.pairCount}</td><td className="p-3 text-right">{product.refundedPairs}</td><td className="p-3 text-right">{money(product.articleSales, currency)}</td><td className="p-3 text-right">{product.available}</td></tr>)}{!filteredProducts.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin ventas en este período.</td></tr>}</tbody></table></div>
                {!!salesVariants.length && <section className="space-y-2"><h2 className="font-medium">Variantes de {salesVariants[0].productName}</h2><div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">SKU</th><th className="p-3">Color</th><th className="p-3">Talla</th><th className="p-3">Capellada</th><th className="p-3">Suela</th><th className="p-3 text-right">Pares</th><th className="p-3 text-right">Reembolsados</th><th className="p-3 text-right">Ventas</th><th className="p-3 text-right">Stock</th></tr></thead><tbody>{salesVariants.map(row => <tr key={row.variantId} className="border-t"><td className="p-3">{row.sku}</td><td className="p-3">{row.color || '—'}</td><td className="p-3">{row.size || '—'}</td><td className="p-3">{row.upper || '—'}</td><td className="p-3">{row.sole || '—'}</td><td className="p-3 text-right">{row.pairCount}</td><td className="p-3 text-right">{row.refundedPairs}</td><td className="p-3 text-right">{money(row.articleSales, currency)}</td><td className="p-3 text-right">{available(row)}</td></tr>)}</tbody></table></div></section>}
                <p className="text-xs text-muted-foreground">El stock es actual; los datos de producto, color y materiales reflejan la configuración actual del catálogo. El CSV incluye todas las variantes del canal, también las que no tuvieron ventas.</p>
            </TabsContent>
            <TabsContent value="matriz" className="space-y-4">
                {matrixProducts.length ? <>
                    <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Producto<select value={selectedProductId} onChange={event => { setProductId(event.target.value); setUpper(''); setSole(''); }} className="mt-1 block h-9 w-full rounded-md border bg-background px-2">{matrixProducts.map(product => <option key={product.id} value={product.id}>{product.code ? `${product.code} · ` : ''}{product.name}</option>)}</select></label><label className="text-sm">Capellada<select value={selectedUpper} onChange={event => setUpper(event.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-2"><option value="">Todas</option>{upperOptions.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Suela<select value={selectedSole} onChange={event => setSole(event.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-2"><option value="">Todas</option>{soleOptions.map(value => <option key={value}>{value}</option>)}</select></label></div>
                    <div className="flex gap-2"><Button type="button" size="sm" variant={matrixValue === 'sales' ? 'default' : 'outline'} onClick={() => setMatrixValue('sales')}>Pares vendidos netos</Button><Button type="button" size="sm" variant={matrixValue === 'stock' ? 'default' : 'outline'} onClick={() => setMatrixValue('stock')}>Stock disponible</Button></div>
                    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[500px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-left">Color / Talla</th>{sizes.map(size => <th key={size} className="p-3 text-center">{size}</th>)}</tr></thead><tbody>{colors.map(color => <tr key={color} className="border-t"><th className="p-3 text-left font-medium">{color}</th>{sizes.map(size => { const cell = matrix.get(`${color}\u0000${size}`); return <td key={size} className="p-3 text-center">{cell ? cell[matrixValue] : '—'}</td>; })}</tr>)}</tbody></table></div>
                    <p className="text-xs text-muted-foreground">Las celdas suman las variantes de capellada y suela seleccionadas. Pares vendidos netos = vendidos menos unidades asociadas a reembolsos. El stock corresponde al inventario actual.</p>
                </> : <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay productos activos con variantes en este canal.</p>}
            </TabsContent>
            <TabsContent value="inventario" className="space-y-4">
                <p className="text-sm text-muted-foreground">Stock físico y reservado actuales de todas las variantes con control de inventario. La demanda usa pares vendidos menos reembolsados en el período seleccionado.</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
                    { label: 'Variantes con inventario', value: inventory.length },
                    { label: 'Pares físicos', value: inventory.reduce((sum, row) => sum + row.stockOnHand, 0) },
                    { label: 'Pares reservados', value: inventory.reduce((sum, row) => sum + row.stockAllocated, 0) },
                    { label: 'Variantes agotadas', value: inventory.filter(row => available(row) === 0).length },
                ].map(item => <div key={item.label} className="rounded-md border p-4"><div className="text-sm text-muted-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value.toLocaleString('es-EC')}</div></div>)}</div>
                <div className="flex flex-wrap items-end gap-3 rounded-md border p-4">
                    <label className="text-sm">Plazo de reposición (días)<input aria-label="Plazo de reposición en días" type="number" min="0" max="365" step="1" value={leadDays} onChange={event => setLeadDays(Math.min(365, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 block h-9 w-44 rounded-md border bg-background px-2" /></label>
                    <label className="text-sm">Reserva por variante (pares)<input aria-label="Reserva de seguridad por variante" type="number" min="0" max="100000" step="1" value={safetyStock} onChange={event => setSafetyStock(Math.min(100000, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 block h-9 w-44 rounded-md border bg-background px-2" /></label>
                    <label className="text-sm">Buscar producto, código o SKU<input value={inventorySearch} onChange={event => setInventorySearch(event.target.value)} className="mt-1 block h-9 w-56 rounded-md border bg-background px-2" /></label>
                    <label className="text-sm">Mostrar<select value={inventoryFilter} onChange={event => setInventoryFilter(event.target.value as typeof inventoryFilter)} className="mt-1 block h-9 rounded-md border bg-background px-2"><option value="all">Todas</option><option value="reorder">Con reposición sugerida</option><option value="zero">Agotadas</option></select></label>
                    <Button type="button" variant="outline" onClick={() => downloadAnalysisCsv(`inventario-reposicion-${start}-${end}.csv`, ['Código', 'Producto', 'SKU', 'Color', 'Talla', 'Capellada', 'Suela', 'Vendido neto', 'Físico', 'Reservado', 'Libre', 'Vendible', 'Cobertura días', 'Reponer pares'], inventoryRows.map(row => [row.productCode, row.productName, row.sku, row.color, row.size, row.upper, row.sole, netSold(row), row.stockOnHand, row.stockAllocated, available(row), saleable(row), coverage(available(row), netSold(row), periodDays) ?? 'Sin demanda', reorder(row, periodDays, leadDays, safetyStock)]))}>Descargar CSV</Button>
                </div>
                <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[1200px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Código / producto</th><th className="p-3">SKU</th><th className="p-3">Color</th><th className="p-3">Talla</th><th className="p-3">Capellada / suela</th><th className="p-3 text-right">Vendido neto</th><th className="p-3 text-right">Físico</th><th className="p-3 text-right">Reservado</th><th className="p-3 text-right">Libre</th><th className="p-3 text-right">Vendible</th><th className="p-3 text-right">Cobertura</th><th className="p-3 text-right">Reponer</th></tr></thead><tbody>{inventoryRows.map(row => <tr key={row.variantId} className="border-t"><td className="p-3"><div className="font-medium">{row.productCode || '—'}</div>{row.productName}</td><td className="p-3">{row.sku}</td><td className="p-3">{row.color || '—'}</td><td className="p-3">{row.size || '—'}</td><td className="p-3">{row.upper || '—'} / {row.sole || '—'}</td><td className="p-3 text-right">{netSold(row)}</td><td className="p-3 text-right">{row.stockOnHand}</td><td className="p-3 text-right">{row.stockAllocated}</td><td className="p-3 text-right">{available(row)}</td><td className="p-3 text-right">{saleable(row)}</td><td className="p-3 text-right">{coverage(available(row), netSold(row), periodDays) ?? '—'}</td><td className="p-3 text-right font-medium">{reorder(row, periodDays, leadDays, safetyStock)}</td></tr>)}{!inventoryRows.length && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">No hay variantes para este filtro.</td></tr>}</tbody></table></div>
                <p className="text-xs text-muted-foreground">Libre = físico menos reservado. Vendible descuenta además el umbral de agotamiento de Vendure. Reponer = máximo entre cero y demanda diaria neta × plazo, redondeada hacia arriba, más reserva, menos stock libre. Sin ventas netas en el período no se sugiere reposición. Es una sugerencia basada en ventas recientes; no crea compras.</p>
            </TabsContent>
            <TabsContent value="catalogo" className="space-y-4">
                <p className="text-sm text-muted-foreground">Análisis por modelo del catálogo actual del canal. «Sin ventas» significa sin pares vendidos netos durante las fechas elegidas.</p>
                <div className="grid gap-3 sm:grid-cols-3">{[
                    { label: 'Modelos con variantes', value: catalogRows.length },
                    { label: 'Modelos sin ventas', value: catalogRows.filter(row => row.sold === 0).length },
                    { label: 'Modelos con stock inmóvil', value: catalogRows.filter(row => row.tracked > 0 && row.sold === 0 && row.stock > 0).length },
                ].map(item => <div key={item.label} className="rounded-md border p-4"><div className="text-sm text-muted-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value.toLocaleString('es-EC')}</div></div>)}</div>
                <Button type="button" variant="outline" onClick={() => downloadAnalysisCsv(`catalogo-rotacion-${start}-${end}.csv`, ['Código', 'Modelo', 'Variantes', 'Variantes sin ventas', 'Vendido neto', 'Stock disponible', 'Cobertura días', 'Diagnóstico'], catalogRows.map(row => [row.code, row.name, row.variants, row.withoutSales, row.sold, row.tracked ? row.stock : 'No controlado', row.tracked ? coverage(row.stock, row.sold, periodDays) ?? 'Sin demanda' : 'No controlado', catalogStatus(row.sold, row.stock, row.tracked)]))}>Descargar CSV</Button>
                <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[750px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Código</th><th className="p-3">Modelo</th><th className="p-3 text-right">Variantes</th><th className="p-3 text-right">Sin ventas</th><th className="p-3 text-right">Vendido neto</th><th className="p-3 text-right">Stock disponible</th><th className="p-3 text-right">Cobertura</th><th className="p-3">Diagnóstico</th></tr></thead><tbody>{catalogRows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.code || '—'}</td><td className="p-3">{row.name}</td><td className="p-3 text-right">{row.variants}</td><td className="p-3 text-right">{row.withoutSales}</td><td className="p-3 text-right">{row.sold}</td><td className="p-3 text-right">{row.tracked ? row.stock : '—'}</td><td className="p-3 text-right">{row.tracked ? coverage(row.stock, row.sold, periodDays) ?? '—' : '—'}</td><td className="p-3">{catalogStatus(row.sold, row.stock, row.tracked)}</td></tr>)}{!catalogRows.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No hay modelos con variantes en este canal.</td></tr>}</tbody></table></div>
                <p className="text-xs text-muted-foreground">Cobertura = stock disponible ÷ venta diaria neta promedio. Se marca «rotación lenta» cuando supera el doble del período analizado; es una señal operativa, no rotación contable, porque no hay existencias históricas promedio.</p>
            </TabsContent></>}
        </Tabs>}
        <Dialog open={Boolean(pdfPreview)} onOpenChange={open => { if (!open) setPdfPreview(null); }}>
            <DialogContent className="flex h-[90vh] w-[95vw] max-w-6xl flex-col">
                <DialogHeader><DialogTitle>{pdfPreview?.title}</DialogTitle><DialogDescription>Vista previa del informe generado. Puedes descargarlo o enviarlo a impresión.</DialogDescription></DialogHeader>
                {pdfPreview && <iframe className="min-h-0 w-full flex-1 rounded-md border" src={pdfPreview.url} title={`Vista previa: ${pdfPreview.title}`} />}
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => pdfPreview?.pdf.save(pdfPreview.filename)} disabled={!pdfPreview}>Descargar PDF</Button><Button type="button" onClick={printReport} disabled={!pdfPreview}>Imprimir</Button></div>
            </DialogContent>
        </Dialog>
    </div>;
}
