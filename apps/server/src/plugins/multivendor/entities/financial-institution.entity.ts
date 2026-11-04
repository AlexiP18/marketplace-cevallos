import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

@Entity('financial_institution')
export class FinancialInstitution extends VendureEntity {
    constructor(input?: DeepPartial<FinancialInstitution>) { super(input); }

    @Column({ length: 255 }) name: string;
    @Column({ length: 30 }) kind: string;
    @Column({ type: 'varchar', length: 13, nullable: true }) ruc: string | null;
    @Column({ default: true }) active: boolean;
}
