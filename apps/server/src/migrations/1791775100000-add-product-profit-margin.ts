import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductProfitMargin1791775100000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "customFieldsMargenganancia" integer`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsMargenganancia"`);
    }
}
