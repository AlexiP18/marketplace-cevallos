import { fabric } from 'fabric';
import bwipjs from 'bwip-js';
import { code128Options, QR_PREVIEW } from './label-symbols';
import QRCode from 'qrcode';

export type LabelVariant = {
    id: string;
    name: string;
    sku: string;
    priceWithTax: number;
    currencyCode: string;
    customFields?: { codigoBarras?: string | null; colores?: Array<{ nombre: string; codigo?: string | null }> | null } | null;
    featuredAsset?: { preview: string } | null;
    businessLogo?: { status: 'AVAILABLE' | 'MISSING' | 'AMBIGUOUS' | 'NO_SELLER'; logo: { preview: string } | null; candidates: Array<{ id: string; name: string; hasLogo: boolean }> };
    stockLevels: Array<{ stockOnHand: number }>;
    product: { name: string; customFields?: { codigo?: string | null } | null; featuredAsset?: { preview: string } | null };
    options: Array<{ name: string; group: { code: string }; customFields?: { colores?: Array<{ nombre: string; codigo?: string | null }> | null } | null }>;
};

export type LabelTemplateDraft = { name: string; widthMm: number; heightMm: number; design: string };
export type LabelSheetLayout = {
    paper: 'a4' | 'a3' | 'letter' | 'legal';
    columns: number;
    rows: number;
    marginTopMm: number;
    marginRightMm: number;
    marginBottomMm: number;
    marginLeftMm: number;
};

export type LabelSheetMetrics = {
    pageWidthMm: number;
    pageHeightMm: number;
    usableWidthMm: number;
    usableHeightMm: number;
    automaticRows: number;
    labelWidthMm: number;
    labelHeightMm: number;
};

const paperDimensions: Record<LabelSheetLayout['paper'], { width: number; height: number }> = {
    a4: { width: 210, height: 297 },
    a3: { width: 297, height: 420 },
    letter: { width: 215.9, height: 279.4 },
    legal: { width: 215.9, height: 355.6 },
};

export function labelSheetMetrics(draft: Pick<LabelTemplateDraft, 'widthMm' | 'heightMm'>, layout: LabelSheetLayout): LabelSheetMetrics {
    if (![layout.columns, layout.rows].every(value => Number.isInteger(value) && value >= 1 && value <= 20)) {
        throw new Error('Indica entre 1 y 20 columnas y filas.');
    }
    if ([layout.marginTopMm, layout.marginRightMm, layout.marginBottomMm, layout.marginLeftMm].some(value => !Number.isFinite(value) || value < 0 || value > 100)) {
        throw new Error('Cada margen debe estar entre 0 y 100 mm.');
    }
    const page = paperDimensions[layout.paper];
    const usableWidthMm = page.width - layout.marginLeftMm - layout.marginRightMm;
    const usableHeightMm = page.height - layout.marginTopMm - layout.marginBottomMm;
    if (usableWidthMm <= 0 || usableHeightMm <= 0) throw new Error('Los márgenes no dejan espacio para las etiquetas.');
    const ratio = draft.widthMm / draft.heightMm;
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('El tamaño de la etiqueta no es válido.');
    const cellWidth = usableWidthMm / layout.columns;
    const automaticRows = Math.max(1, Math.min(20, Math.round(usableHeightMm / (cellWidth / ratio))));
    const cellHeight = usableHeightMm / layout.rows;
    return {
        pageWidthMm: page.width,
        pageHeightMm: page.height,
        usableWidthMm,
        usableHeightMm,
        automaticRows,
        labelWidthMm: cellWidth,
        labelHeightMm: cellHeight,
    };
}

export function recommendedSheetGrid(draft: Pick<LabelTemplateDraft, 'widthMm' | 'heightMm'>, layout: LabelSheetLayout) {
    const page = paperDimensions[layout.paper];
    const width = page.width - layout.marginLeftMm - layout.marginRightMm;
    const height = page.height - layout.marginTopMm - layout.marginBottomMm;
    if (width <= 0 || height <= 0) throw new Error('Los márgenes no dejan espacio para las etiquetas.');
    const ratio = draft.widthMm / draft.heightMm;
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('El tamaño de la etiqueta no es válido.');
    let best = { columns: 1, rows: 1, score: Infinity };
    for (let columns = 1; columns <= 10; columns++) {
        for (let rows = 1; rows <= 20; rows++) {
            const cellRatio = (width / columns) / (height / rows);
            const score = Math.abs(Math.log(cellRatio / ratio)) + Math.abs(columns * rows - 10) * 0.02;
            if (score < best.score) best = { columns, rows, score };
        }
    }
    return { columns: best.columns, rows: best.rows };
}

