import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixVariantBarcodeColumn1791774600000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'product_variant'
                      AND column_name = 'customFieldsCodigoBarras'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'product_variant'
                      AND column_name = 'customFieldsCodigobarras'
                ) THEN
                    ALTER TABLE "product_variant" RENAME COLUMN "customFieldsCodigoBarras" TO "customFieldsCodigobarras";
                END IF;
            END $$;
        `);
    }

    async down(): Promise<void> {}
}
