import { generateWorkerFile } from '../../marketplace/dashboard/file-jobs';
import { api, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger, useChannel, useQuery } from '@vendure/dashboard';
import { fabric } from 'fabric';
import { Barcode, CircleDollarSign, Footprints, Hash, ImageIcon, Layers, Package, Palette, Ruler, ScanLine, Store, Type, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QR_PREVIEW } from '../shared/label-symbols';
import { areaContentBox, barcodeImage, labelFields, labelColors, labelSheetMetrics, recommendedSheetGrid, renderLabel, type LabelSheetLayout, type LabelTemplateDraft, type LabelPdfSummary, type LabelVariant } from './label-renderer';

type SavedTemplate = LabelTemplateDraft & { id: string };
type ProductChoice = { id: string; name: string; customFields?: { codigo?: string | null } | null };
type LabelField = 'producto' | 'codigo' | 'sku' | 'talla' | 'color' | 'capellada' | 'suela' | 'precio' | 'codigoBarras' | 'foto' | 'logoNegocio' | 'barcode' | 'qr';
type GridBounds = { fromColumn: number; toColumn: number; fromRow: number; toRow: number };
type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';
type HorizontalAlign = 'left' | 'center' | 'right';
type VerticalAlign = 'top' | 'middle' | 'bottom';
type Rotation = 0 | 90 | 180 | 270;
type ColorShape = 'circle' | 'square' | 'star' | 'heart';
type AreaStyle = { marginMm: number; paddingMm: number; rotation: Rotation; colorShape: ColorShape; backgroundColor: string; borderColor: string; borderWidthMm: number; borderStyle: BorderStyle; contentScale: number; textColor: string; fontFamily: string; fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic'; horizontalAlign: HorizontalAlign; verticalAlign: VerticalAlign; textSizeMm: number | null };
type AreaContent =
    | { kind: 'field'; field: LabelField }
    | { kind: 'text'; text: string }
    | { kind: 'image'; image: string };
type GridArea = GridBounds & AreaStyle & { id: string } & AreaContent;
type NewArea = AreaStyle & AreaContent;
type GridPoint = { column: number; row: number };

const templatesQuery = `query FootwearLabelTemplates { labelTemplates { id name widthMm heightMm design } }`;
const saveTemplateMutation = `mutation SaveFootwearLabelTemplate($input: SaveLabelTemplateInput!) { saveLabelTemplate(input: $input) { id name widthMm heightMm design } }`;
const deleteTemplateMutation = `mutation DeleteFootwearLabelTemplate($id: ID!) { deleteLabelTemplate(id: $id) { result message } }`;
const productsQuery = `query FootwearLabelProducts($search: String!) { products(options: { take: 30, filter: { _or: [{ name: { contains: $search } }, { codigo: { contains: $search } }] } }) { items { id name customFields { codigo } } } }`;
const businessLogoQuery = `query FootwearLabelBusinessLogo($productId: ID!, $sellerProfileId: ID) { labelProductBusinessLogo(productId: $productId, sellerProfileId: $sellerProfileId) { status logo { preview } candidates { id name hasLogo } } }`;
const variantsQuery = `query FootwearLabelVariants($productId: ID!, $skip: Int!, $take: Int!) {
    productVariants(productId: $productId, options: { take: $take, skip: $skip }) {
        totalItems
        items {
            id name sku priceWithTax currencyCode customFields { codigoBarras colores { nombre codigo } }
            featuredAsset { preview }
            stockLevels { stockOnHand }
            product { name customFields { codigo } featuredAsset { preview } }
            options { name group { code } customFields { colores { nombre codigo } } }
        }
    }
}`;

const columns = 12;
const rows = 8;
const scale = 4;
const fields: Array<{ key: LabelField; label: string; description: string; icon: LucideIcon }> = [
    { key: 'producto', label: 'Producto', description: 'Nombre del modelo', icon: Package },
    { key: 'codigo', label: 'Código', description: 'Código general del producto', icon: Hash },
    { key: 'sku', label: 'SKU', description: 'Identificador de la variante', icon: ScanLine },
    { key: 'talla', label: 'Talla', description: 'Número de calzado', icon: Ruler },
    { key: 'color', label: 'Color', description: 'Combinación y muestras de color', icon: Palette },
    { key: 'capellada', label: 'Capellada', description: 'Material de la capellada', icon: Layers },
    { key: 'suela', label: 'Suela', description: 'Material o tipo de suela', icon: Footprints },
    { key: 'precio', label: 'Precio', description: 'Precio final de la variante', icon: CircleDollarSign },
    { key: 'foto', label: 'Foto del producto', description: 'Imagen asignada al producto', icon: ImageIcon },
    { key: 'logoNegocio', label: 'Logo de negocio', description: 'Logo del almacén asociado al producto', icon: Store },
    { key: 'barcode', label: 'Código de barras', description: 'Imagen del código de barras', icon: Barcode },
    { key: 'qr', label: 'QR de alistamiento', description: 'El QR real se emite al generar el PDF; el del lienzo es solo un ejemplo', icon: ScanLine },
];
const fieldLabels: Record<LabelField, string> = { producto: 'Producto', codigo: 'Código', sku: 'SKU', talla: 'Talla', color: 'Color', capellada: 'Capellada', suela: 'Suela', precio: 'Precio', codigoBarras: 'Texto de barras', foto: 'Foto del producto', logoNegocio: 'Logo de negocio', barcode: 'Código de barras', qr: 'QR de alistamiento' };
const defaultAreaStyle: AreaStyle = { marginMm: 0, paddingMm: 0.5, rotation: 0, colorShape: 'circle', backgroundColor: '#ffffff', borderColor: '#111827', borderWidthMm: 0.25, borderStyle: 'solid', contentScale: 100, textColor: '#111827', fontFamily: 'Arial', fontWeight: 'normal', fontStyle: 'normal', horizontalAlign: 'center', verticalAlign: 'middle', textSizeMm: null };
const initialSheetLayout: LabelSheetLayout = { paper: 'a4', columns: 2, rows: 5, marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0 };

function logoNotice(status: NonNullable<LabelVariant['businessLogo']>['status'], canChoose = false) {
    if (status === 'MISSING') return 'El negocio asociado no tiene logo. Agrégalo en Multivendedor → Vendedores.';
    if (status === 'AMBIGUOUS') return 'El producto pertenece a varios negocios. Selecciona el negocio para esta etiqueta.';
    if (status === 'NO_SELLER') return canChoose ? 'El producto no tiene un negocio asociado. Selecciona el negocio para esta etiqueta.' : 'No se encontró un negocio asociado al producto en este canal.';
    return '';
}

function productLabel(product: ProductChoice) {
    return `${product.name}${product.customFields?.codigo ? ` (${product.customFields.codigo})` : ''}`;
}

function areaLabel(area: GridArea) {
    if (area.kind === 'field') return fieldLabels[area.field];
    return area.kind === 'text' ? 'Texto fijo' : 'Imagen fija';
}

function isTextArea(area: GridArea) {
    return area.kind === 'text' || (area.kind === 'field' && !['foto', 'logoNegocio', 'barcode', 'qr'].includes(area.field));
}

function textSizing(area: GridArea, widthMm: number, heightMm: number, density: number, labelMargin: number, sample?: ReturnType<typeof labelFields>, sampleColors: ReturnType<typeof labelColors> = []) {
    const box = areaContentBox(widthMm * scale, heightMm * scale, area, area.marginMm, area.paddingMm, density, labelMargin);
    const sideways = area.rotation === 90 || area.rotation === 270;
    const availableWidth = sideways ? box.height : box.width;
    const availableHeight = sideways ? box.width : box.height;
    if (area.kind === 'field' && area.field === 'color') {
        const names = sampleColors.length ? sampleColors.map(color => color.name) : ['Color'];
        const width = 27 + Math.max(...names.map(name => new fabric.Text(name, { fontSize: 20, fontFamily: area.fontFamily, fontWeight: area.fontWeight, fontStyle: area.fontStyle }).width || 0));
        const fit = Math.min(availableWidth / width, availableHeight / (names.length * 25));
        const maxMm = Math.max(0.5, Math.min(30, Math.floor(20 * fit / scale * 2) / 2));
        return { maxMm, automaticMm: Math.max(0.5, Math.min(maxMm, Math.round(20 * fit * area.contentScale / 100 / scale * 2) / 2)) };
    }
    const field = area.kind === 'field' && area.field !== 'qr' ? (area.field === 'barcode' ? 'codigoBarras' : area.field) : null;
    const value = area.kind === 'text' ? area.text : field ? String(sample?.[field] || fieldLabels[field as LabelField]) : '';
    const text = new fabric.Textbox(value || 'Texto', {
        width: Math.max(1, availableWidth),
        fontSize: 2, fontFamily: area.fontFamily, fontWeight: area.fontWeight, fontStyle: area.fontStyle, lineHeight: 1,
    });
    const height = Math.max(1, availableHeight);
    let low = 2;
    let high = 120;
    for (let index = 0; index < 9; index++) {
        const middle = (low + high) / 2;
        text.set('fontSize', middle);
        text.initDimensions();
        if (text.getScaledHeight() <= height) low = middle;
        else high = middle;
    }
    const maxMm = Math.max(0.5, Math.min(30, Math.floor(low / scale * 2) / 2));
    const initialPx = Math.max(7, Math.min(20, availableHeight * 0.55)) * area.contentScale / 100;
    const automaticMm = Math.max(0.5, Math.min(maxMm, Math.round(initialPx / scale * 2) / 2));
    return { maxMm, automaticMm };
}

function safeBarcode(value: string) {
    try { return barcodeImage(value); } catch { return ''; }
}

async function fetchVariants(productId: string, sellerProfileId: string, needsLogo: boolean): Promise<LabelVariant[]> {
    const labelProductBusinessLogo = needsLogo ? (await api.query<{ labelProductBusinessLogo: NonNullable<LabelVariant['businessLogo']> }>(businessLogoQuery, { productId, sellerProfileId: sellerProfileId || undefined })).labelProductBusinessLogo : undefined;
    const variants: LabelVariant[] = [];
    while (true) {
        const response = await api.query<{ productVariants: { totalItems: number; items: LabelVariant[] } }>(variantsQuery, { productId, skip: variants.length, take: 100 });
        variants.push(...response.productVariants.items.map(variant => ({ ...variant, businessLogo: labelProductBusinessLogo })));
        if (!response.productVariants.items.length || variants.length >= response.productVariants.totalItems) return variants;
    }
}

async function fetchSampleVariant(productId: string, sellerProfileId: string, needsLogo: boolean) {
    const [response, logo] = await Promise.all([
        api.query<{ productVariants: { items: LabelVariant[] } }>(variantsQuery, { productId, skip: 0, take: 1 }),
        needsLogo ? api.query<{ labelProductBusinessLogo: NonNullable<LabelVariant['businessLogo']> }>(businessLogoQuery, { productId, sellerProfileId: sellerProfileId || undefined }) : Promise.resolve(undefined),
    ]);
    return response.productVariants.items[0] ? { ...response.productVariants.items[0], businessLogo: logo?.labelProductBusinessLogo } : undefined;
}

function range(first: GridPoint, last: GridPoint) {
    return { fromColumn: Math.min(first.column, last.column), toColumn: Math.max(first.column, last.column), fromRow: Math.min(first.row, last.row), toRow: Math.max(first.row, last.row) };
}

function contains(area: GridBounds, point: GridPoint) {
    return point.column >= area.fromColumn && point.column <= area.toColumn && point.row >= area.fromRow && point.row <= area.toRow;
}

function overlaps(first: GridArea, second: GridBounds) {
    return first.fromColumn <= second.toColumn && first.toColumn >= second.fromColumn && first.fromRow <= second.toRow && first.toRow >= second.fromRow;
}

function gridAreasFromDesign(design: string): GridArea[] {
    try {
        const parsed = JSON.parse(design) as { objects?: Array<{ data?: { field?: unknown; grid?: unknown; kind?: unknown; text?: unknown; image?: unknown; marginMm?: unknown; paddingMm?: unknown; rotation?: unknown; colorShape?: unknown; backgroundColor?: unknown; borderColor?: unknown; borderWidthMm?: unknown; borderStyle?: unknown; contentScale?: unknown; textColor?: unknown; fontFamily?: unknown; fontWeight?: unknown; fontStyle?: unknown; horizontalAlign?: unknown; verticalAlign?: unknown; textSizeMm?: unknown } }> };
        return (parsed.objects || []).flatMap<GridArea>((object, index) => {
            const data = object.data;
            const grid = data?.grid;
            if (!grid || typeof grid !== 'object' || !data) return [];
            const values = grid as Partial<GridArea>;
            if (![values.fromColumn, values.toColumn, values.fromRow, values.toRow].every(Number.isInteger)) return [];
            const bounds: GridBounds & AreaStyle & { id: string } = {
                id: `area-${index}`, fromColumn: values.fromColumn!, toColumn: values.toColumn!, fromRow: values.fromRow!, toRow: values.toRow!,
                marginMm: typeof data.paddingMm === 'number' && typeof data.marginMm === 'number' ? Math.max(0, Math.min(10, data.marginMm)) : 0,
                paddingMm: typeof data.paddingMm === 'number' ? Math.max(0, Math.min(10, data.paddingMm)) : typeof data.marginMm === 'number' ? Math.max(0, Math.min(10, data.marginMm)) : defaultAreaStyle.paddingMm,
                rotation: data.rotation === 90 || data.rotation === 180 || data.rotation === 270 ? data.rotation : 0,
                colorShape: data.colorShape === 'square' || data.colorShape === 'star' || data.colorShape === 'heart' ? data.colorShape : 'circle',
                backgroundColor: typeof data.backgroundColor === 'string' ? data.backgroundColor : defaultAreaStyle.backgroundColor,
                borderColor: typeof data.borderColor === 'string' ? data.borderColor : defaultAreaStyle.borderColor,
                borderWidthMm: typeof data.borderWidthMm === 'number' ? Math.max(0, Math.min(5, data.borderWidthMm)) : defaultAreaStyle.borderWidthMm,
                borderStyle: data.borderStyle === 'none' || data.borderStyle === 'solid' || data.borderStyle === 'dashed' || data.borderStyle === 'dotted' ? data.borderStyle : defaultAreaStyle.borderStyle,
                contentScale: typeof data.contentScale === 'number' ? Math.max(25, Math.min(200, data.contentScale)) : defaultAreaStyle.contentScale,
                textColor: typeof data.textColor === 'string' ? data.textColor : defaultAreaStyle.textColor,
                fontFamily: typeof data.fontFamily === 'string' ? data.fontFamily : defaultAreaStyle.fontFamily,
                fontWeight: data.fontWeight === 'bold' ? 'bold' as const : 'normal' as const,
                fontStyle: data.fontStyle === 'italic' ? 'italic' as const : 'normal' as const,
                horizontalAlign: data.horizontalAlign === 'left' || data.horizontalAlign === 'right' ? data.horizontalAlign : 'center' as const,
                verticalAlign: data.verticalAlign === 'top' || data.verticalAlign === 'bottom' ? data.verticalAlign : 'middle' as const,
                textSizeMm: typeof data.textSizeMm === 'number' && Number.isFinite(data.textSizeMm) ? Math.max(0.5, Math.min(30, data.textSizeMm)) : null,
            };
            if (data.kind === 'text' && typeof data.text === 'string') return [{ ...bounds, kind: 'text' as const, text: data.text }];
            if (data.kind === 'image' && typeof data.image === 'string') return [{ ...bounds, kind: 'image' as const, image: data.image }];
            if (typeof data.field === 'string' && data.field in fieldLabels) return [{ ...bounds, kind: 'field' as const, field: data.field as LabelField }];
            return [];
        });
    } catch {
        return [];
    }
}

function createDesign(areas: GridArea[], widthMm: number, heightMm: number, density: number, labelMargin: number, cutMarks: boolean) {
    const objects = areas.map(area => {
        const grid = { fromColumn: area.fromColumn, toColumn: area.toColumn, fromRow: area.fromRow, toRow: area.toRow };
        const box = areaContentBox(widthMm * scale, heightMm * scale, grid, area.marginMm, area.paddingMm, density, labelMargin);
        const rotated = area.rotation === 90 || area.rotation === 270;
        const style = { grid, marginMm: area.marginMm, paddingMm: area.paddingMm, rotation: area.rotation, colorShape: area.colorShape, backgroundColor: area.backgroundColor, borderColor: area.borderColor, borderWidthMm: area.borderWidthMm, borderStyle: area.borderStyle, contentScale: area.contentScale, textColor: area.textColor, fontFamily: area.fontFamily, fontWeight: area.fontWeight, fontStyle: area.fontStyle, horizontalAlign: area.horizontalAlign, verticalAlign: area.verticalAlign, textSizeMm: area.textSizeMm };
        const background = new fabric.Rect({ left: box.borderLeft, top: box.borderTop, width: box.borderWidth, height: box.borderHeight, fill: area.backgroundColor, strokeWidth: 0, data: style }).toObject(['data']);
        const border = area.borderStyle === 'none' || !area.borderWidthMm ? null : new fabric.Rect({
            left: box.borderLeft, top: box.borderTop, width: box.borderWidth, height: box.borderHeight, fill: 'transparent', stroke: area.borderColor, strokeWidth: area.borderWidthMm * scale,
            strokeDashArray: area.borderStyle === 'dashed' ? [8, 5] : area.borderStyle === 'dotted' ? [2, 3] : undefined,
        }).toObject();
        if (area.kind === 'image' || (area.kind === 'field' && ['foto', 'logoNegocio', 'barcode', 'qr'].includes(area.field))) {
            const data = area.kind === 'image' ? { kind: 'image', image: area.image, ...style } : { field: area.field, ...style };
            const content = new fabric.Group([new fabric.Rect({ width: box.width, height: box.height, fill: 'transparent', strokeWidth: 0 })], { left: box.left, top: box.top, data }).toObject(['data']);
            return border ? [background, content, border] : [background, content];
        }
        const value = area.kind === 'text' ? area.text : `{{${area.field}}}`;
        const text = new fabric.Textbox(value, { left: box.left, top: box.top, width: rotated ? box.height : box.width, fontSize: area.textSizeMm ? area.textSizeMm * scale : Math.max(7, Math.min(20, (rotated ? box.width : box.height) * 0.55)) * area.contentScale / 100, fill: area.textColor, fontFamily: area.fontFamily, fontWeight: area.fontWeight, fontStyle: area.fontStyle, textAlign: area.horizontalAlign, lineHeight: 1 });
        text.set({ data: area.kind === 'text' ? { kind: 'text', text: area.text, ...style } : { field: area.field, ...style } });
        const content = text.toObject(['data']);
        return border ? [background, content, border] : [background, content];
    }).flat();
    return JSON.stringify({ version: fabric.version, gridDensity: density, labelMargin, cutMarks, objects, background: '#ffffff' });
}

function SelectedSpacing({ area, widthMm, heightMm, density, labelMargin }: { area: GridArea; widthMm: number; heightMm: number; density: number; labelMargin: number }) {
    const grid = { fromColumn: area.fromColumn, toColumn: area.toColumn, fromRow: area.fromRow, toRow: area.toRow };
    const box = areaContentBox(widthMm * scale, heightMm * scale, grid, area.marginMm, area.paddingMm, density, labelMargin);
    const outerWidth = (area.toColumn - area.fromColumn + 1) * (widthMm - labelMargin * 2) * scale / (columns * density);
    const outerHeight = (area.toRow - area.fromRow + 1) * (heightMm - labelMargin * 2) * scale / (rows * density);
    const marginX = Math.max(0, (outerWidth - box.borderWidth) / outerWidth * 50);
    const marginY = Math.max(0, (outerHeight - box.borderHeight) / outerHeight * 50);
    const paddingX = Math.max(0, (box.borderWidth - box.width) / box.borderWidth * 50);
    const paddingY = Math.max(0, (box.borderHeight - box.height) / box.borderHeight * 50);
    const bands = (x: number, y: number, color: string) => <>
        <div className="absolute inset-x-0 top-0" style={{ height: `${y}%`, backgroundColor: color }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: `${y}%`, backgroundColor: color }} />
        <div className="absolute bottom-0 left-0 top-0" style={{ width: `${x}%`, backgroundColor: color }} />
        <div className="absolute bottom-0 right-0 top-0" style={{ width: `${x}%`, backgroundColor: color }} />
    </>;
    return <div className="pointer-events-none relative z-20" style={{ gridColumn: `${area.fromColumn + 1} / ${area.toColumn + 2}`, gridRow: `${area.fromRow + 1} / ${area.toRow + 2}` }}>
        {bands(marginX, marginY, 'rgba(245, 158, 11, 0.45)')}
        <div className="absolute border border-amber-500/80" style={{ left: `${marginX}%`, right: `${marginX}%`, top: `${marginY}%`, bottom: `${marginY}%` }}>
            {bands(paddingX, paddingY, 'rgba(14, 165, 233, 0.4)')}
        </div>
    </div>;
}

