import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, Product, ProductEvent, ProductService, ProductChannelEvent, ProductVariantChannelEvent, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { SellerProfile } from '../../multivendor/entities/seller-profile.entity';
import { SellerProfileStatusChangedEvent } from '../../multivendor/events/seller-profile-status-changed.event';
import { MarketplaceHiddenProduct } from '../entities/hidden-seller-product.entity';

@Injectable()
export class CatalogPublicationService implements OnApplicationBootstrap {
    constructor(private connection: TransactionalConnection, private products: ProductService, private events: EventBus) {}
    async onApplicationBootstrap() {
        this.events.registerBlockingEventHandler({ event: SellerProfileStatusChangedEvent, id: 'catalog-seller-status-publication', handler: event => this.apply(event.ctx, event.profile) });
        this.events.registerBlockingEventHandler({ event: ProductVariantChannelEvent, id: 'marketplace-single-variant-owner', handler: async event => {
            if (event.type === 'removed') {
                const rows = await this.connection.getRepository(event.ctx, Product).query(`SELECT 1 FROM stock_level s
                    JOIN stock_location_channels_channel c ON c."stockLocationId" = s."stockLocationId"
                    WHERE s."productVariantId" = $1 AND c."channelId" = $2 AND (s."stockOnHand" <> 0 OR s."stockAllocated" <> 0) LIMIT 1`, [event.productVariant.id, event.channelId]);
                if (rows.length) throw new UserInputError('No puedes retirar una variante que aún tiene existencias o reservas en este almacén.');
                return;
            }
            const owners = await this.connection.getRepository(event.ctx, SellerProfile).createQueryBuilder('seller')
                .innerJoin('product_variant_channels_channel', 'vc', 'vc."channelId" = seller."channelId" AND vc."productVariantId" = :id', { id: event.productVariant.id }).getCount();
            if (owners > 1) throw new UserInputError('Una variante no puede compartir existencias entre almacenes.');
        } });
        this.events.registerBlockingEventHandler({ event: ProductChannelEvent, id: 'marketplace-single-product-owner', handler: async event => {
            if (event.type !== 'assigned') return;
            const owners = await this.connection.getRepository(event.ctx, SellerProfile).createQueryBuilder('seller')
                .innerJoin('product_channels_channel', 'pc', 'pc."channelId" = seller."channelId" AND pc."productId" = :id', { id: event.product.id }).getMany();
            if (owners.length > 1) throw new UserInputError('El producto debe pertenecer a un único almacén.');
            if (owners[0] && owners[0].status !== 'ACTIVE') await this.apply(event.ctx, owners[0]);
        } });
        this.events.registerBlockingEventHandler({ event: ProductEvent, id: 'marketplace-active-seller-publication', handler: async event => {
            if ((event.ctx as any).marketplacePublication || event.type === 'deleted') return;
            const owners = await this.connection.getRepository(event.ctx, SellerProfile).createQueryBuilder('seller')
                .innerJoin('product_channels_channel', 'pc', 'pc."channelId" = seller."channelId" AND pc."productId" = :id', { id: event.entity.id }).getMany();
            if (owners.length > 1) throw new Error('El producto debe pertenecer a un único almacén.');
            if (owners[0] && owners[0].status !== 'ACTIVE') await this.apply(event.ctx, owners[0]);
        } });
        for (const profile of await this.connection.rawConnection.getRepository(SellerProfile).find({ relations: ['channel'] })) {
            const ctx = new RequestContext({ apiType: 'admin', channel: profile.channel, languageCode: profile.channel.defaultLanguageCode, isAuthorized: true, authorizedAsOwnerOnly: false });
            await this.apply(ctx, profile);
        }
    }
    async apply(ctx: RequestContext, profile: SellerProfile) {
        const tx = ctx.copy(); (tx as any).marketplacePublication = true;
        const hidden = this.connection.getRepository(tx, MarketplaceHiddenProduct);
        if (profile.status === 'ACTIVE') {
            for (const row of await hidden.find({ where: { channelId: Number(profile.channel.id) } })) {
                const product = await this.connection.getRepository(tx, Product).findOneBy({ id: row.productId });
                if (product && !product.deletedAt) await this.products.update(tx, { id: product.id, enabled: true });
                await hidden.remove(row);
            }
        } else {
            const products = await this.connection.getRepository(tx, Product).createQueryBuilder('p').innerJoin('p.channels', 'c', 'c.id = :id', { id: profile.channel.id }).where('p.enabled = true').getMany();
            for (const product of products) {
                await hidden.upsert({ productId: Number(product.id), channelId: Number(profile.channel.id) }, ['productId']);
                await this.products.update(tx, { id: product.id, enabled: false });
            }
        }
    }
}
