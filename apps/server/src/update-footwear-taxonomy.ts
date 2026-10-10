import {
    bootstrap,
    ChannelService,
    CollectionService,
    Collection,
    FacetService,
    FacetValueService,
    FacetValue,
    LanguageCode,
    ProductOptionGroupService,
    ProductOptionService,
    ProductOption,
    ProductService,
    ProductVariantService,
    RequestContextService,
    SearchService,
    TransactionalConnection,
    User,
    Asset,
} from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { config } from './vendure-config';

async function updateFootwearTaxonomy() {
    console.log('👟 Iniciando actualización de taxonomía de calzado (Tipo, Estilo, Facets, Colecciones, Variantes)...');

    const populatorConfig = {
        ...config,
        apiOptions: {
            ...config.apiOptions,
            port: 3999,
        },
    };
    const app = await bootstrap(populatorConfig);

    const requestContextService = app.get(RequestContextService);
    const channelService = app.get(ChannelService);
    const connection = app.get(TransactionalConnection);
    const facetService = app.get(FacetService);
    const facetValueService = app.get(FacetValueService);
    const collectionService = app.get(CollectionService);
    const optionGroupService = app.get(ProductOptionGroupService);
    const optionService = app.get(ProductOptionService);
    const productService = app.get(ProductService);
    const variantService = app.get(ProductVariantService);
    const searchService = app.get(SearchService);

    // Obtener superadmin user y canal por defecto
    const superAdminUser = await connection.rawConnection
        .getRepository(User)
        .findOne({
            where: { identifier: 'superadmin' },
            relations: ['roles', 'roles.channels'],
        });

    if (!superAdminUser) {
        throw new Error('No se encontró el usuario superadmin.');
    }

    const defaultChannel = await channelService.getDefaultChannel();
    const ctx = await requestContextService.create({
        apiType: 'admin',
        user: superAdminUser,
        channelOrToken: defaultChannel,
        languageCode: LanguageCode.en,
    });

    console.log(`✅ Contexto inicializado con canal: ${defaultChannel.code}`);

    // Helper para buscar o crear Facet
    async function getOrCreateFacet(code: string, name: string, values: Array<{ code: string; name: string }>) {
        const existing = await facetService.findAll(ctx, { filter: { code: { eq: code } } });
        let facet;
        const map: Record<string, string> = {};

        if (existing.items.length > 0) {
            facet = existing.items[0];
            console.log(`  ℹ️ Facet existente: ${name} (${code})`);
            for (const v of facet.values) {
                map[v.code] = String(v.id);
            }
            // Agregar valores faltantes si los hay
            for (const val of values) {
                if (!map[val.code]) {
                    const createdVal = await facetValueService.create(ctx, facet, {
                        code: val.code,
                        translations: [{ languageCode: LanguageCode.en, name: val.name }],
                    });
                    map[val.code] = String(createdVal.id);
                    console.log(`    + Valor agregado a ${code}: ${val.name} (${val.code})`);
                }
            }
        } else {
            facet = await facetService.create(ctx, {
                code,
                isPrivate: false,
                translations: [{ languageCode: LanguageCode.en, name }],
                values: values.map(v => ({
                    code: v.code,
                    translations: [{ languageCode: LanguageCode.en, name: v.name }],
                })),
            });
            console.log(`  ✨ Facet creada: ${name} (${code}) con ${values.length} valores`);
            for (const v of facet.values) {
                map[v.code] = String(v.id);
            }
        }
        return { facet, valuesMap: map };
    }

    // =========================================================================
    // 1. FACETS Y FACET VALUES
    // =========================================================================
    console.log('\n--- 1. Asegurando Facets de Tipo y Estilo de Calzado ---');

    // Facet: Tipo de Calzado: Hombre, Mujer, Niño, Infantil
    const tipoFacet = await getOrCreateFacet('tipo-calzado', 'Tipo de Calzado', [
        { code: 'hombre', name: 'Hombre' },
        { code: 'mujer', name: 'Mujer' },
        { code: 'nino', name: 'Niño' },
        { code: 'infantil', name: 'Infantil' },
    ]);

    // Facet: Estilo de Calzado
    const estiloFacet = await getOrCreateFacet('tipo-estilo', 'Tipo de Estilo', [
        { code: 'zapatillas', name: 'Zapatillas' },
        { code: 'casual', name: 'Casual' },
        { code: 'urbano', name: 'Urbano' },
        { code: 'botas', name: 'Botas' },
        { code: 'sandalias', name: 'Sandalias' },
        { code: 'tacones', name: 'Tacones' },
        { code: 'flats', name: 'Flats' },
        { code: 'botines', name: 'Botas / Botines' },
        { code: 'botas-botines', name: 'Botas / Botines' },
        { code: 'escolares', name: 'Escolares' },
        { code: 'bebes', name: 'Bebés' },
        { code: 'primeros-pasos', name: 'Primeros pasos' },
    ]);

    // Facet: Género Calzado (compatibilidad)
    const generoFacet = await getOrCreateFacet('genero-calzado', 'Género Calzado', [
        { code: 'hombre', name: 'Hombre' },
        { code: 'mujer', name: 'Mujer' },
        { code: 'ninos', name: 'Niños' },
        { code: 'nino', name: 'Niño' },
        { code: 'infantil', name: 'Infantil' },
    ]);

    // Facets de materiales y tallas
    const suelaFacet = await getOrCreateFacet('material-suela', 'Material Suela', [
        { code: 'pvc', name: 'PVC' },
        { code: 'tr', name: 'TR (Termoplástico)' },
        { code: 'caucho', name: 'Caucho' },
        { code: 'eva', name: 'EVA' },
    ]);

    const capelladaFacet = await getOrCreateFacet('material-capellada', 'Material Capellada', [
        { code: 'cuero', name: 'Cuero' },
        { code: 'sintetico', name: 'Sintético' },
    ]);

    const rangoTallasFacet = await getOrCreateFacet('rango-tallas', 'Rango de Tallas', [
        { code: 'pequeno-21-26', name: 'Pequeño (21-26)' },
        { code: 'mediano-27-36', name: 'Mediano (27-36)' },
        { code: 'grande-37-45', name: 'Grande (37-45)' },
    ]);

    // =========================================================================
    // 2. CREACIÓN / ACTUALIZACIÓN DE COLLECTIONS
    // =========================================================================
    console.log('\n--- 2. Estructurando Colecciones (Hombre, Mujer, Niños, Infantil) ---');

    async function getOrCreateOrUpdateCollection(
        name: string,
        slug: string,
        description: string,
        parentId: string | undefined,
        facetValueIds: string[],
    ) {
        const existing = await collectionService.findAll(ctx, { filter: { slug: { eq: slug } } });
        const filters = facetValueIds.length > 0
            ? [
                {
                    code: 'facet-value-filter',
                    arguments: [
                        { name: 'facetValueIds', value: JSON.stringify(facetValueIds) },
                        { name: 'containsAny', value: 'false' },
                    ],
                },
            ]
            : [];

        if (existing.items.length > 0) {
            const col = existing.items[0];
            await collectionService.update(ctx, {
                id: col.id,
                parentId: parentId || col.parentId,
                filters,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name,
                        slug,
                        description,
                    },
                ],
            });
            console.log(`  🔄 Colección actualizada: ${name} (${slug})`);
            return col;
        }

        const created = await collectionService.create(ctx, {
            parentId,
            filters,
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name,
                    slug,
                    description,
                },
            ],
        });
        console.log(`  ✨ Colección creada: ${name} (slug: ${slug})`);
        return created;
    }

    // Colección Principal: Calzado
    const calzadoRootCol = await getOrCreateOrUpdateCollection(
        'Calzado',
        'calzado',
        'Catálogo general de calzado',
        undefined,
        []
    );

    // --- HOMBRE ---
    const hombreCol = await getOrCreateOrUpdateCollection(
        'Hombre',
        'calzado-hombre',
        'Calzado para caballero',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['hombre']]
    );
    const hombreSubs = [
        { name: 'Zapatillas', slug: 'hombre-zapatillas', estilo: 'zapatillas' },
        { name: 'Casual', slug: 'hombre-casual', estilo: 'casual' },
        { name: 'Urbano', slug: 'hombre-urbano', estilo: 'urbano' },
        { name: 'Botas', slug: 'hombre-botas', estilo: 'botas' },
        { name: 'Sandalias', slug: 'hombre-sandalias', estilo: 'sandalias' },
    ];
    for (const sub of hombreSubs) {
        await getOrCreateOrUpdateCollection(
            `Hombre - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para hombre`,
            String(hombreCol.id),
            [tipoFacet.valuesMap['hombre'], estiloFacet.valuesMap[sub.estilo]]
        );
    }

    // --- MUJER ---
    const mujerCol = await getOrCreateOrUpdateCollection(
        'Mujer',
        'calzado-mujer',
        'Calzado para dama',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['mujer']]
    );
    const mujerSubs = [
        { name: 'Zapatillas', slug: 'mujer-zapatillas', estilo: 'zapatillas' },
        { name: 'Casual', slug: 'mujer-casual', estilo: 'casual' },
        { name: 'Tacones', slug: 'mujer-tacones', estilo: 'tacones' },
        { name: 'Flats', slug: 'mujer-flats', estilo: 'flats' },
        { name: 'Botas / Botines', slug: 'mujer-botas-botines', estilo: 'botines' },
    ];
    for (const sub of mujerSubs) {
        await getOrCreateOrUpdateCollection(
            `Mujer - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para mujer`,
            String(mujerCol.id),
            [tipoFacet.valuesMap['mujer'], estiloFacet.valuesMap[sub.estilo]]
        );
    }

    // --- NIÑOS ---
    // Niños: Escolares, Zapatillas, Casual, Urbano
    const ninosCol = await getOrCreateOrUpdateCollection(
        'Niños',
        'calzado-ninos',
        'Calzado para niños',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['nino']]
    );
    const ninosSubs = [
        { name: 'Escolares', slug: 'ninos-escolares', estilo: 'escolares' },
        { name: 'Zapatillas', slug: 'ninos-zapatillas', estilo: 'zapatillas' },
        { name: 'Casual', slug: 'ninos-casual', estilo: 'casual' },
        { name: 'Urbano', slug: 'ninos-urbano', estilo: 'urbano' },
    ];
    for (const sub of ninosSubs) {
        await getOrCreateOrUpdateCollection(
            `Niños - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para niños`,
            String(ninosCol.id),
            [tipoFacet.valuesMap['nino'], estiloFacet.valuesMap[sub.estilo]]
        );
    }

    // --- INFANTIL ---
    // Infantil: Bebés, Primeros pasos, Escolares
    const infantilCol = await getOrCreateOrUpdateCollection(
        'Infantil',
        'calzado-infantil',
        'Calzado infantil y primeros pasos',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['infantil']]
    );
    const infantilSubs = [
        { name: 'Bebés', slug: 'infantil-bebes', estilo: 'bebes' },
        { name: 'Primeros pasos', slug: 'infantil-primeros-pasos', estilo: 'primeros-pasos' },
        { name: 'Escolares', slug: 'infantil-escolares', estilo: 'escolares' },
    ];
    for (const sub of infantilSubs) {
        await getOrCreateOrUpdateCollection(
            `Infantil - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para infantil`,
            String(infantilCol.id),
            [tipoFacet.valuesMap['infantil'], estiloFacet.valuesMap[sub.estilo]]
        );
    }

    // Si existía la colección antigua 'ninos-bebes', la desvinculamos o actualizamos
    const oldNinosBebes = await collectionService.findAll(ctx, { filter: { slug: { eq: 'ninos-bebes' } } });
    if (oldNinosBebes.items.length > 0) {
        console.log('  ℹ️ Eliminando colección obsoleta ninos-bebes (ahora trasladada a infantil-bebes)...');
        await collectionService.delete(ctx, oldNinosBebes.items[0].id);
    }

    // =========================================================================
    // 3. PRODUCT OPTION GROUPS (COLOR Y TALLA)
    // =========================================================================
    console.log('\n--- 3. Verificando ProductOptionGroups ---');

    function normalizeCode(text: string) {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async function getOptionGroupMap(code: string) {
        const groups = await optionGroupService.findAll(ctx, { filter: { code: { eq: code } } });
        if (groups.items.length === 0) throw new Error(`Grupo no encontrado: ${code}`);
        const group = groups.items[0];
        const existingOptions = await connection.rawConnection.getRepository(ProductOption).find({
            where: { group: { id: group.id } },
        });
        const optionsMap: Record<string, any> = {};
        for (const opt of existingOptions) {
            optionsMap[opt.code] = opt.id;
        }
        return { group, optionsMap };
    }

    const colorGroup = await getOptionGroupMap('calzado-color');
    const tallaGroup = await getOptionGroupMap('calzado-talla');

    // =========================================================================
    // 4. ACTUALIZAR PRODUCTOS EXISTENTES (customFieldsTipo, customFieldsEstilo y FacetValues)
    // =========================================================================
    console.log('\n--- 4. Actualizando productos de calzado existentes con Tipo y Estilo ---');

    const productTipoEstiloMapping: Record<string, { tipo: 'Hombre' | 'Mujer' | 'Nino' | 'Infantil'; estilo: string; tipoFacet: string; estiloFacet: string }> = {
        'zapatilla-urbana-leather-pro-hombre': { tipo: 'Hombre', estilo: 'Urbano', tipoFacet: 'hombre', estiloFacet: 'urbano' },
        'zapato-casual-oxford-clasico-hombre': { tipo: 'Hombre', estilo: 'Casual', tipoFacet: 'hombre', estiloFacet: 'casual' },
        'bota-trekking-trabajo-resist-hombre': { tipo: 'Hombre', estilo: 'Botas', tipoFacet: 'hombre', estiloFacet: 'botas' },
        'sandalia-confort-anatomica-hombre': { tipo: 'Hombre', estilo: 'Sandalias', tipoFacet: 'hombre', estiloFacet: 'sandalias' },
        'zapatillas-deportivas-runner-air-mujer': { tipo: 'Mujer', estilo: 'Zapatillas', tipoFacet: 'mujer', estiloFacet: 'zapatillas' },
        'mocasin-casual-soft-touch-mujer': { tipo: 'Mujer', estilo: 'Casual', tipoFacet: 'mujer', estiloFacet: 'casual' },
        'tacones-elegance-stiletto-mujer': { tipo: 'Mujer', estilo: 'Tacones', tipoFacet: 'mujer', estiloFacet: 'tacones' },
        'bailarinas-chic-flats-mujer': { tipo: 'Mujer', estilo: 'Flats', tipoFacet: 'mujer', estiloFacet: 'flats' },
        'botin-chelsea-urban-chic-mujer': { tipo: 'Mujer', estilo: 'Botas_Botines', tipoFacet: 'mujer', estiloFacet: 'botines' },
        'zapato-primeros-pasos-baby-soft-ninos': { tipo: 'Infantil', estilo: 'Primeros_Pasos', tipoFacet: 'infantil', estiloFacet: 'primeros-pasos' },
        'zapato-escolar-reforzado-colegial-ninos': { tipo: 'Nino', estilo: 'Escolares', tipoFacet: 'nino', estiloFacet: 'escolares' },
        'zapatilla-infantil-action-speed-ninos': { tipo: 'Nino', estilo: 'Zapatillas', tipoFacet: 'nino', estiloFacet: 'zapatillas' },
        'escolar-tommy': { tipo: 'Nino', estilo: 'Escolares', tipoFacet: 'nino', estiloFacet: 'escolares' },
    };

    for (const [slug, data] of Object.entries(productTipoEstiloMapping)) {
        const prod = await productService.findOneBySlug(ctx, slug);
        if (prod) {
            // Actualizar customFields
            await productService.update(ctx, {
                id: prod.id,
                customFields: {
                    tipo: data.tipo,
                    estilo: data.estilo,
                    tipoEstilo: data.estilo,
                },
            });

            // Asignar los facetValues correspondientes
            const currentFacetValueIds = (prod.facetValues || []).map(f => String(f.id));
            const newFacetValueIds = new Set(currentFacetValueIds);
            if (tipoFacet.valuesMap[data.tipoFacet]) {
                newFacetValueIds.add(tipoFacet.valuesMap[data.tipoFacet]);
            }
            if (estiloFacet.valuesMap[data.estiloFacet]) {
                newFacetValueIds.add(estiloFacet.valuesMap[data.estiloFacet]);
            }
            if (data.tipoFacet === 'infantil') {
                newFacetValueIds.delete(generoFacet.valuesMap['ninos']);
                if (generoFacet.valuesMap['infantil']) {
                    newFacetValueIds.add(generoFacet.valuesMap['infantil']);
                }
            } else if (data.tipoFacet === 'nino') {
                if (generoFacet.valuesMap['ninos']) {
                    newFacetValueIds.add(generoFacet.valuesMap['ninos']);
                }
                if (generoFacet.valuesMap['nino']) {
                    newFacetValueIds.add(generoFacet.valuesMap['nino']);
                }
            }

            await productService.update(ctx, {
                id: prod.id,
                facetValueIds: Array.from(newFacetValueIds),
            });

            // Actualizar también las variantes del producto con los facetValues
            const variants = await variantService.getVariantsByProductId(ctx, prod.id);
            for (const variant of variants.items) {
                await variantService.update(ctx, [{
                    id: variant.id,
                    facetValueIds: Array.from(newFacetValueIds),
                }]);
            }

            console.log(`  ✅ Producto actualizado: ${slug} -> Tipo: ${data.tipo} | Estilo: ${data.estilo}`);
        }
    }

    // =========================================================================
    // 5. CREACIÓN DE PRODUCTOS NUEVOS PARA CUBRIR TODAS LAS CATEGORÍAS
    // =========================================================================
    console.log('\n--- 5. Creando productos de muestra para nuevas subcategorías ---');

    const assets = await connection.rawConnection.getRepository(Asset).find({ take: 10 });
    const getAssetId = (index: number) => assets.length > 0 ? assets[index % assets.length].id : undefined;

    interface NewFootwearDef {
        name: string;
        slug: string;
        skuBase: string;
        description: string;
        tipo: 'Hombre' | 'Mujer' | 'Nino' | 'Infantil';
        tipoFacetKey: 'hombre' | 'mujer' | 'nino' | 'infantil';
        estilo: string;
        estiloFacetKey: string;
        suela: 'PVC' | 'TR' | 'Caucho' | 'EVA';
        capellada: 'Cuero' | 'Sintetico';
        rangoTalla: 'pequeno-21-26' | 'mediano-27-36' | 'grande-37-45';
        rangoCustomField: 'Pequeno_21_26' | 'Mediano_27_36' | 'Grande_37_45';
        colores: string[];
        tallas: string[];
        precioBase: number;
        assetIndex: number;
    }

    const newProducts: NewFootwearDef[] = [
        // Hombre - Zapatillas
        {
            name: 'Zapatilla Running Sport Pro (Hombre)',
            slug: 'zapatilla-running-sport-pro-hombre',
            skuBase: 'CALZ-H-ZAP-13',
            description: 'Zapatillas deportivas para running con amortiguación avanzada en suela EVA y malla transpirable sintética. Óptimo soporte y ligereza.',
            tipo: 'Hombre',
            tipoFacetKey: 'hombre',
            estilo: 'Zapatillas',
            estiloFacetKey: 'zapatillas',
            suela: 'EVA',
            capellada: 'Sintetico',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['negro', 'blanco', 'azul'],
            tallas: ['39', '40', '41', '42', '43'],
            precioBase: 6200,
            assetIndex: 0,
        },
        // Niños - Casual
        {
            name: 'Mocasín Casual Kids Explorer (Niños)',
            slug: 'mocasin-casual-kids-explorer-ninos',
            skuBase: 'CALZ-N-CAS-14',
            description: 'Mocasín casual para niños con acabado en cuero genuino, costuras reforzadas y suela antideslizante TR.',
            tipo: 'Nino',
            tipoFacetKey: 'nino',
            estilo: 'Casual',
            estiloFacetKey: 'casual',
            suela: 'TR',
            capellada: 'Cuero',
            rangoTalla: 'mediano-27-36',
            rangoCustomField: 'Mediano_27_36',
            colores: ['cafe', 'azul', 'beige'],
            tallas: ['28', '29', '30', '31', '32'],
            precioBase: 3400,
            assetIndex: 1,
        },
        // Niños - Urbano
        {
            name: 'Zapatilla Urbana Street Skater (Niños)',
            slug: 'zapatilla-urbana-street-skater-ninos',
            skuBase: 'CALZ-N-URB-15',
            description: 'Zapatilla urbana skater para niños con suela plana de caucho vulcanizado de gran agarre y capellada sintética reforzada.',
            tipo: 'Nino',
            tipoFacetKey: 'nino',
            estilo: 'Urbano',
            estiloFacetKey: 'urbano',
            suela: 'Caucho',
            capellada: 'Sintetico',
            rangoTalla: 'mediano-27-36',
            rangoCustomField: 'Mediano_27_36',
            colores: ['negro', 'blanco', 'rojo'],
            tallas: ['29', '30', '31', '32', '33'],
            precioBase: 3800,
            assetIndex: 2,
        },
        // Infantil - Bebés
        {
            name: 'Patucos Suaves Cuna Baby Soft (Infantil)',
            slug: 'patucos-suaves-cuna-baby-soft-infantil',
            skuBase: 'CALZ-I-BEB-16',
            description: 'Calzado ultra suave para bebés en cuna y gateo, confeccionado con forro sintético hipoalergénico y suela flexible de PVC.',
            tipo: 'Infantil',
            tipoFacetKey: 'infantil',
            estilo: 'Bebes',
            estiloFacetKey: 'bebes',
            suela: 'PVC',
            capellada: 'Sintetico',
            rangoTalla: 'pequeno-21-26',
            rangoCustomField: 'Pequeno_21_26',
            colores: ['blanco', 'azul', 'rosa'],
            tallas: ['21', '22', '23'],
            precioBase: 1999,
            assetIndex: 3,
        },
        // Infantil - Escolares
        {
            name: 'Zapato Escolar Jardín Kinder (Infantil)',
            slug: 'zapato-escolar-jardin-kinder-infantil',
            skuBase: 'CALZ-I-ESC-17',
            description: 'Zapato escolar para los más pequeños en etapa de guardería y jardín. Cierre seguro de velcro, cuero genuino y suela TR flexible.',
            tipo: 'Infantil',
            tipoFacetKey: 'infantil',
            estilo: 'Escolares',
            estiloFacetKey: 'escolares',
            suela: 'TR',
            capellada: 'Cuero',
            rangoTalla: 'pequeno-21-26',
            rangoCustomField: 'Pequeno_21_26',
            colores: ['negro', 'azul'],
            tallas: ['23', '24', '25', '26'],
            precioBase: 2950,
            assetIndex: 4,
        },
    ];

    for (const pDef of newProducts) {
        const existing = await productService.findOneBySlug(ctx, pDef.slug);
        if (existing) {
            console.log(`  ℹ️ Producto ya existe: ${pDef.name}`);
            continue;
        }

        const facetValueIds = [
            suelaFacet.valuesMap[pDef.suela.toLowerCase()],
            capelladaFacet.valuesMap[pDef.capellada.toLowerCase()],
            rangoTallasFacet.valuesMap[pDef.rangoTalla],
            tipoFacet.valuesMap[pDef.tipoFacetKey],
            estiloFacet.valuesMap[pDef.estiloFacetKey],
            generoFacet.valuesMap[pDef.tipoFacetKey === 'nino' ? 'ninos' : pDef.tipoFacetKey],
        ].filter(Boolean);

        const featuredAssetId = getAssetId(pDef.assetIndex);
        const createdProduct = await productService.create(ctx, {
            featuredAssetId,
            assetIds: featuredAssetId ? [featuredAssetId] : [],
            facetValueIds,
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: pDef.name,
                    slug: pDef.slug,
                    description: pDef.description,
                },
            ],
            customFields: {
                tipo: pDef.tipo,
                estilo: pDef.estilo,
                tipoEstilo: pDef.estilo,
                suela: pDef.suela,
                capellada: pDef.capellada,
                rangoTallas: pDef.rangoCustomField,
            },
        });

        await productService.addOptionGroupToProduct(ctx, createdProduct.id, colorGroup.group.id);
        await productService.addOptionGroupToProduct(ctx, createdProduct.id, tallaGroup.group.id);

        const variantInputs = [];
        for (const colorKey of pDef.colores) {
            for (const tallaKey of pDef.tallas) {
                const colorOptId = colorGroup.optionsMap[normalizeCode(colorKey)];
                const tallaOptId = tallaGroup.optionsMap[normalizeCode(tallaKey)];
                if (!colorOptId || !tallaOptId) continue;

                const colorLabel = colorKey.toUpperCase();
                const sku = `${pDef.skuBase}-${colorLabel.substring(0, 3)}-${tallaKey}`;
                variantInputs.push({
                    productId: createdProduct.id,
                    sku,
                    price: pDef.precioBase,
                    featuredAssetId,
                    facetValueIds,
                    optionIds: [colorOptId, tallaOptId],
                    trackInventory: GlobalFlag.TRUE,
                    stockOnHand: 30,
                    stockLevels: [{ stockLocationId: '1', stockOnHand: 30 }],
                    translations: [
                        {
                            languageCode: LanguageCode.en,
                            name: `${pDef.name} (${colorLabel} / Talla ${tallaKey})`,
                        },
                    ],
                });
            }
        }

        if (variantInputs.length > 0) {
            await variantService.create(ctx, variantInputs);
            console.log(`  ✨ Creado: ${pDef.name} con ${variantInputs.length} variantes (Colores: ${pDef.colores.join(', ')} | Tallas: ${pDef.tallas.join(', ')})`);
        }
    }

    // =========================================================================
    // 6. APLICAR FILTROS DE COLECCIONES Y REINDEXAR
    // =========================================================================
    console.log('\n--- 6. Reindexando y aplicando filtros de colecciones ---');
    try {
        await collectionService.triggerApplyFiltersJob(ctx);
        console.log('  ✅ Trabajo de filtros de colecciones lanzado exitosamente.');
    } catch (e: any) {
        console.log('  ⚠️ triggerApplyFiltersJob:', e.message);
    }

    try {
        await searchService.reindex(ctx);
        console.log('  ✅ Índice de búsqueda reindexado con éxito.');
    } catch (e: any) {
        console.log('  ⚠️ searchService.reindex:', e.message);
    }

    console.log('\n🎉 ¡Taxonomía de Calzado (Tipo, Estilo, Facets, Colecciones, Variantes) actualizada con éxito!');
    process.exit(0);
}

updateFootwearTaxonomy().catch(err => {
    console.error('❌ Error actualizando la taxonomía:', err);
    process.exit(1);
});
