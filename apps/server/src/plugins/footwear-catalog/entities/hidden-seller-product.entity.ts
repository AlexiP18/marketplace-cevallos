import { Channel, DeepPartial, Product, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('marketplace_hidden_product')
@Unique('marketplace_hidden_product_unique', ['productId'])
export class MarketplaceHiddenProduct extends VendureEntity {
    constructor(input?: DeepPartial<MarketplaceHiddenProduct>) { super(input); }
    @Column() productId: number;
    @Column() channelId: number;
    @ManyToOne(() => Product, { nullable: false })
    @JoinColumn({ name: 'productId', foreignKeyConstraintName: 'marketplace_hidden_product_productId_fkey' }) product: Product;
    @ManyToOne(() => Channel, { nullable: false })
    @JoinColumn({ name: 'channelId', foreignKeyConstraintName: 'marketplace_hidden_product_channelId_fkey' }) channel: Channel;
}
