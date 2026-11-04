import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabelIdentitiesAndUniqueSku1791776400000 implements MigrationInterface {
    async up(runner: QueryRunner) {
        const invalid = await runner.query(`SELECT 1 FROM product_variant WHERE sku !~ '^[A-Z0-9][A-Z0-9._-]{0,159}$' UNION ALL SELECT 1 FROM product_variant GROUP BY sku HAVING COUNT(*) > 1 LIMIT 1`);
        if (invalid.length) throw new Error('Corrige los SKU vacíos, inválidos o duplicados antes de aplicar esta migración. No se modificaron los códigos existentes.');
        await runner.query('CREATE UNIQUE INDEX product_variant_sku_unique ON product_variant (sku)');
        await runner.query(`ALTER TABLE product_variant ADD CONSTRAINT product_variant_sku_format CHECK (sku ~ '^[A-Z0-9][A-Z0-9._-]{0,159}$')`);
        await runner.query(`CREATE FUNCTION protect_product_variant_sku() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.sku IS DISTINCT FROM OLD.sku THEN RAISE EXCEPTION 'El SKU es inmutable' USING ERRCODE = '23514'; END IF;
            RETURN NEW; END $$`);
        await runner.query('CREATE TRIGGER product_variant_sku_immutable BEFORE UPDATE OF sku ON product_variant FOR EACH ROW EXECUTE FUNCTION protect_product_variant_sku()');
        await runner.query(`CREATE TABLE label_code (
            id SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
            code varchar(42) NOT NULL, "batchId" uuid NOT NULL, "pairIndex" integer NOT NULL CHECK ("pairIndex" >= 0), ready boolean NOT NULL DEFAULT false,
            "productVariantId" integer NOT NULL, "channelId" integer NOT NULL,
            CONSTRAINT label_code_variant_fkey FOREIGN KEY ("productVariantId") REFERENCES product_variant(id) ON DELETE RESTRICT,
            CONSTRAINT label_code_channel_fkey FOREIGN KEY ("channelId") REFERENCES channel(id) ON DELETE RESTRICT,
            CONSTRAINT label_code_public_unique UNIQUE (code), CONSTRAINT label_code_batch_pair_unique UNIQUE ("batchId", "pairIndex"),
            CONSTRAINT label_code_format CHECK (code ~ '^SBX1:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
        )`);
        await runner.query('CREATE INDEX label_code_variant_idx ON label_code ("productVariantId")');
        await runner.query('ALTER TABLE warehouse_pick_scan ADD COLUMN "labelCodeId" integer REFERENCES label_code(id) ON DELETE RESTRICT');
        await runner.query('CREATE UNIQUE INDEX warehouse_pick_scan_label_unique ON warehouse_pick_scan ("labelCodeId") WHERE "labelCodeId" IS NOT NULL');
    }
    async down(runner: QueryRunner) {
        await runner.query('ALTER TABLE warehouse_pick_scan DROP COLUMN "labelCodeId"');
        await runner.query('DROP TABLE label_code');
        await runner.query('DROP TRIGGER product_variant_sku_immutable ON product_variant');
        await runner.query('DROP FUNCTION protect_product_variant_sku()');
        await runner.query('ALTER TABLE product_variant DROP CONSTRAINT product_variant_sku_format');
        await runner.query('DROP INDEX product_variant_sku_unique');
    }
}