export function barcodeImage(value: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bwipjs.toSVG(code128Options(value)))}`;
}


const presetColors: Record<string, string> = {
    negro: '#000000', blanco: '#ffffff', café: '#6f4e37', cafe: '#6f4e37', beige: '#f5f5dc', azul: '#0000ff',
    rojo: '#ff0000', rosa: '#ffc0cb', miel: '#d99a26', gris: '#808080', verde: '#008000', amarillo: '#ffff00', morado: '#800080',
};

function swatchColor(code: string | null | undefined, name: string) {
    const value = (code || '').trim();
    if (/^#[\da-f]{6}$/i.test(value)) return value;
    if (/^#[\da-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map(character => character + character).join('')}`;
    const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(value);
    if (rgb) return `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, '0')).join('')}`;
    const cmyk = /^cmyk\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*\)$/i.exec(value);
    if (cmyk) {
        const channels = cmyk.slice(1).map(channel => Number.parseFloat(channel) / (channel.endsWith('%') ? 100 : 1));
        if (channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1)) {
            return `#${channels.slice(0, 3).map(channel => Math.round(255 * (1 - channel) * (1 - channels[3])).toString(16).padStart(2, '0')).join('')}`;
        }
    }
    return presetColors[value.toLowerCase()] || presetColors[name.trim().toLowerCase()] || '#d1d5db';
}

export function labelColors(variant: LabelVariant) {
    const colorOption = variant.options.find(value => value.group.code.toLowerCase().includes('color'));
    const optionColors = colorOption?.customFields?.colores?.filter(color => color?.nombre) ?? [];
    const structured = optionColors.length ? optionColors : variant.customFields?.colores?.filter(color => color?.nombre) ?? [];
    const colors = structured.length ? structured : (colorOption?.name || '').split(/\s*\/\s*/).filter(Boolean).map(nombre => ({ nombre, codigo: null }));
    return colors.map(color => ({ name: color.nombre, fill: swatchColor(color.codigo, color.nombre) }));
}

function option(variant: LabelVariant, kind: string) {
    return variant.options.find(value => value.group.code.toLowerCase().includes(kind))?.name ?? '';
}

export function labelFields(variant: LabelVariant) {
    return {
        producto: variant.product.name,
        codigo: variant.product.customFields?.codigo || '',
        sku: variant.sku,
        talla: option(variant, 'talla') || option(variant, 'size'),
        color: labelColors(variant).map(color => color.name).join(' / '),
        capellada: option(variant, 'capellada'),
        suela: option(variant, 'suela'),
        precio: new Intl.NumberFormat('es-EC', { style: 'currency', currency: variant.currencyCode || 'USD' }).format(variant.priceWithTax / 100),
        codigoBarras: variant.customFields?.codigoBarras || variant.sku,
        foto: variant.featuredAsset?.preview || variant.product.featuredAsset?.preview || '',
        logoNegocio: variant.businessLogo?.logo?.preview || '',
    };
}

function loadImage(url: string) {
    return new Promise<fabric.Image>((resolve, reject) => {
        fabric.Image.fromURL(url, image => image ? resolve(image) : reject(new Error('No se pudo cargar una imagen de la etiqueta.')), { crossOrigin: 'anonymous' });
    });
}

type AreaGrid = { fromColumn: number; toColumn: number; fromRow: number; toRow: number };

export function areaContentBox(canvasWidth: number, canvasHeight: number, grid: AreaGrid, marginMm: number, paddingMm: number, density = 1, labelMargin = 0) {
    const inset = labelMargin * 4;
    const cellWidth = (canvasWidth - inset * 2) / (12 * density);
    const cellHeight = (canvasHeight - inset * 2) / (8 * density);
    const outerLeft = inset + grid.fromColumn * cellWidth;
    const outerTop = inset + grid.fromRow * cellHeight;
    const outerWidth = (grid.toColumn - grid.fromColumn + 1) * cellWidth;
    const outerHeight = (grid.toRow - grid.fromRow + 1) * cellHeight;
    const margin = Math.min(Math.max(0, marginMm * 4), Math.max(0, (outerWidth - 1) / 2), Math.max(0, (outerHeight - 1) / 2));
    const borderWidth = outerWidth - margin * 2;
    const borderHeight = outerHeight - margin * 2;
    const padding = Math.min(Math.max(0, paddingMm * 4), Math.max(0, (borderWidth - 1) / 2), Math.max(0, (borderHeight - 1) / 2));
    return {
        borderLeft: outerLeft + margin, borderTop: outerTop + margin, borderWidth, borderHeight,
        left: outerLeft + margin + padding, top: outerTop + margin + padding,
        width: Math.max(1, borderWidth - padding * 2), height: Math.max(1, borderHeight - padding * 2),
    };
}

