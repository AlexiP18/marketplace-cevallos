import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantBarcode1791774500000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant" ADD COLUMN IF NOT EXISTS "customFieldsCodigobarras" varchar(255)`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN IF EXISTS "customFieldsCodigobarras"`);
    }
}
