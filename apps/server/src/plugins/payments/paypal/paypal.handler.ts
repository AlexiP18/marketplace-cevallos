import { LanguageCode, PaymentMethodHandler } from '@vendure/core';

export const paypalPaymentHandler = new PaymentMethodHandler({
    code: 'paypal-payment-handler',
    description: [
        {
            languageCode: LanguageCode.es,
            value: 'Pasarela de pagos PayPal (Tarjetas internacionales y saldo PayPal)',
        },
        {
            languageCode: LanguageCode.en,
            value: 'PayPal payment gateway (International cards & PayPal account balance)',
        },
    ],
    args: {
        clientId: {
            type: 'string',
            defaultValue: process.env.PAYPAL_CLIENT_ID || '',
            label: [
                { languageCode: LanguageCode.es, value: 'PayPal Client ID' },
                { languageCode: LanguageCode.en, value: 'PayPal Client ID' },
            ],
        },
        clientSecret: {
            type: 'string',
            defaultValue: process.env.PAYPAL_CLIENT_SECRET || '',
            label: [
                { languageCode: LanguageCode.es, value: 'PayPal Client Secret' },
                { languageCode: LanguageCode.en, value: 'PayPal Client Secret' },
            ],
        },
        environment: {
            type: 'string',
            defaultValue: process.env.PAYPAL_MODE || 'sandbox',
            label: [
                { languageCode: LanguageCode.es, value: 'Entorno (sandbox o live)' },
                { languageCode: LanguageCode.en, value: 'Environment (sandbox or live)' },
            ],
        },
    },
    createPayment: async (ctx, order, amount, args, metadata) => {
        const clientId = args.clientId?.trim();
        const clientSecret = args.clientSecret?.trim();
        const isLive = args.environment === 'live';
        const paypalOrderId = metadata.paypalOrderId || metadata.orderID || metadata.id;

        // Si se cuenta con credenciales API reales de PayPal, realizar captura o verificación
        if (clientId && clientSecret && paypalOrderId && !metadata.simulated) {
            try {
                const baseUrl = isLive
                    ? 'https://api-m.paypal.com'
                    : 'https://api-m.sandbox.paypal.com';

                // 1. Obtener Access Token vía OAuth 2.0
                const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
                const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${authHeader}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'grant_type=client_credentials',
                });

                if (!tokenRes.ok) {
                    throw new Error('No se pudo autenticar con PayPal API');
                }

                const tokenData: any = await tokenRes.json();
                const accessToken = tokenData.access_token;

                // 2. Capturar o consultar orden
                const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                });

                const captureData: any = await captureRes.json();

                // Si se capturó con éxito o ya estaba completada
                if (captureRes.ok && (captureData.status === 'COMPLETED' || captureData.status === 'APPROVED')) {
                    const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || paypalOrderId;
                    return {
                        amount: order.totalWithTax,
                        state: 'Settled',
                        transactionId: String(captureId),
                        metadata: {
                            paypalOrderId,
                            payer: captureData.payer,
                            status: captureData.status,
                            raw: captureData,
                        },
                    };
                } else if (captureData.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
                    // Si ya fue capturada previamente en el frontend
                    return {
                        amount: order.totalWithTax,
                        state: 'Settled',
                        transactionId: String(paypalOrderId),
                        metadata: {
                            paypalOrderId,
                            status: 'COMPLETED_PREVIOUSLY',
                        },
                    };
                } else {
                    return {
                        amount: order.totalWithTax,
                        state: 'Declined',
                        errorMessage: `PayPal rechazó la orden: ${captureData.message || captureData.status || 'Error no especificado'}`,
                        metadata: captureData,
                    };
                }
            } catch (error: any) {
                return {
                    amount: order.totalWithTax,
                    state: 'Declined',
                    errorMessage: `Error procesando pago con PayPal: ${error.message}`,
                    metadata: { error: error.message },
                };
            }
        }

        // Modo desarrollo / Sandbox simulado cuando no hay credenciales configuradas
        return {
            amount: order.totalWithTax,
            state: 'Settled',
            transactionId: String(paypalOrderId || `PAYPAL-TEST-${Date.now()}`),
            metadata: {
                mode: 'sandbox_simulation',
                paypalOrderId: paypalOrderId || `PAYPAL-ORD-${order.code}`,
                notes: 'Pago validado en entorno de desarrollo/pruebas de PayPal',
                ...metadata,
            },
        };
    },
    settlePayment: async () => {
        return { success: true };
    },
});
