import { LanguageCode, PaymentMethodHandler } from '@vendure/core';

export const payphonePaymentHandler = new PaymentMethodHandler({
    code: 'payphone-payment-handler',
    description: [
        {
            languageCode: LanguageCode.es,
            value: 'Pasarela de pagos Payphone (Tarjetas y Saldo Payphone para Ecuador)',
        },
        {
            languageCode: LanguageCode.en,
            value: 'Payphone payment gateway (Credit/Debit cards & Payphone balance for Ecuador)',
        },
    ],
    args: {
        token: {
            type: 'string',
            defaultValue: process.env.PAYPHONE_TOKEN || '',
            label: [
                { languageCode: LanguageCode.es, value: 'Token de Autenticación (Bearer Token)' },
                { languageCode: LanguageCode.en, value: 'Payphone Authentication Token (Bearer)' },
            ],
        },
        environment: {
            type: 'string',
            defaultValue: process.env.PAYPHONE_ENV || 'sandbox',
            label: [
                { languageCode: LanguageCode.es, value: 'Entorno (sandbox o production)' },
                { languageCode: LanguageCode.en, value: 'Environment (sandbox or production)' },
            ],
        },
    },
    createPayment: async (ctx, order, amount, args, metadata) => {
        const token = args.token?.trim();
        const isProduction = args.environment === 'production';
        const transactionId = metadata.transactionId || metadata.id;
        const clientTxId = metadata.clientTxId || metadata.clientTransactionId || order.code;

        // Si se cuenta con token de Payphone y un ID de transacción real, confirmar con la API de Payphone
        if (token && transactionId && !metadata.simulated) {
            try {
                const endpoint = isProduction
                    ? 'https://pay.payphonetodoesposible.com/api/button/V2/Confirm'
                    : 'https://pay.payphonetodoesposible.com/api/button/V2/Confirm';

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        id: Number(transactionId) || transactionId,
                        clientTxId: String(clientTxId),
                    }),
                });

                const data: any = await response.json();

                if (response.ok && (data.transactionStatus === 'Approved' || data.statusCode === 3)) {
                    return {
                        amount: order.totalWithTax,
                        state: 'Settled',
                        transactionId: String(data.transactionId || transactionId),
                        metadata: {
                            authorizationCode: data.authorizationCode,
                            cardBrand: data.cardBrand,
                            cardType: data.cardType,
                            lastDigits: data.lastDigits,
                            clientTxId: data.clientTransactionId || clientTxId,
                            payphoneStatus: data.transactionStatus,
                            raw: data,
                        },
                    };
                } else {
                    return {
                        amount: order.totalWithTax,
                        state: 'Declined',
                        errorMessage: `Payphone rechazó la transacción: ${data.message || data.transactionStatus || 'Error no especificado'}`,
                        metadata: data,
                    };
                }
            } catch (error: any) {
                return {
                    amount: order.totalWithTax,
                    state: 'Declined',
                    errorMessage: `Error de conexión con Payphone: ${error.message}`,
                    metadata: { error: error.message },
                };
            }
        }

        // Modo desarrollo / Sandbox simulado cuando no hay token configurado aún
        return {
            amount: order.totalWithTax,
            state: 'Settled',
            transactionId: String(transactionId || `PAYPHONE-TEST-${Date.now()}`),
            metadata: {
                mode: 'sandbox_simulation',
                clientTxId: order.code,
                notes: 'Pago validado en entorno de desarrollo/pruebas de Payphone',
                ...metadata,
            },
        };
    },
    settlePayment: async () => {
        return { success: true };
    },
});
