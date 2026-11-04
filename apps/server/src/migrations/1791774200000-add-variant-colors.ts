import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantColors1791774200000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant" ADD COLUMN "customFieldsColores" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsColores"`);
    }
}