export function LabelingPage() {
    const { activeChannel } = useChannel();
    const imageInput = useRef<HTMLInputElement>(null);
    const replaceImageInput = useRef<HTMLInputElement>(null);
    const productPicker = useRef<HTMLDivElement>(null);
    const labelCanvas = useRef<HTMLDivElement>(null);
    const [labelCanvasWidth, setLabelCanvasWidth] = useState(0);
    const [renderedLabel, setRenderedLabel] = useState<string | null>(null);
    const [qrPreview, setQrPreview] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [name, setName] = useState('Etiqueta de calzado');
    const [widthMm, setWidthMm] = useState(70);
    const [heightMm, setHeightMm] = useState(40);
    const [labelMargin, setLabelMargin] = useState(0);
    const [cutMarks, setCutMarks] = useState(false);
    const [gridDensity, setGridDensity] = useState(1);
    const [areas, setAreas] = useState<GridArea[]>([]);
    const [selectionStart, setSelectionStart] = useState<GridPoint | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<GridPoint | null>(null);
    const [dragging, setDragging] = useState(false);
    const [selectedAreaId, setSelectedAreaId] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [productPickerOpen, setProductPickerOpen] = useState(false);
    const [activeProductIndex, setActiveProductIndex] = useState(0);
    const [productId, setProductId] = useState('');
    const [logoSellerId, setLogoSellerId] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<ProductChoice | null>(null);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [labelsPerPair, setLabelsPerPair] = useState(1);
    const [sheetLayout, setSheetLayout] = useState<LabelSheetLayout>(initialSheetLayout);
    const [previewRequest, setPreviewRequest] = useState<{ draft: LabelTemplateDraft; items: Array<{ variant: LabelVariant; quantity: number }> } | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; result: LabelPdfSummary } | null>(null);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [pdfError, setPdfError] = useState('');
    const [automaticRows, setAutomaticRows] = useState(true);
    const [manualColumns, setManualColumns] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => { setLogoSellerId(''); }, [activeChannel?.id]);

    const templates = useQuery({ queryKey: ['footwear-label-templates'], queryFn: () => api.query<{ labelTemplates: SavedTemplate[] }>(templatesQuery) });
    const searchTerm = selectedProduct && productSearch === productLabel(selectedProduct) ? '' : productSearch.trim();
    const products = useQuery({ queryKey: ['footwear-label-products', activeChannel?.id, searchTerm], queryFn: () => api.query<{ products: { items: ProductChoice[] } }>(productsQuery, { search: searchTerm }), placeholderData: undefined, refetchOnMount: 'always' });
    const productChoices = products.isFetching ? [] : products.data?.products.items || [];
    const needsBusinessLogo = areas.some(area => area.kind === 'field' && area.field === 'logoNegocio');
    const variants = useQuery({ queryKey: ['footwear-label-variants', activeChannel?.id, productId, logoSellerId, needsBusinessLogo], queryFn: () => fetchVariants(productId, logoSellerId, needsBusinessLogo), enabled: Boolean(productId) });
    const exampleProductId = productId || products.data?.products.items[0]?.id || '';
    const exampleVariant = useQuery({ queryKey: ['footwear-label-example', activeChannel?.id, exampleProductId, logoSellerId, needsBusinessLogo], queryFn: () => fetchSampleVariant(exampleProductId, logoSellerId, needsBusinessLogo), enabled: Boolean(exampleProductId) });
    useEffect(() => {
        let active = true;
        if (!exampleVariant.data?.id) { setQrPreview(''); return; }
        void QRCode.toDataURL(QR_PREVIEW, { margin: 4, errorCorrectionLevel: 'M' })
            .then(value => { if (active) setQrPreview(value); })
            .catch(() => { if (active) setQrPreview(''); });
        return () => { active = false; };
    }, [exampleVariant.data?.id]);
    const quantityMatrix = useMemo(() => {
        const sizes = new Set<string>();
        const rows = new Map<string, { color: string; upper: string; sole: string; bySize: Map<string, LabelVariant[]> }>();
        for (const variant of variants.data || []) {
            const fields = labelFields(variant);
            const size = fields.talla || 'Única';
            const color = fields.color || '—';
            const upper = fields.capellada || '—';
            const sole = fields.suela || '—';
            const key = JSON.stringify([color, upper, sole]);
            const row = rows.get(key) || { color, upper, sole, bySize: new Map<string, LabelVariant[]>() };
            row.bySize.set(size, [...(row.bySize.get(size) || []), variant]);
            rows.set(key, row);
            sizes.add(size);
        }
        return {
            sizes: [...sizes].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
            rows: [...rows.entries()].sort((a, b) =>
                a[1].color.localeCompare(b[1].color, 'es') || a[1].upper.localeCompare(b[1].upper, 'es') || a[1].sole.localeCompare(b[1].sole, 'es'),
            ).map(([key, row]) => ({ key, ...row })),
        };
    }, [variants.data]);
    const previewMetrics = useMemo(() => {
        if (!previewRequest) return null;
        try { return labelSheetMetrics(previewRequest.draft, sheetLayout); } catch { return null; }
    }, [previewRequest, sheetLayout]);

    useEffect(() => {
        const finishSelection = () => setDragging(false);
        window.addEventListener('mouseup', finishSelection);
        return () => window.removeEventListener('mouseup', finishSelection);
    }, []);

    useEffect(() => {
        if (!labelCanvas.current) return;
        const observer = new ResizeObserver(entries => setLabelCanvasWidth(entries[0].contentRect.width));
        observer.observe(labelCanvas.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const closePicker = (event: PointerEvent) => {
            if (!productPicker.current?.contains(event.target as Node)) setProductPickerOpen(false);
        };
        document.addEventListener('pointerdown', closePicker);
        return () => document.removeEventListener('pointerdown', closePicker);
    }, []);

    useEffect(() => {
        if (!previewRequest) { setPdfPreview(null); return; }
        let active = true;
        setPdfBusy(true);
        setPdfError('');
        setPdfPreview(null);
        const timer = window.setTimeout(() => {
            generateWorkerFile('labels', { input: { draft: previewRequest.draft, items: previewRequest.items.map(item => ({ variantId: item.variant.id, quantity: item.quantity, copiesPerPair: (item as any).copiesPerPair || 1 })), layout: sheetLayout } }, () => !active)
                .then(result => {
                    if (active) setPdfPreview({ url: URL.createObjectURL(result.blob), result: result.result });
                })
                .catch(error => { if (active) setPdfError(error instanceof Error ? error.message : 'No se pudo crear el PDF.'); })
                .finally(() => { if (active) setPdfBusy(false); });
        }, 500);
        return () => { active = false; window.clearTimeout(timer); };
    }, [previewRequest, sheetLayout]);

    useEffect(() => () => { if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url); }, [pdfPreview?.url]);

    const selectedRange = selectionStart && selectionEnd ? range(selectionStart, selectionEnd) : null;
    const selectedArea = areas.find(area => area.id === selectedAreaId);
    const canvasScale = labelCanvasWidth && widthMm > 0 ? labelCanvasWidth / (widthMm * scale) : 1;
    const visibleLabelMargin = [widthMm, heightMm, labelMargin].every(Number.isFinite) ? Math.max(0, Math.min(labelMargin, Math.min(widthMm, heightMm) / 2 - 0.5)) : 0;
    const labelsPerSheet = sheetLayout.columns * sheetLayout.rows;
    const totalLabels = previewRequest?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    const exampleFields = useMemo(() => exampleVariant.data ? labelFields(exampleVariant.data) : null, [exampleVariant.data]);
    const selectedTextSizing = useMemo(() => selectedArea && isTextArea(selectedArea)
        ? textSizing(selectedArea, widthMm, heightMm, gridDensity, labelMargin, exampleFields || undefined, exampleVariant.data ? labelColors(exampleVariant.data) : [])
        : null, [selectedArea, widthMm, heightMm, gridDensity, labelMargin, exampleFields, exampleVariant.data]);

    useEffect(() => {
        let active = true;
        setRenderedLabel(null);
        const timer = window.setTimeout(() => {
            if (exampleVariant.data && areas.length && widthMm > 0 && heightMm > 0) {
                const design = createDesign(areas, widthMm, heightMm, gridDensity, visibleLabelMargin, cutMarks);
                void renderLabel({ name, widthMm, heightMm, design }, exampleVariant.data)
                    .then(image => { if (active) setRenderedLabel(image); })
                    .catch(() => { if (active) setRenderedLabel(null); });
            }
        }, 500);
        return () => { active = false; window.clearTimeout(timer); };
    }, [areas, widthMm, heightMm, gridDensity, visibleLabelMargin, cutMarks, exampleVariant.data, name]);

    function changeDensity(next: number) {
        if (next === gridDensity) return;
        const remapped = areas.map(area => ({
            ...area,
            fromColumn: Math.floor(area.fromColumn * next / gridDensity),
            toColumn: Math.ceil((area.toColumn + 1) * next / gridDensity) - 1,
            fromRow: Math.floor(area.fromRow * next / gridDensity),
            toRow: Math.ceil((area.toRow + 1) * next / gridDensity) - 1,
        }));
        if (remapped.some((area, index) => remapped.some((other, otherIndex) => otherIndex > index && overlaps(other, area)))) {
            setMessage('Esta densidad uniría áreas distintas. Sepáralas o elimina una antes de reducir la cuadrícula.');
            return;
        }
        setAreas(remapped);
        setGridDensity(next);
        setSelectionStart(null);
        setSelectionEnd(null);
        setMessage('');
    }

    function areaPreview(area: GridArea) {
        const imageSource = area.kind === 'image' ? area.image : area.kind === 'field' && area.field === 'foto' ? exampleFields?.foto : area.kind === 'field' && area.field === 'logoNegocio' ? exampleFields?.logoNegocio : area.kind === 'field' && area.field === 'barcode' && exampleFields?.codigoBarras ? safeBarcode(exampleFields.codigoBarras) : area.kind === 'field' && area.field === 'qr' ? qrPreview : '';
        if (imageSource) return <img src={imageSource} alt="Vista previa del área" className="max-h-full max-w-full object-contain" style={{ transform: `scale(${Math.min(area.kind === 'field' && ['qr', 'barcode'].includes(area.field) ? 100 : 200, area.contentScale) / 100})` }} />;
        if (area.kind === 'field' && area.field === 'color' && exampleVariant.data) return <span className="inline-flex max-h-full max-w-full flex-col justify-center">{labelColors(exampleVariant.data).map((color, index) => <span key={index} className="inline-flex items-center gap-[0.35em] whitespace-nowrap"><span className="inline-block h-[0.9em] w-[0.9em] shrink-0 border border-slate-800" style={{ backgroundColor: color.fill, borderRadius: area.colorShape === 'circle' ? '50%' : 0, clipPath: area.colorShape === 'star' ? 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' : area.colorShape === 'heart' ? 'polygon(50% 90%,5% 45%,5% 20%,25% 5%,50% 22%,75% 5%,95% 20%,95% 45%)' : undefined }} />{color.name}</span>)}</span>;
        if (area.kind === 'text') return area.text;
        if (area.kind === 'image') return 'Imagen fija';
        if (area.field === 'barcode' || area.field === 'logoNegocio' || area.field === 'qr') return fieldLabels[area.field];
        return exampleFields ? exampleFields[area.field] : `{{${area.field}}}`;
    }

    function newTemplate() {
        setTemplateId(''); setName('Etiqueta de calzado'); setWidthMm(70); setHeightMm(40); setLabelMargin(0); setCutMarks(false); setGridDensity(1); setAreas([]);
        setSelectionStart(null); setSelectionEnd(null); setSelectedAreaId(''); setMessage('');
    }

    function openTemplate(template: SavedTemplate) {
        const loadedAreas = gridAreasFromDesign(template.design);
        const settings = JSON.parse(template.design) as { gridDensity?: number; labelMargin?: number; cutMarks?: boolean; objects?: unknown[] };
        const density = settings.gridDensity;
        setTemplateId(template.id); setName(template.name); setWidthMm(template.widthMm); setHeightMm(template.heightMm);
        setLabelMargin(typeof settings.labelMargin === 'number' && Number.isFinite(settings.labelMargin) ? Math.max(0, Math.min(settings.labelMargin, Math.min(template.widthMm, template.heightMm) / 2 - 0.5)) : 0);
        setCutMarks(settings.cutMarks === true);
        setGridDensity(density && [1, 2, 3, 4].includes(density) ? density : 1);
        setAreas(loadedAreas); setSelectionStart(null); setSelectionEnd(null); setSelectedAreaId(loadedAreas[0]?.id || '');
        setMessage(loadedAreas.length || !settings.objects?.length ? '' : 'Esta plantilla usaba el editor libre anterior. Asígnale nuevamente las áreas en la cuadrícula para actualizarla.');
    }

    function startSelection(point: GridPoint) {
        const area = areas.find(value => contains(value, point));
        setSelectionStart(area ? { column: area.fromColumn, row: area.fromRow } : point);
        setSelectionEnd(area ? { column: area.toColumn, row: area.toRow } : point);
        setDragging(!area);
        setSelectedAreaId(area?.id || '');
    }

    function extendSelection(point: GridPoint) {
        if (dragging) setSelectionEnd(point);
    }

    function addArea(area: NewArea) {
        if (!selectedRange) { setMessage('Primero selecciona una o más celdas de la cuadrícula.'); return; }
        const id = `area-${Date.now()}`;
        setAreas(current => [...current.filter(currentArea => !overlaps(currentArea, selectedRange)), { id, ...selectedRange, ...area } as GridArea]);
        setSelectedAreaId(id);
        setSelectionStart(null);
        setSelectionEnd(null);
    }

    function assign(field: LabelField) {
        addArea({ kind: 'field', field, ...defaultAreaStyle });
        setMessage(`${fieldLabels[field]} asignado al área seleccionada.`);
    }

    function addText() {
        addArea({ kind: 'text', text: 'Texto fijo', ...defaultAreaStyle });
        setMessage('Texto fijo asignado al área seleccionada.');
    }

    function addImage(file?: File) {
        if (!selectedRange) { setMessage('Primero selecciona un área para la imagen.'); return; }
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 300_000) {
            setMessage('Usa una imagen PNG, JPEG o WebP de hasta 300 KB.'); return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            addArea({ kind: 'image', image: String(reader.result), ...defaultAreaStyle });
            setMessage('Imagen fija asignada al área seleccionada.');
        };
        reader.readAsDataURL(file);
    }

    function updateSelectedArea(update: Partial<AreaStyle> & { text?: string; image?: string; field?: LabelField }) {
        if (!selectedAreaId) return;
        setAreas(current => current.map(area => area.id === selectedAreaId ? { ...area, ...update } as GridArea : area));
    }

    function replaceSelectedImage(file?: File) {
        if (!file || selectedArea?.kind !== 'image') return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 300_000) {
            setMessage('Usa una imagen PNG, JPEG o WebP de hasta 300 KB.');
            return;
        }
        const id = selectedArea.id;
        const reader = new FileReader();
        reader.onload = () => setAreas(current => current.map(area => area.id === id && area.kind === 'image' ? { ...area, image: String(reader.result) } : area));
        reader.readAsDataURL(file);
    }

    function removeSelectedArea() {
        if (!selectedAreaId) return;
        setAreas(current => current.filter(area => area.id !== selectedAreaId));
        setSelectedAreaId(''); setMessage('Área eliminada.');
    }

    function draft(): LabelTemplateDraft {
        if (!name.trim()) throw new Error('Indica un nombre para la plantilla.');
        if (![widthMm, heightMm].every(Number.isFinite) || widthMm < 20 || heightMm < 15 || widthMm > 200 || heightMm > 287) throw new Error('La etiqueta debe tener entre 20 × 15 y 200 × 287 unidades.');
        if (!Number.isFinite(labelMargin) || labelMargin < 0 || labelMargin >= Math.min(widthMm, heightMm) / 2) throw new Error('El margen de la etiqueta debe dejar espacio para el contenido.');
        if (!areas.length) throw new Error('Asigna al menos una variable en la cuadrícula.');
        return { name: name.trim(), widthMm, heightMm, design: createDesign(areas, widthMm, heightMm, gridDensity, labelMargin, cutMarks) };
    }

    async function save() {
        setBusy(true); setMessage('');
        try {
            const result = await api.mutate(saveTemplateMutation, { input: { ...draft(), id: templateId || undefined } }) as { saveLabelTemplate: SavedTemplate };
            setTemplateId(result.saveLabelTemplate.id); await templates.refetch(); setMessage('Plantilla guardada.');
        } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la plantilla.'); }
        finally { setBusy(false); }
    }

    async function removeTemplate() {
        if (!templateId || !window.confirm('¿Eliminar esta plantilla de etiquetas?')) return;
        setBusy(true); setMessage('');
        try {
            const result = await api.mutate(deleteTemplateMutation, { id: templateId }) as { deleteLabelTemplate: { result: string; message?: string } };
            if (result.deleteLabelTemplate.result !== 'DELETED') throw new Error(result.deleteLabelTemplate.message || 'No se pudo eliminar la plantilla.');
            newTemplate(); await templates.refetch(); setMessage('Plantilla eliminada.');
        } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo eliminar la plantilla.'); }
        finally { setBusy(false); }
    }

    function openPdfPreview() {
        setMessage('');
        try {
            const logo = variants.data?.[0]?.businessLogo;
            if (needsBusinessLogo && (!logo || logo.status !== 'AVAILABLE')) throw new Error(logo ? logoNotice(logo.status, logo.candidates.length > 0) : 'No se pudo comprobar el logo del negocio.');
            const items = (variants.data || []).map(variant => ({ variant, quantity: (quantities[variant.id] || 0) * labelsPerPair, copiesPerPair: labelsPerPair }));
            const total = items.reduce((sum, item) => sum + item.quantity, 0);
            if (!Number.isInteger(total) || total < 1 || total > 1000 || items.some(item => !Number.isInteger(item.quantity) || item.quantity < 0)) {
                throw new Error('Indica cantidades enteras para generar entre 1 y 1000 etiquetas.');
            }
            const request = { draft: draft(), items };
            const grid = recommendedSheetGrid(request.draft, sheetLayout);
            setAutomaticRows(true);
            setManualColumns(false);
            setSheetLayout({ ...sheetLayout, ...grid });
            setPreviewRequest(request);
        } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo abrir la vista previa.'); }
    }

    function updateSheetLayout(update: Partial<LabelSheetLayout>) {
        const next = { ...sheetLayout, ...update };
        if (previewRequest) {
            try {
                if (!manualColumns) next.columns = recommendedSheetGrid(previewRequest.draft, next).columns;
                if (automaticRows) next.rows = labelSheetMetrics(previewRequest.draft, next).automaticRows;
            } catch { /* Keep the typed value so validation can explain the problem. */ }
        }
        setSheetLayout(next);
    }

    function restoreAutomaticRows() {
        if (!previewRequest) return;
        setAutomaticRows(true);
        setSheetLayout(current => ({ ...current, rows: labelSheetMetrics(previewRequest.draft, current).automaticRows }));
    }

    function selectProduct(product: ProductChoice) {
        setLogoSellerId('');
        setProductId(product.id);
        setSelectedProduct(product);
        setProductSearch(productLabel(product));
        setProductPickerOpen(false);
        setQuantities({});
    }

    function printPdf() {
        if (!pdfPreview) return;
        const tab = window.open('about:blank', '_blank');
        if (!tab) { setPdfError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para imprimir.'); return; }
        tab.location.href = pdfPreview.url;
        tab.addEventListener('load', () => { tab.focus(); tab.print(); }, { once: true });
    }

    return <div className="space-y-5 p-6">
        <div><h1 className="text-2xl font-semibold">Etiquetas de calzado</h1><p className="text-sm text-muted-foreground">Selecciona un bloque de la cuadrícula y asígnale la información que se imprimirá en esa área.</p></div>
        <div className="@container">
        <div className="grid min-w-0 items-start gap-5 @[900px]:grid-cols-[190px_minmax(0,1fr)_300px] @[1400px]:grid-cols-[220px_minmax(0,1fr)_330px]">
            <aside className="min-w-0 rounded-md border p-4">
                <div className="flex items-center justify-between gap-2"><h2 className="font-medium">Plantillas</h2><Button size="sm" variant="outline" onClick={newTemplate}>Nueva</Button></div>
                {templates.isLoading && <p className="mt-3 text-sm">Cargando…</p>}
                {templates.error && <p className="mt-3 text-sm text-destructive">No se pudieron cargar las plantillas.</p>}
                <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">{templates.data?.labelTemplates.map(template => <button key={template.id} type="button" onClick={() => openTemplate(template)} className={`block w-full rounded-md border p-2 text-left text-sm ${template.id === templateId ? 'border-primary bg-muted' : ''}`}><span className="block font-medium">{template.name}</span><span className="text-xs text-muted-foreground">{template.widthMm} × {template.heightMm} unidades</span></button>)}</div>
            </aside>

            <section className="min-w-0 space-y-4 rounded-md border p-4">
                <div className="space-y-3 rounded-md border p-3">
                    <h2 className="font-medium">Propiedades de la etiqueta</h2>
                    <div className="overflow-x-auto pb-1"><div className="flex min-w-max items-end gap-3"><label className="block w-48 text-xs">Nombre<input value={name} onChange={event => setName(event.target.value)} maxLength={100} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label><label className="block w-24 text-xs">Ancho<input aria-label="Ancho de la etiqueta en unidades" type="number" min="20" max="200" value={widthMm} onChange={event => setWidthMm(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label><label className="block w-24 text-xs">Alto<input aria-label="Alto de la etiqueta en unidades" type="number" min="15" max="287" value={heightMm} onChange={event => setHeightMm(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label><label className="block w-32 text-xs">Margen (unidades)<input type="number" min="0" max={Math.max(0, Math.min(widthMm, heightMm) / 2 - 0.5)} step="0.5" value={labelMargin} onChange={event => setLabelMargin(Math.max(0, Math.min(Math.min(widthMm, heightMm) / 2 - 0.5, Number(event.target.value) || 0)))} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label><label className="mb-2 flex items-center gap-2 whitespace-nowrap text-xs"><input type="checkbox" checked={cutMarks} onChange={event => setCutMarks(event.target.checked)} />Cruces de corte</label></div></div>
                </div>
                <div className="space-y-2 rounded-md border p-3">
                    <h2 className="font-medium">Variables y contenido</h2>
                    <div className="flex flex-wrap gap-1">{fields.map(field => { const Icon = field.icon; return <span key={field.key} title={field.description}><Button size="sm" variant="secondary" type="button" disabled={!selectedRange} onClick={() => assign(field.key)}><Icon aria-hidden="true" className="mr-1 h-4 w-4" />{field.label}</Button></span>; })}
                        <span title="Contenido escrito manualmente"><Button size="sm" variant="outline" type="button" disabled={!selectedRange} onClick={addText}><Type aria-hidden="true" className="mr-1 h-4 w-4" />Texto fijo</Button></span>
                        <span title="Logotipo u otra imagen permanente"><Button size="sm" variant="outline" type="button" disabled={!selectedRange} onClick={() => imageInput.current?.click()}><ImageIcon aria-hidden="true" className="mr-1 h-4 w-4" />Imagen fija</Button></span>
                        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => { addImage(event.target.files?.[0]); event.target.value = ''; }} />
                    </div>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-medium">Áreas de la etiqueta</h2><p className="text-sm text-muted-foreground">Arrastra sobre las celdas para seleccionar un área. Luego elige qué variable debe ocuparla.</p></div><div className="flex flex-wrap items-end gap-2"><label className="w-48 text-sm">Densidad de cuadrícula<select value={gridDensity} onChange={event => changeDensity(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value={1}>Normal · 12 × 8</option><option value={2}>Fina · 24 × 16</option><option value={3}>Muy fina · 36 × 24</option><option value={4}>Máxima · 48 × 32</option></select></label><div className="mb-0.5 flex gap-2"><Button disabled={busy} onClick={() => void save()}>Guardar plantilla</Button>{templateId && <Button disabled={busy} variant="destructive" onClick={() => void removeTemplate()}>Eliminar plantilla</Button>}</div></div></div>
                <div className="overflow-auto rounded-md border bg-slate-100 p-4"><div ref={labelCanvas} className="relative mx-auto w-full bg-white shadow" style={{ aspectRatio: `${Math.max(1, widthMm)} / ${Math.max(1, heightMm)}` }}>{renderedLabel && <img src={renderedLabel} alt="Vista previa de la etiqueta" className="pointer-events-none absolute inset-0 h-full w-full" />}<div className="absolute grid select-none" style={{ left: `${visibleLabelMargin / Math.max(1, widthMm) * 100}%`, right: `${visibleLabelMargin / Math.max(1, widthMm) * 100}%`, top: `${visibleLabelMargin / Math.max(1, heightMm) * 100}%`, bottom: `${visibleLabelMargin / Math.max(1, heightMm) * 100}%`, gridTemplateColumns: `repeat(${columns * gridDensity}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows * gridDensity}, minmax(0, 1fr))` }}>
                    {Array.from({ length: columns * rows * gridDensity * gridDensity }, (_, index) => {
                        const point = { column: index % (columns * gridDensity), row: Math.floor(index / (columns * gridDensity)) };
                        const area = areas.find(value => contains(value, point));
                        const isSelected = selectedRange && contains(selectedRange, point);
                        return <button key={index} type="button" aria-label={`Columna ${point.column + 1}, fila ${point.row + 1}`} onMouseDown={() => startSelection(point)} onMouseEnter={() => extendSelection(point)} style={{ gridColumn: point.column + 1, gridRow: point.row + 1 }} className={`z-10 ${!area ? `border border-slate-200/70 ${point.column % gridDensity === 0 ? 'border-l-slate-400/70' : ''} ${point.row % gridDensity === 0 ? 'border-t-slate-400/70' : ''}` : ''} ${isSelected && !selectedArea ? 'bg-blue-200/30 ring-2 ring-inset ring-primary' : ''}`} />;
                    })}
                    {!renderedLabel && areas.map(area => {
                        const box = areaContentBox(widthMm * scale, heightMm * scale, area, area.marginMm, area.paddingMm, gridDensity, visibleLabelMargin);
                        const outerWidth = (area.toColumn - area.fromColumn + 1) * (widthMm - visibleLabelMargin * 2) * scale / (columns * gridDensity);
                        const outerHeight = (area.toRow - area.fromRow + 1) * (heightMm - visibleLabelMargin * 2) * scale / (rows * gridDensity);
                        const marginPx = Math.max(0, (outerWidth - box.borderWidth) / 2) * canvasScale;
                        const paddingPx = Math.max(0, (box.borderWidth - box.width) / 2) * canvasScale;
                        const sideways = area.rotation === 90 || area.rotation === 270;
                        const automaticFontPx = Math.max(7, Math.min(20, (sideways ? box.width : box.height) * 0.55)) * area.contentScale / 100;
                        const fontPx = (area.textSizeMm === null ? automaticFontPx : area.textSizeMm * scale) * canvasScale;
                        return <div key={area.id} className="pointer-events-none z-20 flex overflow-hidden leading-tight" style={{
                            gridColumn: `${area.fromColumn + 1} / ${area.toColumn + 2}`, gridRow: `${area.fromRow + 1} / ${area.toRow + 2}`,
                            margin: `${marginPx}px`, padding: `${paddingPx}px`, backgroundColor: area.backgroundColor,
                            border: area.borderStyle === 'none' || !area.borderWidthMm ? 'none' : `${area.borderWidthMm * scale * canvasScale}px ${area.borderStyle} ${area.borderColor}`,
                            color: area.textColor, fontFamily: area.fontFamily, fontWeight: area.fontWeight, fontStyle: area.fontStyle,
                            fontSize: `${fontPx}px`,
                            justifyContent: area.horizontalAlign === 'left' ? 'flex-start' : area.horizontalAlign === 'right' ? 'flex-end' : 'center',
                            alignItems: area.verticalAlign === 'top' ? 'flex-start' : area.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                            textAlign: area.horizontalAlign,
                        }}><span className="inline-flex max-h-full max-w-full items-center justify-center" style={{ transform: `rotate(${area.rotation}deg)` }}>{areaPreview(area)}</span></div>;
                    })}
                    {selectedArea && <SelectedSpacing area={selectedArea} widthMm={widthMm} heightMm={heightMm} density={gridDensity} labelMargin={visibleLabelMargin} />}
                </div>{cutMarks && <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible" viewBox={`0 0 ${Math.max(1, widthMm)} ${Math.max(1, heightMm)}`} preserveAspectRatio="none">{[0, Math.max(1, widthMm)].flatMap(x => [0, Math.max(1, heightMm)].map(y => <g key={`${x}-${y}`} stroke="#111827" strokeWidth="0.35"><line x1={x - 1.5} y1={y} x2={x + 1.5} y2={y} /><line x1={x} y1={y - 1.5} x2={x} y2={y + 1.5} /></g>))}</svg>}</div></div>
                {selectedArea && <p className="text-xs text-muted-foreground"><span className="text-amber-600">■</span> Margen: espacio exterior al borde · <span className="text-sky-600">■</span> Padding: espacio entre el borde y el contenido</p>}
                <p className="text-xs text-muted-foreground">Vista de ejemplo: {exampleVariant.isLoading ? 'cargando variante…' : exampleVariant.data ? `${exampleVariant.data.product.name} · ${exampleVariant.data.name}` : 'selecciona un producto con variantes en Generar etiquetas.'}</p>
                {needsBusinessLogo && exampleVariant.data?.businessLogo && exampleVariant.data.businessLogo.status !== 'AVAILABLE' && <p role="status" className="text-xs text-amber-700">{logoNotice(exampleVariant.data.businessLogo.status, exampleVariant.data.businessLogo.candidates.length > 0)}</p>}
            </section>

            <aside className="min-w-0 space-y-4">
                {!selectedArea && <div className="rounded-md border p-4 text-sm text-muted-foreground">Selecciona un área del lienzo para editarla.</div>}
                {selectedArea && <div className="rounded-md border p-4 text-sm">
                    <div className="font-medium">{areaLabel(selectedArea)}</div>
                    <p className="text-xs text-muted-foreground">Columnas {selectedArea.fromColumn + 1}–{selectedArea.toColumn + 1} · filas {selectedArea.fromRow + 1}–{selectedArea.toRow + 1}</p>
                    <Tabs key={`${selectedArea.id}-${isTextArea(selectedArea)}`} defaultValue="area" className="mt-3">
                        <TabsList className={`grid w-full ${isTextArea(selectedArea) ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            <TabsTrigger value="area">Área</TabsTrigger>
                            <TabsTrigger value="variable">Variable</TabsTrigger>
                            {isTextArea(selectedArea) && <TabsTrigger value="texto">Texto</TabsTrigger>}
                        </TabsList>
                        <TabsContent value="area" className="mt-3 space-y-3">
                            <label className="block text-xs">Margen exterior (unidades)<input type="number" min="0" max="10" step="0.5" value={selectedArea.marginMm} onChange={event => updateSelectedArea({ marginMm: Math.max(0, Math.min(10, Number(event.target.value) || 0)) })} className="mt-1 h-9 w-full rounded-md border px-2" /></label>
                            <label className="block text-xs">Padding interior (unidades)<input type="number" min="0" max="10" step="0.5" value={selectedArea.paddingMm} onChange={event => updateSelectedArea({ paddingMm: Math.max(0, Math.min(10, Number(event.target.value) || 0)) })} className="mt-1 h-9 w-full rounded-md border px-2" /></label>
                            <label className="block text-xs">Fondo del área<input type="color" value={selectedArea.backgroundColor} onChange={event => updateSelectedArea({ backgroundColor: event.target.value })} className="mt-1 h-9 w-full rounded-md border p-1" /></label>
                            <label className="block text-xs">Color del borde<input type="color" value={selectedArea.borderColor} onChange={event => updateSelectedArea({ borderColor: event.target.value })} className="mt-1 h-9 w-full rounded-md border p-1" /></label>
                            <label className="block text-xs">Grosor del borde (unidades)<input type="number" min="0" max="5" step="0.1" value={selectedArea.borderWidthMm} onChange={event => updateSelectedArea({ borderWidthMm: Math.max(0, Math.min(5, Number(event.target.value) || 0)) })} className="mt-1 h-9 w-full rounded-md border px-2" /></label>
                            <label className="block text-xs">Estilo del borde<select value={selectedArea.borderStyle} onChange={event => updateSelectedArea({ borderStyle: event.target.value as BorderStyle })} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="solid">Sólido</option><option value="dashed">Discontinuo</option><option value="dotted">Punteado</option><option value="none">Sin borde</option></select></label>
                            <Button variant="destructive" size="sm" type="button" onClick={removeSelectedArea}>Quitar área</Button>
                        </TabsContent>
                        <TabsContent value="variable" className="mt-3 space-y-3">
                            {selectedArea.kind === 'field' && <label className="block text-xs">Variable<select value={selectedArea.field} onChange={event => updateSelectedArea({ field: event.target.value as LabelField })} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>}
                            {selectedArea.kind === 'text' && <p className="text-xs text-muted-foreground">Texto fijo · edita su contenido y estilo en la pestaña Texto.</p>}
                            {selectedArea.kind === 'image' && <div className="space-y-2"><p className="text-xs">Imagen fija</p><Button type="button" size="sm" variant="outline" onClick={() => replaceImageInput.current?.click()}>Cambiar imagen</Button><input ref={replaceImageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => { replaceSelectedImage(event.target.files?.[0]); event.target.value = ''; }} /></div>}
                            <div><p className="text-xs">Orientación · {selectedArea.rotation}°</p><div className="mt-1 grid grid-cols-2 gap-2"><Button type="button" size="sm" variant="outline" onClick={() => updateSelectedArea({ rotation: ((selectedArea.rotation + 270) % 360) as Rotation })}>↶ Antihorario</Button><Button type="button" size="sm" variant="outline" onClick={() => updateSelectedArea({ rotation: ((selectedArea.rotation + 90) % 360) as Rotation })}>↷ Horario</Button></div></div>
                            <div><p className="text-xs">Alineación horizontal</p><div className="mt-1 grid grid-cols-3 gap-1">{([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={selectedArea.horizontalAlign === value ? 'default' : 'outline'} aria-pressed={selectedArea.horizontalAlign === value} onClick={() => updateSelectedArea({ horizontalAlign: value })} className="px-1 text-xs">{label}</Button>)}</div></div>
                            <div><p className="text-xs">Alineación vertical</p><div className="mt-1 grid grid-cols-3 gap-1">{([['top', 'Arriba'], ['middle', 'Centro'], ['bottom', 'Abajo']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={selectedArea.verticalAlign === value ? 'default' : 'outline'} aria-pressed={selectedArea.verticalAlign === value} onClick={() => updateSelectedArea({ verticalAlign: value })} className="px-1 text-xs">{label}</Button>)}</div></div>
                            {selectedArea.kind === 'field' && selectedArea.field === 'color' && <label className="block text-xs">Forma de la muestra<select value={selectedArea.colorShape} onChange={event => updateSelectedArea({ colorShape: event.target.value as ColorShape })} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="circle">Círculo</option><option value="square">Cuadrado</option><option value="star">Estrella</option><option value="heart">Corazón</option></select></label>}
                            {(selectedArea.kind === 'image' || (selectedArea.kind === 'field' && ['foto', 'logoNegocio', 'barcode', 'qr', 'color'].includes(selectedArea.field))) && <label className="block text-xs">Escala de contenido (%)<input type="number" min="25" max={selectedArea.kind === 'field' && ['qr', 'barcode'].includes(selectedArea.field) ? 100 : 200} step="5" value={selectedArea.contentScale} onChange={event => updateSelectedArea({ contentScale: Math.max(25, Math.min(selectedArea.kind === 'field' && ['qr', 'barcode'].includes(selectedArea.field) ? 100 : 200, Number(event.target.value) || 25)) })} className="mt-1 h-9 w-full rounded-md border px-2" /></label>}
                        </TabsContent>
                        <TabsContent value="texto" className="mt-3 space-y-3">
                            {selectedArea.kind === 'text' && <label className="block text-xs">Texto fijo<input value={selectedArea.text} onChange={event => updateSelectedArea({ text: event.target.value })} maxLength={200} className="mt-1 h-9 w-full rounded-md border px-2" /></label>}
                            {isTextArea(selectedArea) && <>
                                <label className="block text-xs">Fuente<select value={selectedArea.fontFamily} onChange={event => updateSelectedArea({ fontFamily: event.target.value })} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option>Arial</option><option>Verdana</option><option>Georgia</option><option>Courier New</option></select></label>
                                <label className="block text-xs">Tamaño de texto (unidades)<input type="number" min="0.5" max="30" step="0.5" value={selectedArea.textSizeMm ?? selectedTextSizing?.automaticMm ?? 0.5} onChange={event => updateSelectedArea({ textSizeMm: event.target.value === '' ? null : Math.max(0.5, Math.min(30, Number(event.target.value) || 0.5)) })} className="mt-1 h-9 w-full rounded-md border px-2" /></label>
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Tamaño recomendado: {selectedTextSizing?.maxMm ?? 30} unidades</span><Button type="button" size="sm" variant={selectedArea.textSizeMm === null ? 'secondary' : 'outline'} onClick={() => updateSelectedArea({ textSizeMm: null })}>Automático</Button></div>
                                <label className="block text-xs">Color de texto<input type="color" value={selectedArea.textColor} onChange={event => updateSelectedArea({ textColor: event.target.value })} className="mt-1 h-9 w-full rounded-md border p-1" /></label>
                                <div className="flex gap-2"><Button type="button" size="sm" variant={selectedArea.fontWeight === 'bold' ? 'default' : 'outline'} onClick={() => updateSelectedArea({ fontWeight: selectedArea.fontWeight === 'bold' ? 'normal' : 'bold' })}>Negrita</Button><Button type="button" size="sm" variant={selectedArea.fontStyle === 'italic' ? 'default' : 'outline'} onClick={() => updateSelectedArea({ fontStyle: selectedArea.fontStyle === 'italic' ? 'normal' : 'italic' })}>Cursiva</Button></div>
                            </>}
                        </TabsContent>
                    </Tabs>
                </div>}
            </aside>
        </div>
        </div>
        <div className="space-y-4 rounded-md border p-4">
            <div><h2 className="font-medium">Generar etiquetas</h2><p className="text-sm text-muted-foreground">Indica cuántos pares etiquetar por variante.</p></div>
            <div className="grid grid-cols-[minmax(0,1fr)_11rem_auto] items-end gap-3">
            <div ref={productPicker} className="relative min-w-0 text-sm">
                <label htmlFor="label-product-search">Buscar producto</label>
                <input id="label-product-search" role="combobox" aria-autocomplete="list" aria-expanded={productPickerOpen} aria-controls="label-product-options" aria-activedescendant={productPickerOpen && productChoices[activeProductIndex] ? `label-product-option-${productChoices[activeProductIndex].id}` : undefined} value={productSearch} onFocus={event => { setProductPickerOpen(true); void products.refetch(); if (selectedProduct) event.currentTarget.select(); }} onBlur={event => { if (!productPicker.current?.contains(event.relatedTarget as Node)) setProductPickerOpen(false); }} onChange={event => { setProductSearch(event.target.value); setProductPickerOpen(true); setActiveProductIndex(0); setProductId(''); setLogoSellerId(''); setSelectedProduct(null); setQuantities({}); }} onKeyDown={event => {
                    const choices = productChoices;
                    if (event.key === 'ArrowDown') { event.preventDefault(); setProductPickerOpen(true); setActiveProductIndex(index => Math.min(index + 1, Math.max(0, choices.length - 1))); }
                    if (event.key === 'ArrowUp') { event.preventDefault(); setProductPickerOpen(true); setActiveProductIndex(index => Math.max(index - 1, 0)); }
                    if (event.key === 'Enter' && productPickerOpen && choices[activeProductIndex]) { event.preventDefault(); selectProduct(choices[activeProductIndex]); }
                    if (event.key === 'Escape') setProductPickerOpen(false);
                }} className="mt-1 h-9 w-full rounded-md border bg-background px-2" placeholder="Nombre o código del calzado" autoComplete="off" />
                {productPickerOpen && <div id="label-product-options" role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background p-1 shadow-lg">
                    {products.isFetching && <p className="p-2 text-muted-foreground">Buscando productos…</p>}
                    {!products.isFetching && !productChoices.length && <p className="p-2 text-muted-foreground">No hay productos coincidentes.</p>}
                    {productChoices.map((product, index) => <button id={`label-product-option-${product.id}`} key={product.id} role="option" aria-selected={product.id === productId} type="button" onMouseDown={event => event.preventDefault()} onClick={() => selectProduct(product)} className={`block w-full rounded px-2 py-2 text-left hover:bg-muted ${index === activeProductIndex ? 'bg-muted' : ''}`}><span className="block font-medium">{product.name}</span>{product.customFields?.codigo && <span className="text-xs text-muted-foreground">{product.customFields.codigo}</span>}</button>)}
                </div>}
            </div>
            <label className="block text-sm">Etiquetas por par<select value={labelsPerPair} onChange={event => setLabelsPerPair(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value={1}>1 · caja</option><option value={2}>2 · interior (izquierdo y derecho)</option></select></label>
            {!!variants.data?.length && <Button type="button" size="sm" variant="outline" onClick={() => setQuantities(Object.fromEntries(variants.data.map(variant => [variant.id, variant.stockLevels.reduce((total, level) => total + level.stockOnHand, 0)])))}>Usar stock físico</Button>}
            </div>
            {needsBusinessLogo && Boolean(variants.data?.[0]?.businessLogo?.candidates.length) && <label className="block max-w-md text-sm">Negocio para el logo
                <select value={logoSellerId} onChange={event => setLogoSellerId(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="">Seleccionar negocio…</option>{variants.data?.[0]?.businessLogo?.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.hasLogo ? '' : ' · sin logo'}</option>)}</select>
            </label>}
            {products.error && <p className="text-sm text-destructive">No se pudieron cargar los productos: {products.error instanceof Error ? products.error.message : String(products.error)}</p>}
            {variants.isLoading && <p className="text-sm">Cargando variantes…</p>}
            {variants.error && <p className="text-sm text-destructive">No se pudieron cargar las variantes: {variants.error instanceof Error ? variants.error.message : String(variants.error)}</p>}
            {!!variants.data?.length && <div className="max-h-[32rem] overflow-auto rounded-md border">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/95">
                        <tr className="border-b text-left">
                            <th scope="col" className="min-w-28 px-3 py-3 font-medium">Código</th>
                            <th scope="col" className="min-w-40 px-3 py-3 font-medium">Color(es)</th>
                            <th scope="col" className="min-w-28 px-3 py-3 font-medium">Capellada</th>
                            <th scope="col" className="min-w-24 px-3 py-3 font-medium">Suela</th>
                            {quantityMatrix.sizes.map(size => <th scope="col" key={size} className="min-w-24 px-3 py-3 text-center font-medium">{size}</th>)}
                        </tr>
                    </thead>
                    <tbody>{quantityMatrix.rows.map(row => <tr key={row.key} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-mono text-xs">{selectedProduct?.customFields?.codigo || '—'}</td>
                        <th scope="row" className="px-3 py-3 text-left font-normal">{row.color}</th>
                        <td className="px-3 py-3">{row.upper}</td>
                        <td className="px-3 py-3">{row.sole}</td>
                        {quantityMatrix.sizes.map(size => {
                            const cell = row.bySize.get(size);
                            return <td key={size} className="p-2 text-center">{cell?.length ? cell.map(variant => <input key={variant.id} aria-label={`Pares para ${row.color}, ${row.upper}, ${row.sole}, talla ${size}, SKU ${variant.sku}`} title={variant.sku} type="number" min="0" max="1000" step="1" value={quantities[variant.id] ?? 0} onChange={event => setQuantities(current => ({ ...current, [variant.id]: Number(event.target.value) }))} className="mx-auto block h-9 w-20 rounded-md border bg-background px-2 text-center [&+&]:mt-1" />) : <span className="text-muted-foreground">—</span>}</td>;
                        })}
                    </tr>)}</tbody>
                </table>
            </div>}
            <Button disabled={busy || variants.isFetching || !variants.data?.length} variant="outline" onClick={openPdfPreview}>Vista previa del PDF</Button>
        </div>
        <Dialog open={Boolean(previewRequest)} onOpenChange={open => { if (!open) setPreviewRequest(null); }}>
            <DialogContent className="flex h-[92vh] w-[96vw] flex-col sm:max-w-[1200px]">
                <DialogHeader><DialogTitle>Vista previa de etiquetas</DialogTitle><DialogDescription>Configura la hoja y comprueba cómo quedarán las etiquetas antes de descargar o imprimir.</DialogDescription></DialogHeader>
                <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:grid-rows-1">
                    <div className="max-h-48 space-y-3 overflow-y-auto pr-1 text-sm lg:max-h-none">
                        <label className="block">Tamaño de hoja<select value={sheetLayout.paper} onChange={event => updateSheetLayout({ paper: event.target.value as LabelSheetLayout['paper'] })} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="a4">A4</option><option value="a3">A3</option><option value="letter">Carta</option><option value="legal">Oficio / Legal</option></select></label>
                        <div className="grid grid-cols-2 gap-2">
                            <label>Columnas<input type="number" min="1" max="20" step="1" value={sheetLayout.columns} onChange={event => {
                                const next = { ...sheetLayout, columns: Number(event.target.value) };
                                setManualColumns(true);
                                if (automaticRows && previewRequest) {
                                    try { next.rows = labelSheetMetrics(previewRequest.draft, next).automaticRows; } catch { /* The PDF shows the validation error. */ }
                                }
                                setSheetLayout(next);
                            }} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label>
                            <label>Filas<input type="number" min="1" max="20" step="1" value={sheetLayout.rows} onChange={event => { setAutomaticRows(false); setSheetLayout(current => ({ ...current, rows: Number(event.target.value) })); }} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label>
                        </div>
                        <div className="rounded-md border bg-muted/40 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span>{automaticRows ? `Filas automáticas: ${sheetLayout.rows}` : 'Filas establecidas manualmente'}</span><Button type="button" size="sm" variant="outline" disabled={automaticRows} onClick={restoreAutomaticRows}>Automáticas</Button></div><p className="mt-1 text-muted-foreground">La distribución inicial aproxima la proporción del lienzo y ocupa toda el área disponible de la hoja.</p></div>
                        <div><p className="font-medium">Márgenes de hoja (mm)</p><div className="mt-1 grid grid-cols-2 gap-2">{([['marginTopMm', 'Superior'], ['marginRightMm', 'Derecho'], ['marginBottomMm', 'Inferior'], ['marginLeftMm', 'Izquierdo']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="100" step="1" value={sheetLayout[key]} onChange={event => updateSheetLayout({ [key]: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label>)}</div></div>
                        <p className="text-xs text-muted-foreground">Las etiquetas quedan contiguas. Si cambias filas o columnas, el diseño se adapta a la proporción de cada celda.</p>
                        {previewMetrics && <div className="rounded-md border bg-background p-2 text-xs"><p className="font-medium">Medida de cada etiqueta</p><p>{previewMetrics.labelWidthMm.toFixed(1)} × {previewMetrics.labelHeightMm.toFixed(1)} mm</p><p>{(previewMetrics.labelWidthMm / 10).toFixed(2)} × {(previewMetrics.labelHeightMm / 10).toFixed(2)} cm</p></div>}
                        <p className="text-xs">{labelsPerSheet} etiquetas por hoja · {totalLabels} en total{pdfPreview ? ` · ${pdfPreview.result.pages} páginas` : ''}{labelsPerSheet > 0 && totalLabels > labelsPerSheet && totalLabels % labelsPerSheet ? ` · última hoja: ${totalLabels % labelsPerSheet}` : ''}</p>
                        <div className="flex flex-wrap gap-2"><Button disabled={!pdfPreview || pdfBusy} onClick={() => {
                            if (!pdfPreview || !previewRequest) return;
                            const link = document.createElement('a');
                            link.href = pdfPreview.url;
                            link.download = `etiquetas-${previewRequest.draft.name.trim().replace(/[^a-z0-9]+/gi, '-') || 'calzado'}.pdf`;
                            link.click();
                        }}>Descargar PDF</Button><Button disabled={!pdfPreview || pdfBusy} variant="outline" onClick={printPdf}>Imprimir</Button></div>
                    </div>
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-muted/40">
                        {pdfBusy && <p className="p-4 text-sm">Generando vista previa del PDF…</p>}
                        {pdfError && <p role="alert" className="p-4 text-sm text-destructive">{pdfError}</p>}
                        {pdfPreview && !pdfBusy && <iframe title="Vista previa del PDF de etiquetas" src={pdfPreview.url} className="min-h-0 w-full flex-1 bg-white" />}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    </div>;
}
