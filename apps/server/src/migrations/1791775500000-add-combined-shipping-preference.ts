import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCombinedShippingPreference1791775500000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "seller_profile" ADD "allowsCombinedShipping" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "seller_profile" DROP COLUMN "allowsCombinedShipping"`);
    }
}