type ObjectData = {
    field?: string; kind?: string; image?: string; contentScale?: number; grid?: AreaGrid;
    marginMm?: number; paddingMm?: number; rotation?: number;
    colorShape?: 'circle' | 'square' | 'star' | 'heart';
    horizontalAlign?: 'left' | 'center' | 'right'; verticalAlign?: 'top' | 'middle' | 'bottom'; textSizeMm?: number | null;
};

function alignedCenter(box: { left: number; top: number; width: number; height: number }, width: number, height: number, data?: ObjectData) {
    const horizontal = data?.horizontalAlign === 'left' ? 0 : data?.horizontalAlign === 'right' ? 1 : 0.5;
    const vertical = data?.verticalAlign === 'top' ? 0 : data?.verticalAlign === 'bottom' ? 1 : 0.5;
    return { left: box.left + width / 2 + Math.max(0, box.width - width) * horizontal, top: box.top + height / 2 + Math.max(0, box.height - height) * vertical };
}

function colorMark(shape: ObjectData['colorShape'], fill: string, top: number): fabric.Object {
    const common = { left: 0, top, fill, stroke: '#1f2937', strokeWidth: 2 };
    if (shape === 'square') return new fabric.Rect({ ...common, width: 19, height: 19 });
    if (shape === 'star') {
        const points = Array.from({ length: 10 }, (_, index) => {
            const radius = index % 2 ? 4.5 : 9.5;
            const angle = index * Math.PI / 5 - Math.PI / 2;
            return { x: 10 + Math.cos(angle) * radius, y: 10 + Math.sin(angle) * radius };
        });
        return new fabric.Polygon(points, common);
    }
    if (shape === 'heart') return new fabric.Path('M 10 18 C 3 13 0 9 2 5 C 4 1 8 2 10 5 C 12 2 16 1 18 5 C 20 9 17 13 10 18 Z', common);
    return new fabric.Circle({ ...common, radius: 9.5 });
}

function colorContent(variant: LabelVariant, text: fabric.Textbox, data?: ObjectData) {
    const colors = labelColors(variant);
    const objects: fabric.Object[] = [];
    colors.forEach((color, index) => {
        const top = index * 25;
        objects.push(colorMark(data?.colorShape, color.fill, top));
        objects.push(new fabric.Text(color.name, {
            left: 27, top: top - 1, fontSize: 20, fill: text.fill, fontFamily: text.fontFamily,
            fontWeight: text.fontWeight, fontStyle: text.fontStyle,
        }));
    });
    return new fabric.Group(objects, { left: 0, top: 0 });
}

