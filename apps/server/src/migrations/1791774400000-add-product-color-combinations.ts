import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductColorCombinations1791774400000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "customFieldsCombinacionescolores" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsCombinacionescolores"`);
    }
}
