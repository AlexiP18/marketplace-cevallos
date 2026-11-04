import { MigrationInterface, QueryRunner } from 'typeorm';

export class FootwearCatalogIndex1791776600000 implements MigrationInterface {
    async up(runner: QueryRunner) {
        await runner.query(`ALTER TABLE product ADD COLUMN IF NOT EXISTS "customFieldsHorma" varchar(255)`);
        await runner.query(`CREATE TABLE footwear_catalog_attribute (
            "variantId" integer PRIMARY KEY REFERENCES product_variant(id) ON DELETE CASCADE,
            attributes jsonb NOT NULL DEFAULT '{}'
        )`);
        await runner.query(`CREATE INDEX footwear_catalog_attributes_gin ON footwear_catalog_attribute USING gin(attributes jsonb_path_ops)`);
        await runner.query(`CREATE FUNCTION footwear_normalize(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
            SELECT lower(btrim(translate(normalize(coalesce(value,''),NFC), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')))
        $$`);
        await runner.query(`CREATE FUNCTION footwear_attributes_for(variant_id integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
            WITH chosen AS (
                SELECT g.code AS kind, coalesce(t.name,o.code) AS name, o."customFieldsColores" AS colours
                FROM product_variant_options_product_option link
                JOIN product_option o ON o.id=link."productOptionId"
                JOIN product_option_group g ON g.id=o."groupId"
                LEFT JOIN product_option_translation t ON t."baseId"=o.id
                WHERE link."productVariantId"=variant_id AND o."deletedAt" IS NULL AND g."deletedAt" IS NULL
            ), attribute_values AS (
                SELECT 'talla' AS key, footwear_normalize(regexp_replace(name,'^(size|talla)[ -]*','','i')) AS value FROM chosen WHERE kind ~ '^(calzado-talla($|-)|talla$|size$|shoe-size$)'
                UNION SELECT 'capellada', footwear_normalize(name) FROM chosen WHERE kind ~ '^(calzado-capellada($|-)|capellada$)'
                UNION SELECT 'suela', footwear_normalize(name) FROM chosen WHERE kind ~ '^(calzado-suela($|-)|suela$)'
                UNION SELECT 'color', footwear_normalize(name) FROM chosen WHERE kind ~ '^(calzado-color($|-)|color$|colour$)'
                UNION SELECT 'color', footwear_normalize(c->>'nombre') FROM chosen, jsonb_array_elements(CASE WHEN jsonb_typeof(colours)='array' THEN colours ELSE '[]' END) c WHERE kind ~ '^(calzado-color($|-)|color$|colour$)'
                UNION SELECT 'color', footwear_normalize(c->>'codigo') FROM chosen, jsonb_array_elements(CASE WHEN jsonb_typeof(colours)='array' THEN colours ELSE '[]' END) c WHERE kind ~ '^(calzado-color($|-)|color$|colour$)'
                UNION SELECT 'color', footwear_normalize(c->>'nombre') FROM product_variant v, jsonb_array_elements(CASE WHEN jsonb_typeof(v."customFieldsColores")='array' THEN v."customFieldsColores" ELSE '[]' END) c WHERE v.id=variant_id
                UNION SELECT 'color', footwear_normalize(c->>'codigo') FROM product_variant v, jsonb_array_elements(CASE WHEN jsonb_typeof(v."customFieldsColores")='array' THEN v."customFieldsColores" ELSE '[]' END) c WHERE v.id=variant_id
                UNION SELECT 'horma', footwear_normalize(p."customFieldsHorma") FROM product_variant v JOIN product p ON p.id=v."productId" WHERE v.id=variant_id
                UNION SELECT 'capellada', footwear_normalize(p."customFieldsCapellada"::jsonb->>0) FROM product_variant v JOIN product p ON p.id=v."productId" WHERE v.id=variant_id AND jsonb_array_length(coalesce(nullif(p."customFieldsCapellada",''),'[]')::jsonb)=1 AND NOT EXISTS(SELECT 1 FROM chosen WHERE kind ~ '^(calzado-capellada($|-)|capellada$)')
                UNION SELECT 'suela', footwear_normalize(p."customFieldsSuela"::jsonb->>0) FROM product_variant v JOIN product p ON p.id=v."productId" WHERE v.id=variant_id AND jsonb_array_length(coalesce(nullif(p."customFieldsSuela",''),'[]')::jsonb)=1 AND NOT EXISTS(SELECT 1 FROM chosen WHERE kind ~ '^(calzado-suela($|-)|suela$)')
            ), grouped AS (SELECT key,jsonb_agg(DISTINCT value) AS items FROM attribute_values WHERE value<>'' GROUP BY key)
            SELECT coalesce(jsonb_object_agg(key,items),'{}') FROM grouped
        $$`);
        await runner.query(`CREATE FUNCTION refresh_footwear_variant(variant_id integer) RETURNS void LANGUAGE sql AS $$
            INSERT INTO footwear_catalog_attribute("variantId",attributes)
            SELECT id,footwear_attributes_for(id) FROM product_variant WHERE id=variant_id
            ON CONFLICT("variantId") DO UPDATE SET attributes=excluded.attributes
        $$`);
        await runner.query(`CREATE FUNCTION footwear_variant_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            PERFORM refresh_footwear_variant(NEW.id); RETURN NEW;
        END $$`);
        await runner.query(`CREATE TRIGGER footwear_variant_attributes AFTER INSERT OR UPDATE OF "customFieldsColores","productId" ON product_variant FOR EACH ROW EXECUTE FUNCTION footwear_variant_changed()`);
        await runner.query(`CREATE FUNCTION footwear_link_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF TG_OP<>'DELETE' THEN PERFORM refresh_footwear_variant(NEW."productVariantId"); END IF;
            IF TG_OP<>'INSERT' THEN PERFORM refresh_footwear_variant(OLD."productVariantId"); END IF;
            RETURN NULL;
        END $$`);
        await runner.query(`CREATE TRIGGER footwear_variant_options AFTER INSERT OR UPDATE OR DELETE ON product_variant_options_product_option FOR EACH ROW EXECUTE FUNCTION footwear_link_changed()`);
        await runner.query(`CREATE FUNCTION footwear_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE source_id integer; item record;
            BEGIN
                IF TG_TABLE_NAME='product_option_translation' THEN source_id=CASE WHEN TG_OP='DELETE' THEN OLD."baseId" ELSE NEW."baseId" END;
                ELSE source_id=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END; END IF;
                FOR item IN SELECT DISTINCT v.id FROM product_variant v
                    LEFT JOIN product_variant_options_product_option link ON link."productVariantId"=v.id
                    LEFT JOIN product_option o ON o.id=link."productOptionId"
                    WHERE (TG_TABLE_NAME='product' AND v."productId"=source_id)
                       OR (TG_TABLE_NAME IN ('product_option','product_option_translation') AND o.id=source_id)
                       OR (TG_TABLE_NAME='product_option_group' AND o."groupId"=source_id)
                LOOP PERFORM refresh_footwear_variant(item.id); END LOOP;
                RETURN NULL;
            END $$`);
        await runner.query(`CREATE TRIGGER footwear_product_attributes AFTER UPDATE OF "customFieldsHorma","customFieldsCapellada","customFieldsSuela" ON product FOR EACH ROW EXECUTE FUNCTION footwear_source_changed()`);
        await runner.query(`CREATE TRIGGER footwear_option_attributes AFTER UPDATE OF code,"groupId","customFieldsColores","deletedAt" ON product_option FOR EACH ROW EXECUTE FUNCTION footwear_source_changed()`);
        await runner.query(`CREATE TRIGGER footwear_group_attributes AFTER UPDATE OF code,"deletedAt" ON product_option_group FOR EACH ROW EXECUTE FUNCTION footwear_source_changed()`);
        await runner.query(`CREATE TRIGGER footwear_option_names AFTER INSERT OR UPDATE OR DELETE ON product_option_translation FOR EACH ROW EXECUTE FUNCTION footwear_source_changed()`);
        await runner.query(`INSERT INTO footwear_catalog_attribute SELECT id,footwear_attributes_for(id) FROM product_variant`);
        await runner.query(`ANALYZE footwear_catalog_attribute`);
    }
    async down(runner: QueryRunner) {
        for (const [table, trigger] of [['product','footwear_product_attributes'],['product_variant','footwear_variant_attributes'],['product_variant_options_product_option','footwear_variant_options'],['product_option','footwear_option_attributes'],['product_option_group','footwear_group_attributes'],['product_option_translation','footwear_option_names']]) await runner.query(`DROP TRIGGER ${trigger} ON ${table}`);
        for (const fn of ['footwear_source_changed()','footwear_link_changed()','footwear_variant_changed()','refresh_footwear_variant(integer)','footwear_attributes_for(integer)','footwear_normalize(text)']) await runner.query(`DROP FUNCTION ${fn}`);
        await runner.query(`DROP TABLE footwear_catalog_attribute`);
        await runner.query(`ALTER TABLE product DROP COLUMN "customFieldsHorma"`);
    }
}
