import { Channel, DeepPartial, ProductVariant, VendureEntity } from '@vendure/core';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('label_code')
@Unique('label_code_public_unique', ['code'])
@Unique('label_code_batch_pair_unique', ['batchId', 'pairIndex'])
@Check('label_code_pairIndex_check', '"pairIndex" >= 0')
@Check('label_code_format', "code ~ '^SBX1:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'")
export class LabelCode extends VendureEntity {
    constructor(input?: DeepPartial<LabelCode>) { super(input); }
    @Column({ length: 42 }) code: string;
    @Column({ type: 'uuid' }) batchId: string;
    @Column() pairIndex: number;
    @Column({ default: false }) ready: boolean;
    @Index('label_code_variant_idx')
    @Column() productVariantId: number;
    @Column() channelId: number;
    @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productVariantId', foreignKeyConstraintName: 'label_code_variant_fkey' }) variant: ProductVariant;
    @ManyToOne(() => Channel, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'channelId', foreignKeyConstraintName: 'label_code_channel_fkey' }) channel: Channel;
}
