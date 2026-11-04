import { Inject, Injectable } from '@nestjs/common';
import { SessionService } from '@vendure/core';
import { JwtSessionTokens } from './jwt-token';
import { SECURITY_OPTIONS, SecurityOptions } from './security.options';

@Injectable()
export class JwtSessionService {
    private tokens: JwtSessionTokens;
    constructor(private sessions: SessionService, @Inject(SECURITY_OPTIONS) options: SecurityOptions) {
        this.tokens = new JwtSessionTokens(options.secret);
    }
    async verify(token: string) {
        const claims = await this.tokens.verify(token);
        const session = await this.sessions.getSessionFromToken(claims.sid);
        if (!session || claims.sub !== (session.user ? String(session.user.id) : 'anonymous') || claims.jti !== String(session.id)) throw new Error('Sesión no vigente');
        return claims;
    }
    async issue(issued: string, incomingJwt?: string, incomingSid?: string) {
        const session = await this.sessions.getSessionFromToken(issued);
        if (!session) throw new Error('No se pudo emitir la sesión.');
        return incomingSid === issued && incomingJwt ? incomingJwt : this.tokens.issue(session);
    }
}
