import 'dotenv/config';
import { Client } from 'pg';

async function syncVariantAssets() {
    console.log('🔄 Iniciando sincronización de imágenes en variantes de producto...');
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 6543,
        user: process.env.DB_USERNAME || 'vendure',
        password: process.env.DB_PASSWORD || 'vendure',
        database: process.env.DB_NAME || 'vendure',
    });

    await client.connect();

    try {
        // 1. Obtener todos los productos que tienen un featuredAssetId
        const productsRes = await client.query(`
            SELECT p.id as product_id, pt.name as product_name, p."featuredAssetId" as asset_id, at.name as asset_name
            FROM product p
            JOIN product_translation pt ON p.id = pt."baseId"
            JOIN asset_translation at ON p."featuredAssetId" = at."baseId"
            WHERE p."featuredAssetId" IS NOT NULL
            ORDER BY p.id;
        `);

        console.log(`Se encontraron ${productsRes.rows.length} productos con imagen asignada.`);

        let updatedVariantsCount = 0;
        let insertedAssetsCount = 0;

        for (const prod of productsRes.rows) {
            const { product_id, product_name, asset_id, asset_name } = prod;

            // Actualizar featuredAssetId en todas las variantes del producto
            const updateRes = await client.query(`
                UPDATE product_variant
                SET "featuredAssetId" = $1, "updatedAt" = NOW()
                WHERE "productId" = $2 AND ("featuredAssetId" IS NULL OR "featuredAssetId" != $1)
                RETURNING id;
            `, [asset_id, product_id]);

            if (updateRes.rowCount && updateRes.rowCount > 0) {
                updatedVariantsCount += updateRes.rowCount;
                console.log(`  ✅ Producto "${product_name}" (ID ${product_id}): actualizadas ${updateRes.rowCount} variantes con asset "${asset_name}" (ID ${asset_id})`);
            }

            // Sincronizar en la tabla intermedia product_variant_asset
            const variantsRes = await client.query(`
                SELECT id FROM product_variant WHERE "productId" = $1;
            `, [product_id]);

            for (const v of variantsRes.rows) {
                const insertRes = await client.query(`
                    INSERT INTO product_variant_asset ("productVariantId", "assetId", position)
                    VALUES ($1, $2, 0)
                    ON CONFLICT DO NOTHING;
                `, [v.id, asset_id]);
                if (insertRes.rowCount && insertRes.rowCount > 0) {
                    insertedAssetsCount += insertRes.rowCount;
                }
            }
        }

        console.log(`\n🎉 Sincronización completada con éxito:`);
        console.log(`   - Variantes actualizadas con featuredAssetId: ${updatedVariantsCount}`);
        console.log(`   - Registros añadidos en product_variant_asset: ${insertedAssetsCount}`);

    } finally {
        await client.end();
    }
}

syncVariantAssets().catch((err) => {
    console.error('Error sincronizando imágenes de variantes:', err);
    process.exit(1);
});
