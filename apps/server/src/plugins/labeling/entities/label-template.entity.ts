import { Channel, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('label_template')
export class LabelTemplate extends VendureEntity {
    constructor(input?: DeepPartial<LabelTemplate>) {
        super(input);
    }

    @Column({ length: 100 })
    name: string;

    @Column('float')
    widthMm: number;

    @Column('float')
    heightMm: number;

    @Column('text')
    design: string;

    @ManyToOne(() => Channel, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn()
    channel: Channel;
}
