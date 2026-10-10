import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
    LanguageCode,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import { MultivendorPlugin } from './plugins/multivendor';
import { payphonePaymentHandler, paypalPaymentHandler } from './plugins/payments';
import 'dotenv/config';
import path from 'path';

const IS_DEV = process.env.APP_ENV === 'dev';
// PORT wins because hosting platforms inject it into the environment at runtime, and that
// must take precedence over any value baked into the .env file at scaffold time.
const serverPort = +process.env.PORT || +process.env.VENDURE_SERVER_PORT || 3000;

export const config: VendureConfig = {
    defaultLanguageCode: LanguageCode.es,
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        // Which browser origins may make credentialed requests to the Shop and Admin APIs.
        // In dev any origin is reflected, so a storefront on any port works. In production set
        // CORS_ORIGINS to a comma-separated list of the origins you serve, for example
        // "https://example.com,https://admin.example.com". An unset value blocks all
        // cross-origin browser requests, which is the safe default.
        cors: {
            origin: IS_DEV ? true : (process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? []),
            credentials: true,
        },
        // The following options are useful in development mode,
        // but are best turned off for production for security
        // reasons.
        ...(IS_DEV ? {
            adminApiDebug: true,
            shopApiDebug: true,
        } : {}),
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
          secret: process.env.COOKIE_SECRET,
        },
    },
    dbConnectionOptions: {
        type: 'postgres',
        // See the README.md "Migrations" section for an explanation of
        // the `synchronize` and `migrations` options.
        synchronize: false,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,
        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA,
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
    },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler, payphonePaymentHandler, paypalPaymentHandler],
    },
    customFields: {
        Product: [
            {
                name: 'genero',
                type: 'string',
                options: [
                    { value: 'Hombre', label: [{ languageCode: LanguageCode.en, value: 'Hombre' }, { languageCode: LanguageCode.es, value: 'Hombre' }] },
                    { value: 'Mujer', label: [{ languageCode: LanguageCode.en, value: 'Mujer' }, { languageCode: LanguageCode.es, value: 'Mujer' }] },
                    { value: 'Unisex', label: [{ languageCode: LanguageCode.en, value: 'Unisex' }, { languageCode: LanguageCode.es, value: 'Unisex' }] },
                ],
                nullable: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Género' },
                    { languageCode: LanguageCode.es, value: 'Género' },
                ],
            },
            {
                name: 'tipo',
                type: 'string',
                options: [
                    { value: 'Hombre', label: [{ languageCode: LanguageCode.en, value: 'Hombre' }, { languageCode: LanguageCode.es, value: 'Hombre' }] },
                    { value: 'Mujer', label: [{ languageCode: LanguageCode.en, value: 'Mujer' }, { languageCode: LanguageCode.es, value: 'Mujer' }] },
                    { value: 'Nino', label: [{ languageCode: LanguageCode.en, value: 'Niño' }, { languageCode: LanguageCode.es, value: 'Niño' }] },
                    { value: 'Infantil', label: [{ languageCode: LanguageCode.en, value: 'Infantil' }, { languageCode: LanguageCode.es, value: 'Infantil' }] },
                ],
                nullable: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Tipo' },
                    { languageCode: LanguageCode.es, value: 'Tipo' },
                ],
            },
            {
                name: 'estilo',
                type: 'string',
                ui: { component: 'dependent-estilo-input' },
                options: [
                    { value: 'Zapatillas', label: [{ languageCode: LanguageCode.en, value: 'Zapatillas' }, { languageCode: LanguageCode.es, value: 'Zapatillas' }] },
                    { value: 'Casual', label: [{ languageCode: LanguageCode.en, value: 'Casual' }, { languageCode: LanguageCode.es, value: 'Casual' }] },
                    { value: 'Urbano', label: [{ languageCode: LanguageCode.en, value: 'Urbano' }, { languageCode: LanguageCode.es, value: 'Urbano' }] },
                    { value: 'Botas', label: [{ languageCode: LanguageCode.en, value: 'Botas' }, { languageCode: LanguageCode.es, value: 'Botas' }] },
                    { value: 'Sandalias', label: [{ languageCode: LanguageCode.en, value: 'Sandalias' }, { languageCode: LanguageCode.es, value: 'Sandalias' }] },
                    { value: 'Tacones', label: [{ languageCode: LanguageCode.en, value: 'Tacones' }, { languageCode: LanguageCode.es, value: 'Tacones' }] },
                    { value: 'Flats', label: [{ languageCode: LanguageCode.en, value: 'Flats' }, { languageCode: LanguageCode.es, value: 'Flats' }] },
                    { value: 'Botas_Botines', label: [{ languageCode: LanguageCode.en, value: 'Botas / Botines' }, { languageCode: LanguageCode.es, value: 'Botas / Botines' }] },
                    { value: 'Escolares', label: [{ languageCode: LanguageCode.en, value: 'Escolares' }, { languageCode: LanguageCode.es, value: 'Escolares' }] },
                    { value: 'Bebes', label: [{ languageCode: LanguageCode.en, value: 'Bebés' }, { languageCode: LanguageCode.es, value: 'Bebés' }] },
                    { value: 'Primeros_Pasos', label: [{ languageCode: LanguageCode.en, value: 'Primeros pasos' }, { languageCode: LanguageCode.es, value: 'Primeros pasos' }] },
                ],
                nullable: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Estilo' },
                    { languageCode: LanguageCode.es, value: 'Estilo' },
                ],
            },
            {
                name: 'suela',
                type: 'string',
                list: true,
                ui: { component: 'suela-multi-input' },
                options: [
                    { value: 'PVC', label: [{ languageCode: LanguageCode.en, value: 'PVC' }] },
                    { value: 'TR', label: [{ languageCode: LanguageCode.en, value: 'TR' }] },
                    { value: 'Caucho', label: [{ languageCode: LanguageCode.en, value: 'Caucho' }] },
                    { value: 'EVA', label: [{ languageCode: LanguageCode.en, value: 'EVA' }] },
                ],
                nullable: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Suela (Material)' },
                    { languageCode: LanguageCode.es, value: 'Suela (Material)' },
                ],
            },
            {
                name: 'capellada',
                type: 'string',
                list: true,
                ui: { component: 'capellada-multi-input' },
                options: [
                    { value: 'Cuero', label: [{ languageCode: LanguageCode.en, value: 'Cuero' }, { languageCode: LanguageCode.es, value: 'Cuero' }] },
                    { value: 'Sintetico', label: [{ languageCode: LanguageCode.en, value: 'Sintético' }, { languageCode: LanguageCode.es, value: 'Sintético' }] },
                ],
                nullable: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Capellada (Material)' },
                    { languageCode: LanguageCode.es, value: 'Capellada (Material)' },
                ],
            },
            {
                name: 'rangoTallas',
                type: 'string',
                list: true,
                ui: { component: 'rango-tallas-multi-input' },
                options: [
                    { value: 'Pequeno_21_26', label: [{ languageCode: LanguageCode.en, value: 'Pequeño (21-26)' }, { languageCode: LanguageCode.es, value: 'Pequeño (21-26)' }] },
                    { value: 'Mediano_27_36', label: [{ languageCode: LanguageCode.en, value: 'Mediano (27-36)' }, { languageCode: LanguageCode.es, value: 'Mediano (27-36)' }] },
                    { value: 'Grande_37_45', label: [{ languageCode: LanguageCode.en, value: 'Grande (37-45)' }, { languageCode: LanguageCode.es, value: 'Grande (37-45)' }] },
                ],
                nullable: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Rango de Tallas' },
                    { languageCode: LanguageCode.es, value: 'Rango de Tallas' },
                ],
            },
        ],
    },
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // For local dev, the correct value for assetUrlPrefix should
            // be guessed correctly, but for production it will usually need
            // to be set manually to match your production url.
            assetUrlPrefix: IS_DEV ? undefined : 'https://www.my-shop.com/assets/',
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        EmailPlugin.init({
            devMode: true,
            outputPath: path.join(__dirname, '../static/email/test-emails'),
            route: 'mailbox',
            handlers: defaultEmailHandlers,
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: {
                // The following variables will change depending on your storefront implementation.
                // Here we are assuming a storefront running at http://localhost:8080.
                fromAddress: '"example" <noreply@example.com>',
                verifyEmailAddressUrl: 'http://localhost:8080/verify',
                passwordResetUrl: 'http://localhost:8080/password-reset',
                changeEmailAddressUrl: 'http://localhost:8080/verify-email-address-change'
            },
        }),
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: IS_DEV
                ? path.join(__dirname, '../dist/dashboard')
                : path.join(__dirname, 'dashboard'),
        }),
        MultivendorPlugin.init({
            autoApproveSellers: false,
        }),
    ],
};
