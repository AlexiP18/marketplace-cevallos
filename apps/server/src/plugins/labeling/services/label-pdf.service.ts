import { Inject, Injectable } from '@nestjs/common';
import { Asset, ForbiddenError, Permission, ProductVariantService, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { createWriteStream } from 'node:fs';
import { readFile, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import sharp from 'sharp';
import { SellerProfile } from '../../multivendor/entities/seller-profile.entity';
import { LABELING_OPTIONS, LabelingOptions } from '../labeling.options';
import { LabelCodeService } from './label-code.service';
import { labelFields, labelSheetMetrics, renderLabel, LabelVariant } from '../shared/label-renderer';
import { code128Options, QR_OPTIONS } from '../shared/label-symbols';

@Injectable()
export class LabelPdfService {
    constructor(private connection: TransactionalConnection, private variants: ProductVariantService, private labelCodes: LabelCodeService, @Inject(LABELING_OPTIONS) private options: LabelingOptions) {}
    async validate(ctx: RequestContext, input: any) {
        if (!ctx.userHasAllPermissions([Permission.ReadCatalog]) || ctx.userHasAllPermissions([Permission.SuperAdmin])) throw new ForbiddenError();
        if (!input?.draft || typeof input.draft.design !== 'string' || input.draft.design.length > 1_000_000 || ![input.draft.widthMm, input.draft.heightMm].every(value => Number.isFinite(value) && value > 0 && value <= 500)) throw new UserInputError('El diseño de la etiqueta no es válido.');
        const design = JSON.parse(input.draft.design);
        if (!Array.isArray(design.objects) || design.objects.length > 100) throw new UserInputError('El diseño admite hasta 100 áreas.');
        const inspectImages = (value: any) => {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                if (['src', 'source', 'image'].includes(key) && typeof child === 'string' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(child)) throw new UserInputError('La plantilla no puede cargar imágenes externas.');
                inspectImages(child);
            }
        };
        inspectImages(design);
        for (const object of design.objects) {
            const image = object.data?.image || object.src;
            if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new UserInputError('Las imágenes fijas deben ser PNG, JPG o WebP incorporados en la plantilla.');
            if (object.type === 'image' && object.src && !object.data?.image) throw new UserInputError('Vuelve a incorporar la imagen fija en su área.');
        }
        labelSheetMetrics(input.draft, input.layout);
        if (!Array.isArray(input.items) || !input.items.length || input.items.length > 1000 || input.items.some((item: any) => !Number.isInteger(item.quantity) || item.quantity < 0 || ![1, 2].includes(item.copiesPerPair ?? 1))) throw new UserInputError('Las cantidades de etiquetas no son válidas.');
        const total = input.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
        if (!total || total > 1000) throw new UserInputError('Selecciona de 1 a 1000 etiquetas.');
        for (const item of input.items) if (!await this.variants.findOne(ctx, item.variantId)) throw new ForbiddenError();

    }
    private async image(asset?: Asset | null) {
        if (!asset) return null;
        const root = path.resolve(this.options.assets);
        const file = path.resolve(root, asset.preview);
        if (!file.startsWith(`${root}${path.sep}`) || !/\.(png|jpe?g|webp)$/i.test(file)) return null;
        const info = await stat(file);
        if (info.size > 5_000_000) throw new Error('La imagen supera 5 MB.');
        const value = await sharp(await readFile(file), { limitInputPixels: 20000000 }).png().toBuffer();
        return { preview: `data:image/png;base64,${value.toString('base64')}` };
    }
    async build(ctx: RequestContext, input: any) {
        const metrics = labelSheetMetrics(input.draft, input.layout);
        const mm = (value: number) => value * 72 / 25.4;
        const name = `etiquetas-${randomUUID()}.pdf`;
        const target = path.join(this.options.privateFiles, name);
        const doc = new PDFDocument({ size: [mm(metrics.pageWidthMm), mm(metrics.pageHeightMm)], margin: 0 });
        const output = createWriteStream(target, { mode: 0o600 });
        doc.pipe(output);
        let index = 0;
        let pairIndex = 0;
        try {
            const design = JSON.parse(input.draft.design);
            const normalizeImages = async (value: any) => {
                if (!value || typeof value !== 'object') return;
                for (const [key, child] of Object.entries(value)) {
                    if (['image', 'src'].includes(key) && typeof child === 'string' && child.startsWith('data:image/webp;base64,')) value[key] = `data:image/png;base64,${(await sharp(Buffer.from(child.split(',')[1], 'base64'), { limitInputPixels: 20000000 }).png().toBuffer()).toString('base64')}`;
                    else await normalizeImages(child);
                }
            };
            await normalizeImages(design);
            const draft = { ...input.draft, design: JSON.stringify(design) };
            const seller = await this.connection.getRepository(ctx, SellerProfile).findOne({ where: { channel: { id: ctx.channelId } }, relations: ['logo'] });
            for (const item of input.items) {
                const raw = await this.variants.findOne(ctx, item.variantId, ['product', 'product.featuredAsset', 'featuredAsset', 'options.group', 'options.translations']);
                if (!raw) throw new Error('La variante ya no pertenece al almacén.');
                const variant = { ...raw, product: { ...raw.product, featuredAsset: await this.image(raw.product.featuredAsset) }, featuredAsset: await this.image(raw.featuredAsset), businessLogo: { status: seller?.logo ? 'AVAILABLE' : 'MISSING', logo: await this.image(seller?.logo), candidates: [] } } as unknown as LabelVariant;
                const barcode = (await bwipjs.toBuffer(code128Options(labelFields(variant).codigoBarras || raw.sku))).toString('base64');
                let rendered = '';
                for (let copy = 0; copy < item.quantity; copy++) {
                    if (copy % (item.copiesPerPair === 2 ? 2 : 1) === 0) {
                        const code = await this.labelCodes.issue(ctx, variant.id, input.batchCode, pairIndex++);
                        const qr = (await bwipjs.toBuffer({ ...QR_OPTIONS, text: code })).toString('base64');
                        rendered = await renderLabel(draft, variant, code, { barcode: `data:image/png;base64,${barcode}`, qr: `data:image/png;base64,${qr}` });
                    }
                    const capacity = input.layout.columns * input.layout.rows;
                    if (index && index % capacity === 0) doc.addPage();
                    const position = index % capacity;
                    const x = input.layout.marginLeftMm + position % input.layout.columns * metrics.labelWidthMm;
                    const y = input.layout.marginTopMm + Math.floor(position / input.layout.columns) * metrics.labelHeightMm;
                    doc.image(Buffer.from(rendered.split(',')[1], 'base64'), mm(x), mm(y), { width: mm(metrics.labelWidthMm), height: mm(metrics.labelHeightMm) });
                    if (JSON.parse(input.draft.design).cutMarks) for (const cx of [x, x + metrics.labelWidthMm]) for (const cy of [y, y + metrics.labelHeightMm]) { doc.lineWidth(0.4).moveTo(mm(cx - 1.5), mm(cy)).lineTo(mm(cx + 1.5), mm(cy)).stroke(); doc.moveTo(mm(cx), mm(cy - 1.5)).lineTo(mm(cx), mm(cy + 1.5)).stroke(); }
                    index++;
                    await new Promise<void>(resolve => setImmediate(resolve));
                }
            }
            doc.end(); await finished(output);
            await this.labelCodes.complete(ctx, input.batchCode);
            return { name, labels: index, pages: Math.ceil(index / (input.layout.columns * input.layout.rows)), labelWidthMm: metrics.labelWidthMm, labelHeightMm: metrics.labelHeightMm };
        } catch (error) { doc.destroy(); output.destroy(); await unlink(target).catch(() => {}); throw error; }
    }
}
