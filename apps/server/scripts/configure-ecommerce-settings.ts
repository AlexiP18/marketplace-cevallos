import 'dotenv/config';

interface GraphQLResponse<T = any> {
    data?: T;
    errors?: Array<{ message: string; [key: string]: any }>;
}

const SERVER_URL = process.env.VENDURE_SERVER_URL || 'http://localhost:3000';
const ADMIN_API = `${SERVER_URL}/admin-api`;
const USERNAME = process.env.SUPERADMIN_USERNAME || 'superadmin';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'superadmin';

async function executeQuery<T = any>(query: string, variables: Record<string, any> = {}, token?: string): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(ADMIN_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    });

    const result: GraphQLResponse<T> = await response.json();
    if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL Error: ${JSON.stringify(result.errors, null, 2)}`);
    }
    return result.data as T;
}

async function login(): Promise<string> {
    const loginMutation = `
        mutation Login($username: String!, $password: String!) {
            login(username: $username, password: $password) {
                ... on CurrentUser {
                    id
                    identifier
                }
            }
        }
    `;

    const response = await fetch(ADMIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: loginMutation,
            variables: { username: USERNAME, password: PASSWORD },
        }),
    });

    const token = response.headers.get('vendure-auth-token');
    const body: GraphQLResponse = await response.json();
    if (body.errors || !token) {
        throw new Error(`Login fallido: ${JSON.stringify(body.errors || 'Token no recibido')}`);
    }
    return token;
}

async function configureEcommerceSettings() {
    console.log('🚀 Iniciando configuración de comercio para Ecuador...');
    const token = await login();
    console.log('✅ Autenticación como Superadmin exitosa.');

    // ---------------------------------------------------------
    // 1. CONFIGURACIÓN GLOBAL (Global Settings)
    // ---------------------------------------------------------
    console.log('\n--- 1. Configurando Ajustes Globales (Global Settings) ---');
    const updateGlobalSettingsMutation = `
        mutation UpdateGlobalSettings($input: UpdateGlobalSettingsInput!) {
            updateGlobalSettings(input: $input) {
                ... on GlobalSettings {
                    availableLanguages
                    trackInventory
                    outOfStockThreshold
                }
            }
        }
    `;
    const globalSettingsResult = await executeQuery(
        updateGlobalSettingsMutation,
        {
            input: {
                availableLanguages: ['es', 'en'],
                trackInventory: true,
                outOfStockThreshold: 0,
            },
        },
        token
    );
    console.log('✅ Ajustes Globales actualizados:', globalSettingsResult.updateGlobalSettings);

    // ---------------------------------------------------------
    // 2. ZONAS (Zones)
    // ---------------------------------------------------------
    console.log('\n--- 2. Configurando Zonas Geográficas ---');
    const zonesQuery = `
        query GetZones {
            zones {
                items {
                    id
                    name
                    members {
                        id
                        code
                        name
                    }
                }
            }
        }
    `;
    const zonesData = await executeQuery<{ zones: { items: any[] } }>(zonesQuery, {}, token);
    const existingZones = zonesData.zones.items;

    let ecuadorZone = existingZones.find(z => z.name.toLowerCase() === 'ecuador');
    const ecuadorRegionId = '64'; // EC in DB

    if (!ecuadorZone) {
        console.log('Creando zona dedicada "Ecuador"...');
        const createZoneMutation = `
            mutation CreateZone($input: CreateZoneInput!) {
                createZone(input: $input) {
                    id
                    name
                    members { id code name }
                }
            }
        `;
        const createZoneResult = await executeQuery(
            createZoneMutation,
            {
                input: {
                    name: 'Ecuador',
                    memberIds: [ecuadorRegionId],
                },
            },
            token
        );
        ecuadorZone = createZoneResult.createZone;
        console.log(`✅ Zona "Ecuador" creada con ID: ${ecuadorZone.id}`);
    } else {
        console.log(`Zona "Ecuador" ya existe (ID: ${ecuadorZone.id}). Verificando miembros...`);
        const hasEcuadorMember = ecuadorZone.members.some((m: any) => m.id === ecuadorRegionId || m.code === 'EC');
        if (!hasEcuadorMember) {
            const addMemberMutation = `
                mutation AddMembersToZone($zoneId: ID!, $memberIds: [ID!]!) {
                    addMembersToZone(zoneId: $zoneId, memberIds: $memberIds) {
                        id
                        name
                        members { id code name }
                    }
                }
            `;
            await executeQuery(addMemberMutation, { zoneId: ecuadorZone.id, memberIds: [ecuadorRegionId] }, token);
            console.log('✅ Ecuador añadido a la zona "Ecuador".');
        } else {
            console.log('✅ Ecuador ya es miembro de la zona.');
        }
    }

    // ---------------------------------------------------------
    // 3. CATEGORÍAS DE IMPUESTOS (Tax Categories)
    // ---------------------------------------------------------
    console.log('\n--- 3. Configurando Categorías de Impuestos ---');
    const taxCategoriesQuery = `
        query GetTaxCategories {
            taxCategories {
                items {
                    id
                    name
                    isDefault
                }
            }
        }
    `;
    const taxCategoriesData = await executeQuery<{ taxCategories: { items: any[] } }>(taxCategoriesQuery, {}, token);
    const existingTaxCats = taxCategoriesData.taxCategories.items;

    const updateTaxCatMutation = `
        mutation UpdateTaxCategory($input: UpdateTaxCategoryInput!) {
            updateTaxCategory(input: $input) {
                id
                name
                isDefault
            }
        }
    `;

    // Categoría 1: IVA General (15%) - Predeterminada
    const cat1 = existingTaxCats.find(c => c.id === '1');
    if (cat1) {
        await executeQuery(
            updateTaxCatMutation,
            {
                input: {
                    id: '1',
                    name: 'IVA General (15%)',
                    isDefault: true,
                },
            },
            token
        );
        console.log('✅ Categoría 1 actualizada a: "IVA General (15%)" (Default: true)');
    }

    // Categoría 2: IVA Reducido (5%)
    const cat2 = existingTaxCats.find(c => c.id === '2');
    if (cat2) {
        await executeQuery(
            updateTaxCatMutation,
            {
                input: {
                    id: '2',
                    name: 'IVA Reducido (5%)',
                    isDefault: false,
                },
            },
            token
        );
        console.log('✅ Categoría 2 actualizada a: "IVA Reducido (5%)"');
    }

    // Categoría 3: IVA 0% (Tarifa Cero / Exento)
    const cat3 = existingTaxCats.find(c => c.id === '3');
    if (cat3) {
        await executeQuery(
            updateTaxCatMutation,
            {
                input: {
                    id: '3',
                    name: 'IVA 0% (Tarifa Cero / Exento)',
                    isDefault: false,
                },
            },
            token
        );
        console.log('✅ Categoría 3 actualizada a: "IVA 0% (Tarifa Cero / Exento)"');
    }

    // ---------------------------------------------------------
    // 4. TASAS DE IMPUESTOS (Tax Rates)
    // ---------------------------------------------------------
    console.log('\n--- 4. Configurando Tasas de Impuestos para Ecuador ---');
    const taxRatesQuery = `
        query GetTaxRates {
            taxRates {
                items {
                    id
                    name
                    value
                    enabled
                    category { id name }
                    zone { id name }
                }
            }
        }
    `;
    const taxRatesData = await executeQuery<{ taxRates: { items: any[] } }>(taxRatesQuery, {}, token);
    const existingRates = taxRatesData.taxRates.items;

    const createTaxRateMutation = `
        mutation CreateTaxRate($input: CreateTaxRateInput!) {
            createTaxRate(input: $input) {
                id
                name
                value
                enabled
                category { id name }
                zone { id name }
            }
        }
    `;
    const updateTaxRateMutation = `
        mutation UpdateTaxRate($input: UpdateTaxRateInput!) {
            updateTaxRate(input: $input) {
                id
                name
                value
                enabled
                category { id name }
                zone { id name }
            }
        }
    `;

    // Tasas requeridas para Ecuador
    const ecuadorRates = [
        {
            name: 'IVA Ecuador 15%',
            value: 15.0,
            categoryId: '1',
            enabled: true,
        },
        {
            name: 'IVA Ecuador 0%',
            value: 0.0,
            categoryId: '3',
            enabled: true,
        },
        {
            name: 'IVA Ecuador 5%',
            value: 5.0,
            categoryId: '2',
            enabled: true,
        },
    ];

    for (const targetRate of ecuadorRates) {
        const existing = existingRates.find(
            r => r.zone.id === ecuadorZone.id && r.category.id === targetRate.categoryId
        );
        if (existing) {
            const res = await executeQuery(
                updateTaxRateMutation,
                {
                    input: {
                        id: existing.id,
                        name: targetRate.name,
                        value: targetRate.value,
                        enabled: targetRate.enabled,
                    },
                },
                token
            );
            console.log(`✅ Tasa actualizada para Ecuador: ${res.updateTaxRate.name} = ${res.updateTaxRate.value}%`);
        } else {
            const res = await executeQuery(
                createTaxRateMutation,
                {
                    input: {
                        name: targetRate.name,
                        value: targetRate.value,
                        enabled: targetRate.enabled,
                        categoryId: targetRate.categoryId,
                        zoneId: ecuadorZone.id,
                    },
                },
                token
            );
            console.log(`✅ Tasa creada para Ecuador: ${res.createTaxRate.name} = ${res.createTaxRate.value}%`);
        }
    }

    // Actualizar tasas en la zona de Américas para consistencia
    const americasZone = existingZones.find(z => z.id === '5' || z.name === 'Americas');
    if (americasZone) {
        const rate5 = existingRates.find(r => r.id === '5');
        if (rate5) {
            await executeQuery(
                updateTaxRateMutation,
                {
                    input: {
                        id: '5',
                        name: 'IVA Américas 15%',
                        value: 15.0,
                        enabled: true,
                    },
                },
                token
            );
            console.log('✅ Tasa Américas General ajustada a 15%');
        }
        const rate10 = existingRates.find(r => r.id === '10');
        if (rate10) {
            await executeQuery(
                updateTaxRateMutation,
                {
                    input: {
                        id: '10',
                        name: 'IVA Reducido Américas 5%',
                        value: 5.0,
                        enabled: true,
                    },
                },
                token
            );
            console.log('✅ Tasa Américas Reducido ajustada a 5%');
        }
    }

    // ---------------------------------------------------------
    // 5. PAÍSES (Countries)
    // ---------------------------------------------------------
    console.log('\n--- 5. Configurando Países y Traducciones (Español / Inglés) ---');
    const updateCountryMutation = `
        mutation UpdateCountry($input: UpdateCountryInput!) {
            updateCountry(input: $input) {
                id
                code
                name
                enabled
                translations { id languageCode name }
            }
        }
    `;

    const keyCountries = [
        { id: '64', code: 'EC', esName: 'Ecuador', enName: 'Ecuador' },
        { id: '48', code: 'CO', esName: 'Colombia', enName: 'Colombia' },
        { id: '174', code: 'PE', esName: 'Perú', enName: 'Peru' },
        { id: '235', code: 'US', esName: 'Estados Unidos', enName: 'United States' },
        { id: '44', code: 'CL', esName: 'Chile', enName: 'Chile' },
        { id: '10', code: 'AR', esName: 'Argentina', enName: 'Argentina' },
        { id: '144', code: 'MX', esName: 'México', enName: 'Mexico' },
        { id: '209', code: 'ES', esName: 'España', enName: 'Spain' },
    ];

    for (const c of keyCountries) {
        try {
            const res = await executeQuery(
                updateCountryMutation,
                {
                    input: {
                        id: c.id,
                        enabled: true,
                        translations: [
                            { languageCode: 'es', name: c.esName },
                            { languageCode: 'en', name: c.enName },
                        ],
                    },
                },
                token
            );
            console.log(`✅ País actualizado [${c.code}]: ${c.esName} / ${c.enName}`);
        } catch (err: any) {
            console.warn(`Aviso al actualizar país ${c.code}: ${err.message}`);
        }
    }

    // ---------------------------------------------------------
    // 6. CANALES (Channels)
    // ---------------------------------------------------------
    console.log('\n--- 6. Configurando Canales (Zona de impuestos por defecto: Ecuador) ---');
    const channelsQuery = `
        query GetChannels {
            channels {
                items {
                    id
                    code
                    token
                    defaultLanguageCode
                    defaultCurrencyCode
                    pricesIncludeTax
                    defaultTaxZone { id name }
                    defaultShippingZone { id name }
                }
            }
        }
    `;
    const channelsData = await executeQuery<{ channels: { items: any[] } }>(channelsQuery, {}, token);
    const channelsList = channelsData.channels.items;

    const updateChannelMutation = `
        mutation UpdateChannel($input: UpdateChannelInput!) {
            updateChannel(input: $input) {
                ... on Channel {
                    id
                    code
                    defaultLanguageCode
                    availableLanguageCodes
                    defaultCurrencyCode
                    availableCurrencyCodes
                    pricesIncludeTax
                    defaultTaxZone { id name }
                    defaultShippingZone { id name }
                }
                ... on ErrorResult {
                    errorCode
                    message
                }
            }
        }
    `;

    for (const ch of channelsList) {
        const res = await executeQuery(
            updateChannelMutation,
            {
                input: {
                    id: ch.id,
                    defaultTaxZoneId: ecuadorZone.id,
                    defaultShippingZoneId: ecuadorZone.id,
                    defaultLanguageCode: 'es',
                    availableLanguageCodes: ['es', 'en'],
                    defaultCurrencyCode: 'USD',
                    availableCurrencyCodes: ['USD'],
                    pricesIncludeTax: true,
                },
            },
            token
        );
        if ((res.updateChannel as any).errorCode) {
            console.error(`❌ Error actualizando canal ${ch.code}:`, res.updateChannel);
        } else {
            console.log(`✅ Canal ${ch.code} actualizado:`, {
                defaultTaxZone: res.updateChannel.defaultTaxZone?.name,
                defaultShippingZone: res.updateChannel.defaultShippingZone?.name,
                defaultLanguageCode: res.updateChannel.defaultLanguageCode,
                defaultCurrencyCode: res.updateChannel.defaultCurrencyCode,
                pricesIncludeTax: res.updateChannel.pricesIncludeTax,
            });
        }
    }

    console.log('\n🎉 ¡Toda la configuración de impuestos, zonas, países y ajustes globales se completó con éxito!');
}

configureEcommerceSettings().catch(err => {
    console.error('❌ Error configurando ajustes de comercio:', err);
    process.exit(1);
});
