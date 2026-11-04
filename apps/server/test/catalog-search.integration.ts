import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {bootstrapWorker, runMigrations, ChannelService, ProductService, ProductVariantService, ProductOptionGroupService, ProductOptionService, RequestContextService, TransactionalConnection, User, Injector} from '@vendure/core';
import {config} from '../src/vendure-config';
import {LogicalOperator} from '@vendure/common/lib/generated-types';
import {CatalogAttribute, normalizedFootwearFilters} from '../src/plugins/footwear-catalog/services/catalog-attribute';
import {ModuleRef} from '@nestjs/core';

async function main() {
    assert.match(process.env.MARKETPLACE_TEST_DB || '', /^vendure_mq_test_\d+$/);
    assert.ok(process.env.REDIS_PREFIX?.startsWith('mq-test-'));
    (config.dbConnectionOptions as any).database = process.env.MARKETPLACE_TEST_DB;
    await runMigrations(config);
    const worker = await bootstrapWorker(config); await worker.startJobQueue();
    const app = worker.app;
    try {
        const connection = app.get(TransactionalConnection), channels = app.get(ChannelService);
        const user = await connection.rawConnection.getRepository(User).findOneOrFail({where: {identifier: process.env.SUPERADMIN_USERNAME}, relations: ['roles.channels']});
        const ctx = await app.get(RequestContextService).create({apiType: 'shop', channelOrToken: await channels.getDefaultChannel(), user});
        const sellers = await connection.rawConnection.query('SELECT "channelId" AS id FROM seller_profile WHERE status=\'ACTIVE\' ORDER BY id LIMIT 2');
        assert.equal(sellers.length, 2);
        const sellerCtx = ctx.copy(); (sellerCtx as any)._channel = await channels.findOne(ctx, sellers[0].id);
        const otherCtx = ctx.copy(); (otherCtx as any)._channel = await channels.findOne(ctx, sellers[1].id);
        const stamp = Date.now();
        const product = await app.get(ProductService).create(sellerCtx, {translations: [{languageCode: ctx.languageCode, name: 'Calzado índice', slug: `catalog-${stamp}`, description: 'Calzado artesanal'}], customFields: {horma: 'AnatómiCa', capellada: ['Cuero'], suela: ['TR']}});
        const groups = app.get(ProductOptionGroupService), options = app.get(ProductOptionService);
        const size = await groups.create(sellerCtx, {code: `calzado-talla-${stamp}`, translations: [{languageCode: ctx.languageCode, name: 'Talla'}]});
        const cut = await groups.create(sellerCtx, {code: `calzado-capellada-${stamp}`, translations: [{languageCode: ctx.languageCode, name: 'Capellada'}]});
        for (const group of [size, cut]) await app.get(ProductService).addOptionGroupToProduct(sellerCtx, product.id, group.id);
        async function option(group: any, name: string) { return options.create(sellerCtx, group, {code: name.toLowerCase(), translations: [{languageCode: ctx.languageCode, name}]}); }
        const s38 = await option(size, '38'), s39 = await option(size, '39'), leather = await option(cut, 'Cuero'), synthetic = await option(cut, 'Sintético');
        const variants = await app.get(ProductVariantService).create(sellerCtx, [
            {productId: product.id, sku: '', price: 1000, optionIds: [s38.id, leather.id], translations: [{languageCode: ctx.languageCode, name: '38 Cuero'}], customFields: {colores: [{nombre: 'Rojo', codigo: '#FF0000'}]}},
            {productId: product.id, sku: '', price: 2000, optionIds: [s39.id, synthetic.id], translations: [{languageCode: ctx.languageCode, name: '39 Sintético'}], customFields: {colores: [{nombre: 'Azul', codigo: '#0000FF'}]}},
        ]);
        const sql = connection.rawConnection.query.bind(connection.rawConnection);
        const catalog = app.get(CatalogAttribute);
        // Worker boot also initializes the configured strategy; initialize explicitly if no Shop resolver was created.
        await catalog.init(new Injector(app.get(ModuleRef)));
        const [template] = await sql('SELECT to_jsonb(si) AS row FROM search_index_item si LIMIT 1');
        assert.ok(template);
        async function index(ids: number[]) {
            await sql(`INSERT INTO search_index_item SELECT projected.* FROM product_variant v
                CROSS JOIN LATERAL jsonb_populate_record(NULL::search_index_item,$1::jsonb || jsonb_build_object(
                'productVariantId',v.id,'productId',v."productId",'sku',v.sku,'productName','Calzado índice','productVariantName','Variante','enabled',true,
                'languageCode',$3::text,'channelId',$4::integer,'channelIds',$4::text,'price',1000,'priceWithTax',1000,
                'description','Calzado artesanal','facetIds','','facetValueIds','','collectionIds','','collectionSlugs','')) projected
                WHERE v.id=ANY($2::int[]) ON CONFLICT DO NOTHING`, [template.row, ids, ctx.languageCode, ctx.channelId]);
        }
        await index(variants.map(v => Number(v.id)));
        const filter = {talla: '38', color: 'ROJO', capellada: 'Cuero', suela: 'TR', horma: 'Anatómica'};
        const attributes = (await sql('SELECT attributes FROM footwear_catalog_attribute WHERE "variantId"=$1', [variants[0].id]))[0].attributes;
        for (const [key, value] of Object.entries(normalizedFootwearFilters(filter))) assert.ok(value.every(item => attributes[key]?.includes(item)), `Proyección ${key}: ${JSON.stringify(attributes)}`);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 1, JSON.stringify(await sql('SELECT p.enabled AS product,v.enabled AS variant,si.* FROM product_variant v JOIN product p ON p.id=v."productId" LEFT JOIN search_index_item si ON si."productVariantId"=v.id WHERE v.id=$1', [variants[0].id])));
        assert.equal(await catalog.getTotalCount(ctx, {footwear: {...filter, talla: '39'}}, true), 0, 'No combinar atributos de variantes distintas');
        assert.equal(await catalog.getTotalCount(otherCtx, {footwear: filter}, true), 0, 'No filtrar otro canal');
        const found = await catalog.getSearchResults(ctx, {footwear: filter, groupByProduct: true}, true);
        assert.equal(String(found[0].productId), String(product.id));
        assert.equal((found[0].price as any).min, 1000);
        const shared = {footwear: filter,groupByProduct:true};
        const runSearch = (catalog as any).runSearch.bind(catalog);
        let statements = 0;
        (catalog as any).runSearch = (...args: any[]) => {statements++; return runSearch(...args);};
        await Promise.all([catalog.getSearchResults(ctx,shared,true),catalog.getTotalCount(ctx,shared,true),catalog.getFacetValueIds(ctx,shared,true),catalog.getCollectionIds(ctx,shared,true)]);
        assert.equal(statements,1,'Una sola consulta para una búsqueda y sus metadatos');
        assert.equal(await catalog.getTotalCount(otherCtx,shared,true),0);
        assert.equal(statements,2,'El resultado no se comparte entre contextos/canales');
        (catalog as any).runSearch = runSearch;
        assert.equal((await catalog.getSearchResults(ctx,{footwear:filter,groupByProduct:true,skip:1,take:1},true)).length,0);
        assert.equal(await catalog.getTotalCount(ctx,{footwear:filter,groupByProduct:true,skip:1,take:1},true),1);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter, term: 'artesanal'}, true), 1, 'Conservar búsqueda en descripción');
        assert.deepEqual(await catalog.getFacetValueIds(ctx, {footwear: filter}, true), new Map());
        assert.deepEqual(await catalog.getCollectionIds(ctx, {footwear: filter}, true), new Map());
        await sql('UPDATE search_index_item SET "facetValueIds"=\'1,2\',"collectionIds"=\'10,20\',"collectionSlugs"=\'mujer,calzado\' WHERE "productVariantId"=$1', [variants[0].id]);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter, facetValueFilters: [{or:['2','3']}]}, true), 1);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter, facetValueIds:['0','1'],facetValueOperator:LogicalOperator.OR}, true), 1);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter, facetValueIds:['0','1'],facetValueOperator:LogicalOperator.AND}, true), 0);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter, collectionId:'10',collectionIds:['20']}, true), 1);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter, collectionId:'99',collectionIds:['10']}, true), 0);
        assert.deepEqual(await catalog.getCollectionIds(ctx, {footwear: filter,groupByProduct:true}, true), new Map([['10',1],['20',1]]));
        await sql('UPDATE search_index_item SET "facetValueIds"=\'\',"collectionIds"=\'\',"collectionSlugs"=\'\' WHERE "productVariantId"=$1', [variants[0].id]);
        assert.ok((await catalog.filterValues(ctx)).horma.includes('anatomica'));
        assert.throws(() => normalizedFootwearFilters({horma: 'x'.repeat(101)}));
        assert.throws(() => normalizedFootwearFilters({talla: {} as any}));
        // Projection changes must commit/roll back with the source, without relying on an indexing job.
        await assert.rejects(connection.withTransaction(sellerCtx, async tx => {
            await connection.getRepository(tx, 'Product').query('UPDATE product SET "customFieldsHorma"=\'Prueba\' WHERE id=$1', [product.id]);
            const [row] = await connection.getRepository(tx, 'Product').query('SELECT attributes FROM footwear_catalog_attribute WHERE "variantId"=$1', [variants[0].id]);
            assert.deepEqual(row.attributes.horma, ['prueba']); throw new Error('rollback de prueba');
        }), /rollback de prueba/);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 1);
        await sql('UPDATE product_option_translation SET name=\'Nobuk\' WHERE "baseId"=$1', [leather.id]);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 0);
        await sql('UPDATE product_option_translation SET name=\'Cuero\' WHERE "baseId"=$1', [leather.id]);
        await sql('DELETE FROM product_variant_options_product_option WHERE "productVariantId"=$1 AND "productOptionId"=$2', [variants[0].id, s38.id]);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 0);
        await sql('INSERT INTO product_variant_options_product_option VALUES ($1,$2)', [variants[0].id, s38.id]);
        await sql('UPDATE product SET enabled=false WHERE id=$1', [product.id]);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 0);
        await sql('UPDATE product SET enabled=true WHERE id=$1', [product.id]);
        await sql('DELETE FROM product_variant_channels_channel WHERE "productVariantId"=$1 AND "channelId"=$2', [variants[0].id, ctx.channelId]);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 0, 'Retirar publicación sin esperar al índice nativo');
        await sql('INSERT INTO product_variant_channels_channel VALUES ($1,$2)', [variants[0].id, ctx.channelId]);
        await sql('UPDATE product_option SET "deletedAt"=now() WHERE id=$1', [s38.id]);
        assert.equal(await catalog.getTotalCount(ctx, {footwear: filter}, true), 0);
        await sql('UPDATE product_option SET "deletedAt"=NULL WHERE id=$1', [s38.id]);

        if (process.env.CATALOG_FUNCTIONAL_ONLY === '1') {console.log('PASS: filtros, sincronización, rollback, canales, paginación y consulta compartida por búsqueda.'); return;}

        const count = 20000;
        // Bulk fixture only: compute the same projection once after loading sources; synchronization was tested above.
        await sql('ALTER TABLE product_variant DISABLE TRIGGER footwear_variant_attributes');
        await sql('ALTER TABLE product_variant_options_product_option DISABLE TRIGGER footwear_variant_options');
        const seeded = await sql(`WITH template AS (SELECT to_jsonb(v) AS row FROM product_variant v WHERE id=$1), inserted AS (
            INSERT INTO product_variant SELECT projected.* FROM template CROSS JOIN generate_series(1,$3::int) n
                CROSS JOIN LATERAL jsonb_populate_record(NULL::product_variant,row || jsonb_build_object(
                'id',nextval(pg_get_serial_sequence('product_variant','id')),'sku','PERF-'||$2::text||'-'||n::text,
                'customFieldsColores',jsonb_build_array(jsonb_build_object('nombre',CASE WHEN n%100=0 THEN 'Rojo' ELSE 'Azul' END))
            )) projected RETURNING id)
            SELECT array_agg(id) AS ids FROM inserted`, [variants[0].id, stamp, count]);
        const ids: number[] = seeded[0].ids;
        await sql('INSERT INTO product_variant_channels_channel SELECT unnest($1::int[]),$2', [ids, ctx.channelId]);
        await sql('INSERT INTO product_variant_options_product_option SELECT unnest($1::int[]),unnest($2::int[])', [ids, ids.map(() => Number(s38.id))]);
        await sql('INSERT INTO product_variant_options_product_option SELECT unnest($1::int[]),unnest($2::int[])', [ids, ids.map(() => Number(leather.id))]);
        await sql('ANALYZE product_variant');
        await sql('ANALYZE product_variant_options_product_option');
        await sql('INSERT INTO footwear_catalog_attribute SELECT id,footwear_attributes_for(id) FROM product_variant WHERE id=ANY($1::int[])', [ids]);
        await sql('ALTER TABLE product_variant ENABLE TRIGGER footwear_variant_attributes');
        await sql('ALTER TABLE product_variant_options_product_option ENABLE TRIGGER footwear_variant_options');
        await index(ids);
        for (const table of ['footwear_catalog_attribute', 'product_variant', 'product', 'product_variant_channels_channel', 'search_index_item']) await sql(`ANALYZE ${table}`);
        await sql('VACUUM (ANALYZE) footwear_catalog_attribute');
        const plan = await (catalog as any).query(ctx, {footwear: filter}, true).select('si.productVariantId').getQueryAndParameters();
        const explained = (await sql('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+plan[0], plan[1]))[0]['QUERY PLAN'][0];
        if (process.env.CATALOG_REPORT) await writeFile(process.env.CATALOG_REPORT+'.plan.json', JSON.stringify(explained,null,2)+'\n');
        assert.match(JSON.stringify(explained), /footwear_catalog_attributes_gin/, 'El plan real debe elegir GIN sin desactivar Seq Scan');
        async function search() {
            const input = {footwear: filter, take: 12, groupByProduct: true};
            const start = performance.now();
            const [items, total] = await Promise.all([catalog.getSearchResults(ctx,input,true),catalog.getTotalCount(ctx,input,true),catalog.getFacetValueIds(ctx,input,true),catalog.getCollectionIds(ctx,input,true)]);
            assert.equal(items.length,1); assert.equal(total,1);
            return performance.now()-start;
        }
        for (let i=0;i<10;i++) await search();
        const times=[]; for (let i=0;i<100;i++) times.push(await search());
        times.sort((a,b)=>a-b);
        const report={measuredAt:new Date().toISOString(),scope:'Real search strategy: results, count, facets and collections. Excludes HTTP. 20000 generated variants of one product plus functional fixtures; 1% selectivity. No forced planner settings.',variants:count,samples:100,p50Ms:times[49],p95Ms:times[94],maxMs:times[99],explain:explained};
        console.log('CATALOG_RESULT '+JSON.stringify(report));
        if (process.env.CATALOG_REPORT) await writeFile(process.env.CATALOG_REPORT,JSON.stringify(report,null,2)+'\n');
        assert.ok(report.p95Ms<=85, `Catálogo p95=${report.p95Ms.toFixed(2)}ms supera 85ms`);
    } finally {await app.close();}
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