export async function renderLabel(draft: LabelTemplateDraft, variant: LabelVariant, boxCode = QR_PREVIEW, encoded?: { barcode: string; qr: string }) {
    const width = Math.round(draft.widthMm * 4);
    const height = Math.round(draft.heightMm * 4);
    const element = typeof document === 'undefined' ? null : document.createElement('canvas');
    const canvas = new fabric.StaticCanvas(element, { width, height, backgroundColor: '#fff' });
    try {
        const design = JSON.parse(draft.design) as { gridDensity?: number; labelMargin?: number };
        const density = [1, 2, 3, 4].includes(design.gridDensity ?? 1) ? design.gridDensity ?? 1 : 1;
        const labelMargin = typeof design.labelMargin === 'number' && Number.isFinite(design.labelMargin) ? Math.max(0, Math.min(design.labelMargin, Math.min(draft.widthMm, draft.heightMm) / 2 - 0.5)) : 0;
        await new Promise<void>(resolve => canvas.loadFromJSON(design, () => resolve()));
        const fields = labelFields(variant);
        for (const object of [...canvas.getObjects()]) {
            const data = (object as fabric.Object & { data?: ObjectData }).data;
            const field = data?.field;
            const box = data?.grid ? areaContentBox(width, height, data.grid, data.paddingMm === undefined ? 0 : data.marginMm ?? 0, data.paddingMm ?? data.marginMm ?? 0, density, labelMargin) : null;
            const rotation = data?.rotation === 90 || data?.rotation === 180 || data?.rotation === 270 ? data.rotation : 0;
            const sideways = rotation === 90 || rotation === 270;
            if (field === 'color' && box && object instanceof fabric.Textbox) {
                const group = colorContent(variant, object, data);
                const availableWidth = sideways ? box.height : box.width;
                const availableHeight = sideways ? box.width : box.height;
                const fit = Math.min(availableWidth / Math.max(1, group.width || 1), availableHeight / Math.max(1, group.height || 1));
                const groupScale = data?.textSizeMm
                    ? Math.min(fit, data.textSizeMm * 4 / 20)
                    : fit * Math.max(0.25, Math.min(2, (data?.contentScale ?? 100) / 100));
                const displayWidth = (sideways ? group.height || 1 : group.width || 1) * groupScale;
                const displayHeight = (sideways ? group.width || 1 : group.height || 1) * groupScale;
                group.set({
                    ...alignedCenter(box, displayWidth, displayHeight, data), originX: 'center', originY: 'center',
                    angle: rotation, scaleX: groupScale, scaleY: groupScale,
                    clipPath: new fabric.Rect({ left: box.left, top: box.top, width: box.width, height: box.height, absolutePositioned: true }),
                });
                const index = canvas.getObjects().indexOf(object);
                canvas.remove(object);
                canvas.insertAt(group, index, false);
            } else if (field === 'foto' || field === 'logoNegocio' || field === 'barcode' || field === 'qr' || (data?.kind === 'image' && data.image)) {
                const source = data?.kind === 'image' ? data.image : field === 'qr' ? encoded?.qr || await QRCode.toDataURL(boxCode, { margin: 4, errorCorrectionLevel: 'M' }) : field === 'barcode' ? encoded?.barcode || barcodeImage(fields.codigoBarras) : field === 'logoNegocio' ? fields.logoNegocio : fields.foto;
                if (!source) { canvas.remove(object); continue; }
                const image = await loadImage(source);
                const contentBox = box || { left: object.left || 0, top: object.top || 0, width: object.getScaledWidth(), height: object.getScaledHeight() };
                const fit = Math.min((sideways ? contentBox.height : contentBox.width) / (image.width || 1), (sideways ? contentBox.width : contentBox.height) / (image.height || 1));
                const scale = fit * Math.max(0.25, Math.min(field === 'qr' || field === 'barcode' ? 1 : 2, (data?.contentScale ?? 100) / 100));
                const targetWidth = (image.width || 1) * scale;
                const targetHeight = (image.height || 1) * scale;
                const displayWidth = sideways ? targetHeight : targetWidth;
                const displayHeight = sideways ? targetWidth : targetHeight;
                image.set({
                    ...alignedCenter(contentBox, displayWidth, displayHeight, data),
                    originX: 'center', originY: 'center', angle: rotation,
                    scaleX: scale,
                    scaleY: scale,
                    clipPath: new fabric.Rect({ left: contentBox.left, top: contentBox.top, width: contentBox.width, height: contentBox.height, absolutePositioned: true }),
                });
                const index = canvas.getObjects().indexOf(object);
                canvas.remove(object);
                canvas.insertAt(image, index, false);
            } else if (object instanceof fabric.Textbox) {
                object.set('text', (object.text || '').replace(/\{\{(producto|codigo|sku|talla|color|capellada|suela|precio|codigoBarras)\}\}/g, (_, key: keyof typeof fields) => fields[key]));
                if (box) {
                    object.set({ width: sideways ? box.height : box.width, angle: 0 });
                    object.initDimensions();
                    const availableHeight = sideways ? box.width : box.height;
                    while (object.getScaledHeight() > availableHeight && (object.fontSize || 0) > 2) {
                        object.set('fontSize', Math.max(2, (object.fontSize || 2.5) - 0.5));
                        object.initDimensions();
                    }
                    const displayWidth = sideways ? object.getScaledHeight() : object.getScaledWidth();
                    const displayHeight = sideways ? object.getScaledWidth() : object.getScaledHeight();
                    object.set({
                        ...alignedCenter(box, displayWidth, displayHeight, data), originX: 'center', originY: 'center', angle: rotation,
                        clipPath: new fabric.Rect({ left: box.left, top: box.top, width: box.width, height: box.height, absolutePositioned: true }),
                    });
                } else {
                    const vertical = data?.verticalAlign === 'top' ? 0 : data?.verticalAlign === 'bottom' ? 1 : 0.5;
                    object.set('top', (object.top || 0) + Math.max(0, height - object.getScaledHeight()) * vertical);
                }
            }
        }
        canvas.renderAll();
        return canvas.toDataURL({ format: 'png', multiplier: 3 });
    } finally {
        canvas.dispose();
    }
}

export type LabelPdfSummary = { labels: number; pages: number; labelWidthMm: number; labelHeightMm: number };
