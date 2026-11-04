import {
    dummyPaymentHandler,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
    LanguageCode,
    BcryptPasswordHashingStrategy,
    DefaultPasswordValidationStrategy,
    configureDefaultOrderProcess,
    defaultPaymentProcess,
    DefaultProductVariantPriceUpdateStrategy,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import { MultivendorPlugin } from './plugins/multivendor';
import { FootwearCatalogPlugin } from './plugins/footwear-catalog/footwear-catalog.plugin';
import { FootwearSearchStrategy } from './plugins/footwear-catalog/footwear-search.strategy';
import { LabelingPlugin } from './plugins/labeling/labeling.plugin';
import { StatisticsPlugin } from './plugins/statistics/statistics.plugin';
import { WarehousePlugin } from './plugins/warehouse/warehouse.plugin';
import { SecurityPlugin } from './plugins/security/security.plugin';
import { BullMQJobQueuePlugin } from '@vendure/job-queue-plugin/package/bullmq';
import { MarketplacePlugin } from './plugins/marketplace/marketplace.plugin';
import { MarketplaceAllocationStrategy, MarketplaceSellerStrategy, marketplaceOrderProcess, marketplacePaymentProcess } from './plugins/marketplace/marketplace-strategies';
import { warehouseFulfillmentProcess } from './plugins/warehouse/warehouse-fulfillment-process';
import { WarehouseStockLocationStrategy } from './plugins/warehouse/warehouse-stock-location-strategy';
import { payphonePaymentHandler, paypalPaymentHandler } from './plugins/payments';
import 'dotenv/config';
import path from 'path';

const IS_DEV = process.env.APP_ENV === 'dev';
const configuredOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean) || [];
if (!IS_DEV && (configuredOrigins.some(origin => new URL(origin).protocol !== 'https:') || !configuredOrigins.length)) throw new Error('CORS_ORIGINS debe contener los orígenes HTTPS permitidos en producción.');
if (!IS_DEV && (!process.env.SUPERADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD === 'superadmin')) throw new Error('Configura una contraseña propia de superadministrador antes de iniciar producción.');
// PORT wins because hosting platforms inject it into the environment at runtime, and that
// must take precedence over any value baked into the .env file at scaffold time.
const serverPort = +process.env.PORT || +process.env.VENDURE_SERVER_PORT || 3000;
const redis = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6479), password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: null, enableAutoPipelining: true };
const queuePrefix = process.env.REDIS_PREFIX || 'vendure-prueba';
export const marketplaceWorkerRole = (process.env.MARKETPLACE_WORKER_ROLE || 'all') as 'all'|'admission'|'general';
const privateFiles = process.env.PRIVATE_JOB_FILES_PATH || path.join(__dirname, '../static/private-jobs');
if (!IS_DEV && !redis.password) throw new Error('Configura REDIS_PASSWORD en producción.');

export const config: VendureConfig = {
    defaultLanguageCode: LanguageCode.es,
    apiOptions: {
        hostname: process.env.VENDURE_BIND_ADDRESS || (IS_DEV ? undefined : '127.0.0.1'),
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
        // Which browser origins may make credentialed requests to the Shop and Admin APIs.
        // In development only the local dashboard/storefront origins are allowed. In production set
        // CORS_ORIGINS to a comma-separated list of the origins you serve, for example
        // "https://example.com,https://admin.example.com". An unset value blocks all
        // cross-origin browser requests, which is the safe default.
        cors: {
            origin: configuredOrigins.length ? configuredOrigins : (IS_DEV ? ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000'] : []),
            credentials: true,
        },
        csrfPrevention: true,
        // The following options are useful in development mode,
        // but are best turned off for production for security
        // reasons.
        ...(IS_DEV ? {
            adminApiDebug: true,
            shopApiDebug: true,
        } : {}),
    },
    authOptions: {
        tokenMethod: 'bearer',
        sessionDuration: '8h',
        passwordHashingStrategy: new BcryptPasswordHashingStrategy(),
        passwordValidationStrategy: new DefaultPasswordValidationStrategy({ minLength: 8, maxLength: 72 }),
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
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
        paymentMethodHandlers: [...(IS_DEV ? [dummyPaymentHandler] : []), payphonePaymentHandler, paypalPaymentHandler],
        process: [defaultPaymentProcess, marketplacePaymentProcess],
    },
    catalogOptions: {
        stockLocationStrategy: new WarehouseStockLocationStrategy(),
        productVariantPriceUpdateStrategy: new DefaultProductVariantPriceUpdateStrategy({ syncPricesAcrossChannels: true }),
    },
    orderOptions: {
        orderSellerStrategy: new MarketplaceSellerStrategy(),
        stockAllocationStrategy: new MarketplaceAllocationStrategy(),
        process: [configureDefaultOrderProcess({ arrangingPaymentRequiresStock: false }), marketplaceOrderProcess],
    },
    shippingOptions: {
        customFulfillmentProcess: [warehouseFulfillmentProcess],
    },

    plugins: [
        SecurityPlugin.init({ secret: process.env.JWT_SECRET || '', production: !IS_DEV, publicOrigin: process.env.PUBLIC_API_ORIGIN }),
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            // For local dev, the correct value for assetUrlPrefix should
            // be guessed correctly, but for production it will usually need
            // to be set manually to match your production url.
            assetUrlPrefix: process.env.ASSET_URL_PREFIX || `${IS_DEV ? `http://localhost:${serverPort}` : process.env.PUBLIC_API_ORIGIN}/assets/`,
        }),
        DefaultSchedulerPlugin.init(),
        BullMQJobQueuePlugin.init({ connection: redis, concurrency: 1, queueOptions: { prefix: queuePrefix }, workerOptions: { prefix: queuePrefix } }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true, searchStrategy: new FootwearSearchStrategy() }),
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
        FootwearCatalogPlugin,
        MultivendorPlugin.init({
            autoApproveSellers: false,
        }),
        LabelingPlugin.init({ privateFiles, assets: path.join(__dirname, '../static/assets') }),
        StatisticsPlugin.init({ privateFiles }),
        WarehousePlugin,
        MarketplacePlugin.init({ workerRole: marketplaceWorkerRole, redis, privateFiles, apiOrigin: IS_DEV ? `http://localhost:${serverPort}` : process.env.PUBLIC_API_ORIGIN!, queuePrefix, reservationTtlMinutes: Number(process.env.RESERVATION_TTL_MINUTES || 45) }),
    ],
};
