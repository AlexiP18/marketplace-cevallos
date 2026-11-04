import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigService, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { JwtApiMiddleware } from './api/jwt-api.middleware';
import { jwtResponsePlugin } from './api/jwt-response.plugin';
import { JwtSessionService } from './jwt-session.service';
import { JwtSessionTokens } from './jwt-token';
import { SECURITY_OPTIONS, SecurityOptions } from './security.options';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [JwtApiMiddleware, JwtSessionService, { provide: SECURITY_OPTIONS, useFactory: () => SecurityPlugin.options }],
    configuration: config => {
        config.authOptions.tokenMethod = 'bearer';
        config.apiOptions.apolloServerPlugins.push(jwtResponsePlugin(config.authOptions.authTokenHeaderKey));
        return config;
    },
    compatibility: '^3.7.0',
})
export class SecurityPlugin implements NestModule {
    constructor(private config: ConfigService) {}
    configure(consumer: MiddlewareConsumer) {
        const { adminApiPath, shopApiPath } = this.config.apiOptions;
        consumer.apply(JwtApiMiddleware).forRoutes(adminApiPath, shopApiPath);
    }
    static options: SecurityOptions;
    static init(options: SecurityOptions) {
        if (options.production && (!options.publicOrigin || new URL(options.publicOrigin).protocol !== 'https:')) throw new Error('PUBLIC_API_ORIGIN debe indicar el origen HTTPS de producción.');
        if (options.publicOrigin) options.publicOrigin = new URL(options.publicOrigin).origin;
        new JwtSessionTokens(options.secret);
        this.options = options;
        return SecurityPlugin;
    }
}
