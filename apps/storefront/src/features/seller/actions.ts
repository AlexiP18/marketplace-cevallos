'use server';

import { RegisterSellerInput, RegisterSellerResult } from './types';
import { REGISTER_SELLER_MUTATION } from './graphql';

const VENDURE_SHOP_API_URL =
    process.env.VENDURE_SHOP_API_URL ||
    process.env.NEXT_PUBLIC_VENDURE_SHOP_API_URL ||
    'http://localhost:3000/shop-api';
const VENDURE_CHANNEL_TOKEN =
    process.env.VENDURE_CHANNEL_TOKEN ||
    process.env.NEXT_PUBLIC_VENDURE_CHANNEL_TOKEN ||
    '__default_channel__';

export async function registerSellerAction(input: RegisterSellerInput): Promise<RegisterSellerResult> {
    try {
        const response = await fetch(VENDURE_SHOP_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'vendure-token': VENDURE_CHANNEL_TOKEN,
            },
            body: JSON.stringify({
                query: REGISTER_SELLER_MUTATION,
                variables: { input },
            }),
            cache: 'no-store',
        });

        if (!response.ok) {
            const text = await response.text();
            return {
                success: false,
                message: `Error de servidor HTTP (${response.status}): ${text.substring(0, 100)}`,
                error: `Error al conectar con la plataforma (${response.status}).`,
            };
        }

        const json = await response.json();

        if (json.errors && json.errors.length > 0) {
            const errorMsg = json.errors.map((e: { message: string }) => e.message).join(', ');
            return {
                success: false,
                message: errorMsg,
                error: errorMsg,
            };
        }

        const result = json.data?.registerSeller;
        if (!result) {
            return {
                success: false,
                message: 'No se obtuvo respuesta de registro.',
                error: 'No se recibió respuesta válida del servidor.',
            };
        }

        return {
            success: result.success,
            message: result.message,
            profile: result.profile,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado al conectar con el servidor.';
        return {
            success: false,
            message,
            error: message,
        };
    }
}
