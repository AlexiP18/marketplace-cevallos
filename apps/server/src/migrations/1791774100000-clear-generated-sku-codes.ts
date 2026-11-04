import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClearGeneratedSkuCodes1791774100000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "product_variant"
            SET "customFieldsCodigo" = NULL
            WHERE "customFieldsCodigo" = regexp_replace("sku", '-[^-]+$', '')
        `);

        await queryRunner.query(`
            UPDATE "product" AS p
            SET "customFieldsCodigo" = NULL
            WHERE "customFieldsCodigo" = 'PRD-' || p."id"::text
               OR EXISTS (
                    SELECT 1
                    FROM "product_variant" AS pv
                    WHERE pv."productId" = p."id"
                      AND p."customFieldsCodigo" = regexp_replace(pv."sku", '-[^-]+-[^-]+$', '')
               )
        `);
    }

    async down(): Promise<void> {}
}
