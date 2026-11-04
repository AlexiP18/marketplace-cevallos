import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProductColorCombinationsColumn1791774700000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'product'
                      AND column_name = 'customFieldsCombinacionesColores'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'product'
                      AND column_name = 'customFieldsCombinacionescolores'
                ) THEN
                    ALTER TABLE "product" RENAME COLUMN "customFieldsCombinacionesColores" TO "customFieldsCombinacionescolores";
                END IF;
            END $$;
        `);
    }

    async down(): Promise<void> {}
}
