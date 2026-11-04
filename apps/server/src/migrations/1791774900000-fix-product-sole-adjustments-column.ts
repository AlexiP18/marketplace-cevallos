import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProductSoleAdjustmentsColumn1791774900000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'product'
                      AND column_name = 'customFieldsAjustessuella'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'product'
                      AND column_name = 'customFieldsAjustessuela'
                ) THEN
                    ALTER TABLE "product" RENAME COLUMN "customFieldsAjustessuella" TO "customFieldsAjustessuela";
                END IF;
            END $$;
        `);
    }

    async down(): Promise<void> {}
}
