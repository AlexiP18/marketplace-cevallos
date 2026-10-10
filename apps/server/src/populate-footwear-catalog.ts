import {
    bootstrap,
    ChannelService,
    CollectionService,
    FacetService,
    FacetValueService,
    LanguageCode,
    ProductOptionGroupService,
    ProductOptionService,
    ProductOption,
    ProductService,
    ProductVariantService,
    PromotionService,
    RequestContextService,
    SearchService,
    TransactionalConnection,
    User,
    Asset,
} from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { config } from './vendure-config';

async function populateFootwearCatalog() {
    console.log('👟 Iniciando creación del catálogo de calzado en Vendure...');
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
    const promotionService = app.get(PromotionService);
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

    // Assets disponibles para fotos de calzado
    const assets = await connection.rawConnection.getRepository(Asset).find({ take: 10 });
    const getAssetId = (index: number) => assets.length > 0 ? assets[index % assets.length].id : undefined;

    // =========================================================================
    // 1. CREACIÓN DE FACETS Y FACET VALUES
    // =========================================================================
    console.log('\n--- 1. Creando Facets y FacetValues ---');

    // Helper para buscar o crear Facet
    async function getOrCreateFacet(code: string, name: string, values: Array<{ code: string; name: string }>) {
        const existing = await facetService.findAll(ctx, { filter: { code: { eq: code } } });
        if (existing.items.length > 0) {
            console.log(`  ℹ️ Facet existente: ${name} (${code})`);
            const facet = existing.items[0];
            const map: Record<string, string> = {};
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
                }
            }
            return { facet, valuesMap: map };
        }

        const facet = await facetService.create(ctx, {
            code,
            isPrivate: false,
            translations: [{ languageCode: LanguageCode.en, name }],
            values: values.map(v => ({
                code: v.code,
                translations: [{ languageCode: LanguageCode.en, name: v.name }],
            })),
        });
        console.log(`  ✨ Facet creada: ${name} (${code}) con ${values.length} valores`);
        const map: Record<string, string> = {};
        for (const v of facet.values) {
            map[v.code] = String(v.id);
        }
        return { facet, valuesMap: map };
    }

    // Facet: Material Suela
    const suelaFacet = await getOrCreateFacet('material-suela', 'Material Suela', [
        { code: 'pvc', name: 'PVC' },
        { code: 'tr', name: 'TR (Termoplástico)' },
        { code: 'caucho', name: 'Caucho' },
        { code: 'eva', name: 'EVA' },
    ]);

    // Facet: Material Capellada
    const capelladaFacet = await getOrCreateFacet('material-capellada', 'Material Capellada', [
        { code: 'cuero', name: 'Cuero' },
        { code: 'sintetico', name: 'Sintético' },
    ]);

    // Facet: Rango de Tallas
    const rangoTallasFacet = await getOrCreateFacet('rango-tallas', 'Rango de Tallas', [
        { code: 'pequeno-21-26', name: 'Pequeño (21-26)' },
        { code: 'mediano-27-36', name: 'Mediano (27-36)' },
        { code: 'grande-37-45', name: 'Grande (37-45)' },
    ]);

    // Facet: Tipo de Calzado: Hombre, Mujer, Niño, Infantil
    const tipoFacet = await getOrCreateFacet('tipo-calzado', 'Tipo de Calzado', [
        { code: 'hombre', name: 'Hombre' },
        { code: 'mujer', name: 'Mujer' },
        { code: 'nino', name: 'Niño' },
        { code: 'infantil', name: 'Infantil' },
    ]);

    // Facet: Tipo Estilo
    const tipoEstiloFacet = await getOrCreateFacet('tipo-estilo', 'Tipo de Estilo', [
        { code: 'zapatillas', name: 'Zapatillas' },
        { code: 'casual', name: 'Casual' },
        { code: 'urbano', name: 'Urbano' },
        { code: 'botas', name: 'Botas' },
        { code: 'botines', name: 'Botas / Botines' },
        { code: 'botas-botines', name: 'Botas / Botines' },
        { code: 'sandalias', name: 'Sandalias' },
        { code: 'tacones', name: 'Tacones' },
        { code: 'flats', name: 'Flats' },
        { code: 'escolares', name: 'Escolares' },
        { code: 'bebes', name: 'Bebés' },
        { code: 'primeros-pasos', name: 'Primeros pasos' },
    ]);

    // Facet: Categoría / Género
    const generoFacet = await getOrCreateFacet('genero-calzado', 'Género Calzado', [
        { code: 'hombre', name: 'Hombre' },
        { code: 'mujer', name: 'Mujer' },
        { code: 'ninos', name: 'Niños' },
        { code: 'nino', name: 'Niño' },
        { code: 'infantil', name: 'Infantil' },
    ]);

    // =========================================================================
    // 2. CREACIÓN DE COLLECTIONS (JERARQUÍA DE CALZADO)
    // =========================================================================
    console.log('\n--- 2. Creando Colecciones (Estructura de Categorías) ---');

    async function getOrCreateCollection(
        name: string,
        slug: string,
        description: string,
        parentId?: string,
        facetValueIds?: string[],
    ) {
        const existing = await collectionService.findAll(ctx, { filter: { slug: { eq: slug } } });
        if (existing.items.length > 0) {
            console.log(`  ℹ️ Colección existente: ${name} (${slug})`);
            return existing.items[0];
        }

        const filters = facetValueIds && facetValueIds.length > 0
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

        const col = await collectionService.create(ctx, {
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
        return col;
    }

    // Colección Principal: Calzado
    const calzadoRootCol = await getOrCreateCollection(
        'Calzado',
        'calzado',
        'Catálogo general de calzado para toda la familia',
        undefined,
        []
    );

    // --- Sub-árbol HOMBRE ---
    const hombreCol = await getOrCreateCollection(
        'Hombre',
        'calzado-hombre',
        'Calzado para caballero',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['hombre']]
    );
    const hombreSubcategories = [
        { name: 'Zapatillas', slug: 'hombre-zapatillas', estiloKey: 'zapatillas' },
        { name: 'Casual', slug: 'hombre-casual', estiloKey: 'casual' },
        { name: 'Urbano', slug: 'hombre-urbano', estiloKey: 'urbano' },
        { name: 'Botas', slug: 'hombre-botas', estiloKey: 'botas' },
        { name: 'Sandalias', slug: 'hombre-sandalias', estiloKey: 'sandalias' },
    ];
    for (const sub of hombreSubcategories) {
        await getOrCreateCollection(
            `Hombre - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para hombre`,
            String(hombreCol.id),
            [tipoFacet.valuesMap['hombre'], tipoEstiloFacet.valuesMap[sub.estiloKey]]
        );
    }

    // --- Sub-árbol MUJER ---
    const mujerCol = await getOrCreateCollection(
        'Mujer',
        'calzado-mujer',
        'Calzado para dama',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['mujer']]
    );
    const mujerSubcategories = [
        { name: 'Zapatillas', slug: 'mujer-zapatillas', estiloKey: 'zapatillas' },
        { name: 'Casual', slug: 'mujer-casual', estiloKey: 'casual' },
        { name: 'Tacones', slug: 'mujer-tacones', estiloKey: 'tacones' },
        { name: 'Flats', slug: 'mujer-flats', estiloKey: 'flats' },
        { name: 'Botas / Botines', slug: 'mujer-botas-botines', estiloKey: 'botines' },
    ];
    for (const sub of mujerSubcategories) {
        await getOrCreateCollection(
            `Mujer - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para mujer`,
            String(mujerCol.id),
            [tipoFacet.valuesMap['mujer'], tipoEstiloFacet.valuesMap[sub.estiloKey]]
        );
    }

    // --- Sub-árbol NIÑOS ---
    const ninosCol = await getOrCreateCollection(
        'Niños',
        'calzado-ninos',
        'Calzado para niños',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['nino']]
    );
    const ninosSubcategories = [
        { name: 'Escolares', slug: 'ninos-escolares', estiloKey: 'escolares' },
        { name: 'Zapatillas', slug: 'ninos-zapatillas', estiloKey: 'zapatillas' },
        { name: 'Casual', slug: 'ninos-casual', estiloKey: 'casual' },
        { name: 'Urbano', slug: 'ninos-urbano', estiloKey: 'urbano' },
    ];
    for (const sub of ninosSubcategories) {
        await getOrCreateCollection(
            `Niños - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para niños`,
            String(ninosCol.id),
            [tipoFacet.valuesMap['nino'], tipoEstiloFacet.valuesMap[sub.estiloKey]]
        );
    }

    // --- Sub-árbol INFANTIL ---
    const infantilCol = await getOrCreateCollection(
        'Infantil',
        'calzado-infantil',
        'Calzado infantil y primeros pasos',
        String(calzadoRootCol.id),
        [tipoFacet.valuesMap['infantil']]
    );
    const infantilSubcategories = [
        { name: 'Bebés', slug: 'infantil-bebes', estiloKey: 'bebes' },
        { name: 'Primeros pasos', slug: 'infantil-primeros-pasos', estiloKey: 'primeros-pasos' },
        { name: 'Escolares', slug: 'infantil-escolares', estiloKey: 'escolares' },
    ];
    for (const sub of infantilSubcategories) {
        await getOrCreateCollection(
            `Infantil - ${sub.name}`,
            sub.slug,
            `Calzado ${sub.name} para infantil`,
            String(infantilCol.id),
            [tipoFacet.valuesMap['infantil'], tipoEstiloFacet.valuesMap[sub.estiloKey]]
        );
    }

    // =========================================================================
    // 3. CREACIÓN DE PRODUCT OPTION GROUPS (COLOR Y TALLA)
    // =========================================================================
    console.log('\n--- 3. Creando ProductOptionGroups (Color y Talla) ---');

    function normalizeCode(text: string) {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    async function getOrCreateOptionGroup(code: string, name: string, options: string[]) {
        const existing = await optionGroupService.findAll(ctx, { filter: { code: { eq: code } } });
        let group;
        const optionsMap: Record<string, any> = {};

        if (existing.items.length > 0) {
            group = existing.items[0];
            console.log(`  ℹ️ Grupo de opciones existente: ${name} (${code})`);
        } else {
            group = await optionGroupService.create(ctx, {
                code,
                translations: [{ languageCode: LanguageCode.en, name }],
            });
            console.log(`  ✨ Grupo de opciones creado: ${name} (${code})`);
        }

        // Cargar todas las opciones existentes directamente de la BD
        const existingOptions = await connection.rawConnection.getRepository(ProductOption).find({
            where: { group: { id: group.id } },
        });
        for (const opt of existingOptions) {
            optionsMap[opt.code] = opt.id;
        }

        // Crear opciones faltantes
        for (const optName of options) {
            const optCode = normalizeCode(optName);
            if (!optionsMap[optCode]) {
                const opt = await optionService.create(ctx, group, {
                    code: optCode,
                    translations: [{ languageCode: LanguageCode.en, name: optName }],
                });
                optionsMap[optCode] = opt.id;
            }
        }

        return { group, optionsMap };
    }

    const colorGroup = await getOrCreateOptionGroup('calzado-color', 'Color', [
        'Negro',
        'Blanco',
        'Café',
        'Azul',
        'Miel',
        'Rojo',
        'Rosa',
        'Beige',
    ]);

    const tallasNumbers = [
        // Pequeño (21-26)
        '21', '22', '23', '24', '25', '26',
        // Mediano (27-36)
        '27', '28', '29', '30', '31', '32', '33', '34', '35', '36',
        // Grande (37-45)
        '37', '38', '39', '40', '41', '42', '43', '44', '45',
    ];
    const tallaGroup = await getOrCreateOptionGroup('calzado-talla', 'Talla', tallasNumbers);

    // =========================================================================
    // 4. CREACIÓN DE PRODUCTOS Y VARIANTES DE CALZADO
    // =========================================================================
    console.log('\n--- 4. Creando Productos y Variantes de Calzado ---');

    interface FootwearProductDef {
        name: string;
        slug: string;
        skuBase: string;
        description: string;
        tipo?: 'Hombre' | 'Mujer' | 'Nino' | 'Infantil';
        tipoKey?: 'hombre' | 'mujer' | 'nino' | 'infantil';
        genero?: 'hombre' | 'mujer' | 'ninos';
        estilo: string;
        estiloKey?: string;
        suela: 'PVC' | 'TR' | 'Caucho' | 'EVA';
        capellada: 'Cuero' | 'Sintetico';
        rangoTalla: 'pequeno-21-26' | 'mediano-27-36' | 'grande-37-45';
        rangoCustomField: 'Pequeno_21_26' | 'Mediano_27_36' | 'Grande_37_45';
        colores: string[]; // keys in colorGroup
        tallas: string[]; // keys in tallaGroup
        precioBase: number; // in cents
        assetIndex: number;
    }

    const productsCatalog: FootwearProductDef[] = [
        // --- HOMBRE ---
        {
            name: 'Zapatilla Urbana Leather Pro (Hombre)',
            slug: 'zapatilla-urbana-leather-pro-hombre',
            skuBase: 'CALZ-H-URB-01',
            description: 'Zapatilla urbana para hombre fabricada con capellada de cuero genuino y suela ultra ligera EVA para máxima amortiguación y estilo diario.',
            tipo: 'Hombre',
            tipoKey: 'hombre',
            estilo: 'Urbano',
            estiloKey: 'urbano',
            suela: 'EVA',
            capellada: 'Cuero',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['negro', 'blanco'],
            tallas: ['39', '40', '41', '42', '43'],
            precioBase: 5999, // $59.99
            assetIndex: 0,
        },
        {
            name: 'Zapato Casual Oxford Clásico (Hombre)',
            slug: 'zapato-casual-oxford-clasico-hombre',
            skuBase: 'CALZ-H-CAS-02',
            description: 'Zapato casual estilo Oxford con acabado en cuero legítimo y suela de caucho antideslizante, ideal para trabajo de oficina y eventos.',
            genero: 'hombre',
            estilo: 'casual',
            suela: 'Caucho',
            capellada: 'Cuero',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['cafe', 'negro'],
            tallas: ['39', '40', '41', '42', '43'],
            precioBase: 6850, // $68.50
            assetIndex: 1,
        },
        {
            name: 'Bota Trekking & Trabajo Resist (Hombre)',
            slug: 'bota-trekking-trabajo-resist-hombre',
            skuBase: 'CALZ-H-BOT-03',
            description: 'Bota resistente de caña media con suela de TR de alto agarre y capellada de cuero curtido repelente al agua. Confort y durabilidad extrema.',
            genero: 'hombre',
            estilo: 'botas',
            suela: 'TR',
            capellada: 'Cuero',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['miel', 'negro'],
            tallas: ['40', '41', '42', '43', '44'],
            precioBase: 7900, // $79.00
            assetIndex: 2,
        },
        {
            name: 'Sandalia Confort Anatómica (Hombre)',
            slug: 'sandalia-confort-anatomica-hombre',
            skuBase: 'CALZ-H-SAN-04',
            description: 'Sandalia masculina con soporte de arco, suela flexible de PVC resistente y tiras ajustables de material sintético de secado rápido.',
            genero: 'hombre',
            estilo: 'sandalias',
            suela: 'PVC',
            capellada: 'Sintetico',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['cafe', 'negro'],
            tallas: ['39', '40', '41', '42'],
            precioBase: 2499, // $24.99
            assetIndex: 3,
        },

        // --- MUJER ---
        {
            name: 'Zapatillas Deportivas Runner Air (Mujer)',
            slug: 'zapatillas-deportivas-runner-air-mujer',
            skuBase: 'CALZ-M-ZAP-05',
            description: 'Zapatillas deportivas para dama con cámara de aire y suela EVA ultraliviana. Capellada sintética transpirable de alta resistencia.',
            genero: 'mujer',
            estilo: 'zapatillas',
            suela: 'EVA',
            capellada: 'Sintetico',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['blanco', 'rosa'],
            tallas: ['36', '37', '38', '39'],
            precioBase: 4999, // $49.99
            assetIndex: 4,
        },
        {
            name: 'Mocasín Casual Soft Touch (Mujer)',
            slug: 'mocasin-casual-soft-touch-mujer',
            skuBase: 'CALZ-M-CAS-06',
            description: 'Mocasín femenino confeccionado en fino cuero suave, plantilla acolchada y suela TR flexible. Comodidad absoluta para el día a día.',
            genero: 'mujer',
            estilo: 'casual',
            suela: 'TR',
            capellada: 'Cuero',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['beige', 'negro'],
            tallas: ['36', '37', '38', '39', '40'],
            precioBase: 5200, // $52.00
            assetIndex: 5,
        },
        {
            name: 'Tacones Elegance Stiletto (Mujer)',
            slug: 'tacones-elegance-stiletto-mujer',
            skuBase: 'CALZ-M-TAC-07',
            description: 'Zapatos de tacón alto estilo Stiletto para fiesta y ocasiones especiales. Capellada sintética acabado charol y suela de PVC duradera.',
            genero: 'mujer',
            estilo: 'tacones',
            suela: 'PVC',
            capellada: 'Sintetico',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['negro', 'rojo'],
            tallas: ['36', '37', '38', '39'],
            precioBase: 4500, // $45.00
            assetIndex: 6,
        },
        {
            name: 'Bailarinas Chic Flats (Mujer)',
            slug: 'bailarinas-chic-flats-mujer',
            skuBase: 'CALZ-M-FLA-08',
            description: 'Bailarinas flats ligeras con capellada de cuero natural y suela de caucho flexible. El calzado básico indispensable de cualquier guardarropa.',
            genero: 'mujer',
            estilo: 'flats',
            suela: 'Caucho',
            capellada: 'Cuero',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['negro', 'beige'],
            tallas: ['36', '37', '38', '39'],
            precioBase: 3450, // $34.50
            assetIndex: 7,
        },
        {
            name: 'Botín Chelsea Urban Chic (Mujer)',
            slug: 'botin-chelsea-urban-chic-mujer',
            skuBase: 'CALZ-M-BOT-09',
            description: 'Botines tipo Chelsea con elásticos laterales, cuero genuino y suela gruesa de TR track antideslizante para temporada de lluvia y frío.',
            genero: 'mujer',
            estilo: 'botines',
            suela: 'TR',
            capellada: 'Cuero',
            rangoTalla: 'grande-37-45',
            rangoCustomField: 'Grande_37_45',
            colores: ['negro', 'cafe'],
            tallas: ['37', '38', '39', '40'],
            precioBase: 6400, // $64.00
            assetIndex: 8,
        },

        // --- NIÑOS ---
        {
            name: 'Zapato Primeros Pasos Baby Soft (Niños/Bebés)',
            slug: 'zapato-primeros-pasos-baby-soft-ninos',
            skuBase: 'CALZ-N-BEB-10',
            description: 'Calzado ergonómico para primeros pasos con puntera redondeada, cuero extra suave y suela TR flexible que respeta el desarrollo natural del pie.',
            genero: 'ninos',
            estilo: 'bebes',
            suela: 'TR',
            capellada: 'Cuero',
            rangoTalla: 'pequeno-21-26',
            rangoCustomField: 'Pequeno_21_26',
            colores: ['azul', 'blanco', 'rosa'],
            tallas: ['21', '22', '23', '24', '25', '26'],
            precioBase: 2800, // $28.00
            assetIndex: 9,
        },
        {
            name: 'Zapato Escolar Reforzado Colegial (Niños)',
            slug: 'zapato-escolar-reforzado-colegial-ninos',
            skuBase: 'CALZ-N-ESC-11',
            description: 'Zapato escolar resistente para jornadas activas. Puntera y talón reforzados, cuero 100% resistente al desgaste y suela de caucho duradera.',
            genero: 'ninos',
            estilo: 'escolares',
            suela: 'Caucho',
            capellada: 'Cuero',
            rangoTalla: 'mediano-27-36',
            rangoCustomField: 'Mediano_27_36',
            colores: ['negro', 'azul'],
            tallas: ['28', '29', '30', '31', '32', '33', '34', '35'],
            precioBase: 3200, // $32.00
            assetIndex: 0,
        },
        {
            name: 'Zapatilla Infantil Action Speed (Niños)',
            slug: 'zapatilla-infantil-action-speed-ninos',
            skuBase: 'CALZ-N-ZAP-12',
            description: 'Zapatilla deportiva infantil con cierre de velcro para fácil colocación, suela EVA ultraliviana para correr y jugar sin fatiga.',
            genero: 'ninos',
            estilo: 'zapatillas',
            suela: 'EVA',
            capellada: 'Sintetico',
            rangoTalla: 'mediano-27-36',
            rangoCustomField: 'Mediano_27_36',
            colores: ['azul', 'negro', 'rojo'],
            tallas: ['27', '28', '29', '30', '31', '32'],
            precioBase: 3600, // $36.00
            assetIndex: 1,
        },
    ];

    for (const pDef of productsCatalog) {
        // Verificar si ya existe
        const existing = await productService.findOneBySlug(ctx, pDef.slug);
        if (existing) {
            console.log(`  ℹ️ Producto ya existe: ${pDef.name}`);
            continue;
        }

        // Obtener FacetValues a asociar
        const tipoKey = pDef.tipoKey || (pDef.genero === 'ninos' ? 'nino' : (pDef.genero as any)) || 'hombre';
        const estiloKey = pDef.estiloKey || pDef.estilo.toLowerCase();
        const tipoVal = pDef.tipo || (tipoKey === 'hombre' ? 'Hombre' : tipoKey === 'mujer' ? 'Mujer' : tipoKey === 'nino' ? 'Nino' : 'Infantil');

        const facetValueIds = [
            suelaFacet.valuesMap[pDef.suela.toLowerCase()],
            capelladaFacet.valuesMap[pDef.capellada.toLowerCase()],
            rangoTallasFacet.valuesMap[pDef.rangoTalla],
            tipoFacet.valuesMap[tipoKey],
            tipoEstiloFacet.valuesMap[estiloKey],
            generoFacet.valuesMap[tipoKey === 'nino' ? 'ninos' : tipoKey],
        ].filter(Boolean);

        // Crear Producto con sus customFields
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
                tipo: tipoVal,
                estilo: pDef.estilo,
                suela: pDef.suela,
                capellada: pDef.capellada,
                rangoTallas: pDef.rangoCustomField,
                tipoEstilo: pDef.estilo,
            },
        });

        // Asignar Option Groups al Producto
        await productService.addOptionGroupToProduct(ctx, createdProduct.id, colorGroup.group.id);
        await productService.addOptionGroupToProduct(ctx, createdProduct.id, tallaGroup.group.id);

        // Crear las variantes para cada combinación de color y talla
        const variantInputs = [];
        for (const colorKey of pDef.colores) {
            for (const tallaKey of pDef.tallas) {
                const colorOptId = colorGroup.optionsMap[normalizeCode(colorKey)];
                const tallaOptId = tallaGroup.optionsMap[normalizeCode(tallaKey)];
                if (!colorOptId || !tallaOptId) {
                    throw new Error(`Opción no encontrada para producto ${pDef.name}: colorKey=${colorKey} (id=${colorOptId}), tallaKey=${tallaKey} (id=${tallaOptId})`);
                }

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
                    stockOnHand: 25,
                    stockLevels: [{ stockLocationId: '1', stockOnHand: 25 }],
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
    // 5. CREACIÓN DE PROMOCIONES
    // =========================================================================
    console.log('\n--- 5. Creando Promociones para Calzado ---');

    // Promoción 1: 15% Descuento Calzado
    const existingPromos = await promotionService.findAll(ctx);
    const hasCalzado15 = existingPromos.items.some(p => p.couponCode === 'CALZADO15');
    if (!hasCalzado15) {
        await promotionService.createPromotion(ctx, {
            enabled: true,
            couponCode: 'CALZADO15',
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: '15% Descuento Especial en Calzado',
                    description: 'Obtén 15% de descuento en tu compra de calzado por pedidos superiores a $40 con el cupón CALZADO15.',
                },
            ],
            conditions: [
                {
                    code: 'minimum_order_amount',
                    arguments: [
                        { name: 'amount', value: '4000' }, // $40.00 en centavos
                        { name: 'taxInclusive', value: 'true' },
                    ],
                },
            ],
            actions: [
                {
                    code: 'order_percentage_discount',
                    arguments: [
                        { name: 'discount', value: '15' },
                    ],
                },
            ],
        });
        console.log('  ✨ Promoción creada: "15% Descuento Especial en Calzado" (Cupón: CALZADO15, Mínimo: $40)');
    } else {
        console.log('  ℹ️ Promoción CALZADO15 ya existe.');
    }

    // Promoción 2: Envío Gratis en compras > $50
    const hasFreeShipping = existingPromos.items.some(p => p.name.includes('Envío Gratis') || p.name.includes('Free Shipping'));
    if (!hasFreeShipping) {
        await promotionService.createPromotion(ctx, {
            enabled: true,
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Envío Gratis en Calzado sobre $50',
                    description: 'Envío completamente gratis para compras de calzado superiores a $50.',
                },
            ],
            conditions: [
                {
                    code: 'minimum_order_amount',
                    arguments: [
                        { name: 'amount', value: '5000' }, // $50.00 en centavos
                        { name: 'taxInclusive', value: 'true' },
                    ],
                },
            ],
            actions: [
                {
                    code: 'free_shipping',
                    arguments: [],
                },
            ],
        });
        console.log('  ✨ Promoción creada: "Envío Gratis en Calzado sobre $50" (Automática, Mínimo: $50)');
    } else {
        console.log('  ℹ️ Promoción de Envío Gratis ya existe.');
    }

    // =========================================================================
    // 6. ACTUALIZAR FILTROS DE COLECCIONES Y REINDEXAR BÚSQUEDA
    // =========================================================================
    console.log('\n--- 6. Reindexando y aplicando filtros de colecciones ---');
    try {
        await collectionService.triggerApplyFiltersJob(ctx);
        console.log('  ✅ Trabajo de filtros de colecciones lanzado.');
    } catch (e) {
        console.log('  ⚠️ Filtros de colecciones aplicados al iniciar.');
    }

    try {
        await searchService.reindex(ctx);
        console.log('  ✅ Índice de búsqueda actualizado.');
    } catch (e) {
        console.log('  ⚠️ Error al reindexar búsqueda (puede actualizarse desde el panel de admin).');
    }

    console.log('\n🎉 ¡Catálogo de Calzado completado exitosamente!');
    process.exit(0);
}

populateFootwearCatalog().catch(err => {
    console.error('❌ Error creando el catálogo de calzado:', err);
    process.exit(1);
});
