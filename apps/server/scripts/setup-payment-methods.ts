import 'dotenv/config';

interface GraphQLResponse<T = any> {
    data?: T;
    errors?: Array<{ message: string; [key: string]: any }>;
}

const SERVER_URL = process.env.VENDURE_SERVER_URL || 'http://127.0.0.1:3000';
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

async function main() {
    console.log('--- Iniciando configuración de Métodos de Pago: Payphone y PayPal ---');
    const token = await login();
    console.log('Autenticación superadmin exitosa.');

    // 1. Obtener métodos de pago existentes
    const getPaymentMethodsQuery = `
        query GetPaymentMethods {
            paymentMethods {
                items {
                    id
                    code
                    name
                    enabled
                    handler {
                        code
                    }
                }
            }
        }
    `;
    const pmData = await executeQuery<{ paymentMethods: { items: any[] } }>(getPaymentMethodsQuery, {}, token);
    const existingMethods = pmData.paymentMethods.items;
    console.log(`Métodos existentes (${existingMethods.length}):`, existingMethods.map(m => `${m.code} (${m.name})`));

    // 2. Obtener todos los canales
    const getChannelsQuery = `
        query GetChannels {
            channels {
                items {
                    id
                    code
                    token
                }
            }
        }
    `;
    const chData = await executeQuery<{ channels: { items: any[] } }>(getChannelsQuery, {}, token);
    const channels = chData.channels.items;
    console.log(`Canales disponibles (${channels.length}):`, channels.map(c => `${c.id}: ${c.code}`));

    const paymentMethodConfigs = [
        {
            code: 'payphone',
            translations: [
                {
                    languageCode: 'es',
                    name: 'Payphone (Tarjetas y Saldo)',
                    description: 'Pago local con tarjetas de crédito/débito nacionales o saldo Payphone en Ecuador.',
                },
                {
                    languageCode: 'en',
                    name: 'Payphone (Credit/Debit Cards & Balance)',
                    description: 'Local payment for Ecuador with credit/debit cards and Payphone balance.',
                },
            ],
            handlerCode: 'payphone-payment-handler',
            arguments: [
                { name: 'token', value: process.env.PAYPHONE_TOKEN || '' },
                { name: 'environment', value: process.env.PAYPHONE_ENV || 'sandbox' },
            ],
        },
        {
            code: 'paypal',
            translations: [
                {
                    languageCode: 'es',
                    name: 'PayPal (Internacional y Tarjetas)',
                    description: 'Pago seguro con cuenta PayPal o tarjetas internacionales en USD.',
                },
                {
                    languageCode: 'en',
                    name: 'PayPal (International & Cards)',
                    description: 'Secure international payment via PayPal account or cards in USD.',
                },
            ],
            handlerCode: 'paypal-payment-handler',
            arguments: [
                { name: 'clientId', value: process.env.PAYPAL_CLIENT_ID || '' },
                { name: 'clientSecret', value: process.env.PAYPAL_CLIENT_SECRET || '' },
                { name: 'environment', value: process.env.PAYPAL_MODE || 'sandbox' },
            ],
        },
    ];

    const configuredMethodIds: string[] = [];

    const createPaymentMethodMutation = `
        mutation CreatePaymentMethod($input: CreatePaymentMethodInput!) {
            createPaymentMethod(input: $input) {
                id
                code
                name
                enabled
                handler {
                    code
                }
            }
        }
    `;

    const updatePaymentMethodMutation = `
        mutation UpdatePaymentMethod($input: UpdatePaymentMethodInput!) {
            updatePaymentMethod(input: $input) {
                id
                code
                name
                enabled
                handler {
                    code
                }
            }
        }
    `;

    for (const config of paymentMethodConfigs) {
        const existing = existingMethods.find(m => m.code === config.code);
        if (existing) {
            console.log(`Método "${config.code}" ya existe con ID ${existing.id}. Actualizando configuración...`);
            try {
                const updateRes = await executeQuery(updatePaymentMethodMutation, {
                    input: {
                        id: existing.id,
                        enabled: true,
                        handler: {
                            code: config.handlerCode,
                            arguments: config.arguments,
                        },
                        translations: config.translations,
                    },
                }, token);
                console.log(`Método "${config.code}" actualizado con éxito:`, updateRes.updatePaymentMethod.id);
                configuredMethodIds.push(existing.id);
            } catch (err: any) {
                console.error(`Error actualizando "${config.code}":`, err.message);
                configuredMethodIds.push(existing.id);
            }
        } else {
            console.log(`Creando método "${config.code}"...`);
            const createRes = await executeQuery(createPaymentMethodMutation, {
                input: {
                    code: config.code,
                    enabled: true,
                    handler: {
                        code: config.handlerCode,
                        arguments: config.arguments,
                    },
                    translations: config.translations,
                },
            }, token);
            const created = createRes.createPaymentMethod;
            console.log(`Método "${config.code}" creado con éxito con ID: ${created.id}`);
            configuredMethodIds.push(created.id);
        }
    }

    // 3. Asignar métodos a todos los canales
    const assignPaymentMethodsMutation = `
        mutation AssignPaymentMethodsToChannel($input: AssignPaymentMethodsToChannelInput!) {
            assignPaymentMethodsToChannel(input: $input) {
                id
                code
            }
        }
    `;

    for (const channel of channels) {
        if (channel.id === '1') {
            // El default channel ya los tiene por defecto al ser creados en el contexto raíz
            continue;
        }
        try {
            console.log(`Asignando métodos ${JSON.stringify(configuredMethodIds)} al canal ${channel.code} (ID: ${channel.id})...`);
            await executeQuery(assignPaymentMethodsMutation, {
                input: {
                    channelId: channel.id,
                    paymentMethodIds: configuredMethodIds,
                },
            }, token);
            console.log(`Asignación completada para el canal ${channel.code}.`);
        } catch (err: any) {
            console.warn(`Aviso al asignar a canal ${channel.code}:`, err.message);
        }
    }

    console.log('--- Configuración de métodos de pago finalizada exitosamente ---');
}

main().catch(err => {
    console.error('Error durante la configuración:', err);
    process.exit(1);
});
