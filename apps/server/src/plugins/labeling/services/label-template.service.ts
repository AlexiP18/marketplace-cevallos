import { Injectable } from '@nestjs/common';
import { ID, Permission, ProductService, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { SellerProfile } from '../../multivendor/entities/seller-profile.entity';
import { LabelTemplate } from '../entities/label-template.entity';

export interface SaveLabelTemplateInput {
    id?: ID;
    name: string;
    widthMm: number;
    heightMm: number;
    design: string;
}

@Injectable()
export class LabelTemplateService {
    constructor(private connection: TransactionalConnection, private products: ProductService) {}

    async businessLogo(ctx: RequestContext, productId: ID, sellerProfileId?: ID) {
        const product = await this.products.findOne(ctx, productId, ['channels']);
        if (!product) throw new UserInputError('No se encontró el producto en el canal activo.');
        const channelIds = product.channels.map(channel => channel.id);
        const repo = this.connection.getRepository(ctx, SellerProfile);
        const profiles = channelIds.length ? await repo.find({
            where: { channel: { id: In(channelIds) } }, relations: ['channel', 'logo'],
        }) : [];
        const superadmin = ctx.userHasAllPermissions([Permission.SuperAdmin]);
        let profile = profiles.find(candidate => String(candidate.channel.id) === String(ctx.channelId));
        let candidates: SellerProfile[] = [];
        if (!profile && superadmin) {
            if (profiles.length === 1) {
                profile = profiles[0];
                if (sellerProfileId != null && String(profile.id) !== String(sellerProfileId)) throw new UserInputError('Selecciona un negocio disponible para este producto.');
            } else {
                candidates = profiles.length ? profiles : await repo.find({ relations: ['channel', 'logo'], order: { businessName: 'ASC' } });
            }
            if (!profile && sellerProfileId != null) {
                profile = candidates.find(candidate => String(candidate.id) === String(sellerProfileId));
                if (!profile) throw new UserInputError('Selecciona un negocio disponible para este producto.');
            }
        } else if (sellerProfileId != null && (!profile || String(profile.id) !== String(sellerProfileId))) {
            throw new UserInputError('Selecciona un negocio disponible para este producto.');
        }
        const choices = candidates.map(candidate => ({ id: candidate.id, name: candidate.businessName, hasLogo: Boolean(candidate.logo) }));
        if (!profile) return { status: profiles.length > 1 && superadmin ? 'AMBIGUOUS' : 'NO_SELLER', logo: null, candidates: choices };
        return { status: profile.logo ? 'AVAILABLE' : 'MISSING', logo: profile.logo ?? null, candidates: choices };
    }


    findAll(ctx: RequestContext) {
        return this.connection.getRepository(ctx, LabelTemplate).find({
            where: { channel: { id: ctx.channelId } },
            order: { updatedAt: 'DESC' },
        });
    }

    findOne(ctx: RequestContext, id: ID) {
        return this.connection.getRepository(ctx, LabelTemplate).findOne({
            where: { id, channel: { id: ctx.channelId } },
        });
    }

    async save(ctx: RequestContext, input: SaveLabelTemplateInput) {
        const name = input.name.trim();
        if (!name || name.length > 100) throw new UserInputError('El nombre debe tener entre 1 y 100 caracteres.');
        if (![input.widthMm, input.heightMm].every(Number.isFinite) || input.widthMm < 20 || input.heightMm < 15 || input.widthMm > 200 || input.heightMm > 287) {
            throw new UserInputError('La etiqueta debe medir entre 20 × 15 mm y 200 × 287 mm para caber en una hoja A4.');
        }
        if (input.design.length > 1_000_000) throw new UserInputError('El diseño supera el tamaño máximo permitido.');
        let design: { objects?: unknown };
        try { design = JSON.parse(input.design); } catch { throw new UserInputError('El diseño no contiene JSON válido.'); }
        if (!Array.isArray(design?.objects) || design.objects.length > 100) {
            throw new UserInputError('El diseño debe contener un máximo de 100 elementos.');
        }

        const repository = this.connection.getRepository(ctx, LabelTemplate);
        const template = input.id ? await this.findOne(ctx, input.id) : new LabelTemplate({ channel: ctx.channel });
        if (!template) throw new UserInputError('No se encontró la plantilla en este canal.');
        template.name = name;
        template.widthMm = input.widthMm;
        template.heightMm = input.heightMm;
        template.design = input.design;
        return repository.save(template);
    }

    async delete(ctx: RequestContext, id: ID) {
        const template = await this.findOne(ctx, id);
        if (!template) return { result: 'NOT_DELETED', message: 'No se encontró la plantilla en este canal.' };
        await this.connection.getRepository(ctx, LabelTemplate).remove(template);
        return { result: 'DELETED' };
    }
}
