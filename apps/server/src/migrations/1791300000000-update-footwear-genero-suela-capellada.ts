import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateFootwearGeneroSuelaCapellada1791300000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        // 1. Agregar columna para Género (Hombre, Mujer, Unisex)
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "customFieldsGenero" character varying(255)`, undefined);

        // 2. Modificar suela y capellada a tipo text para admitir listas de valores
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "customFieldsSuela" TYPE text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "customFieldsCapellada" TYPE text`, undefined);

        // 3. Convertir valores individuales previos de suela en formato JSON array para list: true
        await queryRunner.query(`
            UPDATE "product"
            SET "customFieldsSuela" = json_build_array("customFieldsSuela")::text
            WHERE "customFieldsSuela" IS NOT NULL AND "customFieldsSuela" NOT LIKE '[%'
        `, undefined);

        // 4. Convertir valores individuales previos de capellada en formato JSON array para list: true
        await queryRunner.query(`
            UPDATE "product"
            SET "customFieldsCapellada" = json_build_array("customFieldsCapellada")::text
            WHERE "customFieldsCapellada" IS NOT NULL AND "customFieldsCapellada" NOT LIKE '[%'
        `, undefined);

        // 5. Poblar customFieldsGenero para productos existentes según su tipo
        await queryRunner.query(`
            UPDATE "product"
            SET "customFieldsGenero" = CASE
                WHEN "customFieldsTipo" = 'Hombre' THEN 'Hombre'
                WHEN "customFieldsTipo" = 'Mujer' THEN 'Mujer'
                WHEN "customFieldsTipo" IN ('Nino', 'Infantil') THEN 'Unisex'
                ELSE 'Unisex'
            END
            WHERE "customFieldsGenero" IS NULL AND "customFieldsTipo" IS NOT NULL
        `, undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "customFieldsGenero"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "customFieldsSuela" TYPE character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "customFieldsCapellada" TYPE character varying(255)`, undefined);
    }

}
