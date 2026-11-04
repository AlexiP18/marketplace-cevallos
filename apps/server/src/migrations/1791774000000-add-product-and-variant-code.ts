import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductAndVariantCode1791774000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN "customFieldsCodigo" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD COLUMN "customFieldsCodigo" varchar(255)`);

    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsCodigo"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsCodigo"`);
    }
}
