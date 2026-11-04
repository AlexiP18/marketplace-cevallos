import { Administrator, Asset, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('administrator_personal_profile')
export class AdministratorPersonalProfile extends VendureEntity {
    constructor(input?: DeepPartial<AdministratorPersonalProfile>) { super(input); }

    @OneToOne(() => Administrator, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn()
    administrator: Administrator;

    @ManyToOne(() => Asset, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    photo: Asset | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    phone: string | null;
}
