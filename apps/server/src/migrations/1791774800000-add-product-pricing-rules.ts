import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductPricingRules1791774800000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "customFieldsPreciosrangotalla" jsonb`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "customFieldsAjustessuela" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsAjustessuela"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsPreciosrangotalla"`);
    }
}
