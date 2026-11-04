import type { VendureConfig } from '@vendure/core';
import type { Response } from 'express';

export function jwtResponsePlugin(header: string): NonNullable<VendureConfig['apiOptions']['apolloServerPlugins']>[number] {
    return {
        async requestDidStart() {
            return { async willSendResponse({ response, contextValue }) {
                const { res } = contextValue as { res: Response };
                const issued = res.getHeader(header);
                if (typeof issued === 'string' && issued && !issued.includes('.')) {
                    const token = await res.locals.issueSessionJwt(issued);
                    res.setHeader(header, token);
                    response.http.headers.set(header, token);
                    response.http.headers.set('cache-control', 'no-store');
                }
                if (response.body.kind === 'single') {
                    const codes = response.body.singleResult.errors?.map(error => error.extensions?.code) || [];
                    if (codes.includes('FORBIDDEN')) response.http.status = 403;
                    else if (codes.includes('UNAUTHORIZED') || codes.includes('UNAUTHENTICATED')) response.http.status = 401;
                }
            } };
        },
    };
}
