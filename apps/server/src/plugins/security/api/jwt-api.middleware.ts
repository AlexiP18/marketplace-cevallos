import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { getOperationAST, parse, Kind } from 'graphql';
import { SECURITY_OPTIONS, SecurityOptions } from '../security.options';
import { JwtSessionService } from '../jwt-session.service';

export type JwtRequest = Request & { incomingJwt?: string; incomingSid?: string };

function isAuthenticationRequest(req: Request) {
    try {
        const operation = getOperationAST(parse(req.body?.query || ''), req.body?.operationName);
        return operation?.operation === 'mutation' && operation.selectionSet.selections.every(selection => selection.kind === Kind.FIELD && ['login', 'authenticate', 'logout', 'registerCustomerAccount', 'requestPasswordReset', 'resetPassword', 'verifyCustomerAccount'].includes(selection.name.value));
    } catch { return false; }
}

@Injectable()
export class JwtApiMiddleware implements NestMiddleware {
    constructor(private jwt: JwtSessionService, @Inject(SECURITY_OPTIONS) private options: SecurityOptions) {}
    async use(req: JwtRequest, res: Response, next: NextFunction) {
        const options = this.options;
        res.locals.issueSessionJwt = (issued: string) => this.jwt.issue(issued, req.incomingJwt, req.incomingSid);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        if (options.production) {
            if (!req.secure) { res.redirect(308, `${options.publicOrigin}${req.originalUrl}`); return; }
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        const header = req.headers.authorization;
        if (!header) { next(); return; }
        try {
            const match = /^Bearer (\S+)$/i.exec(header);
            if (!match || header.length > 8192) throw new Error('Token inválido');
            const claims = await this.jwt.verify(match[1]);
            req.incomingJwt = match[1]; req.incomingSid = claims.sid;
            req.headers.authorization = `Bearer ${claims.sid}`;
            next();
        } catch {
            if (isAuthenticationRequest(req)) { delete req.headers.authorization; next(); return; }
            res.status(401).json({ errors: [{ message: 'Tu sesión expiró o ya no es válida. Inicia sesión nuevamente.', extensions: { code: 'UNAUTHENTICATED' } }] });
        }
    }
}
