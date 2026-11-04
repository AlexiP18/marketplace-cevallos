import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOptionColors1791774300000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_option" ADD COLUMN "customFieldsColores" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_option" DROP COLUMN "customFieldsColores"`);
    }
}
