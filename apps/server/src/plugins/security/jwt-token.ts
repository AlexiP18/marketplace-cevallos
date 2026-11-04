import type { CachedSession } from '@vendure/core';

export class JwtSessionTokens {
    private key: Uint8Array;
    constructor(secret: string) {
        if (Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET debe tener al menos 32 bytes.');
        this.key = new TextEncoder().encode(secret);
    }
    async issue(session: CachedSession) {
        const { SignJWT } = await import('jose');
        const permissions = new Set<string>(session.user?.channelPermissions.flatMap(channel => channel.permissions) || []);
        const role = !session.user ? 'ANONYMOUS' : permissions.has('SuperAdmin') ? 'SUPERADMIN' : permissions.has('UpdateSeller') ? 'ADMINISTRADOR' : permissions.has('ReadProduct') ? 'BODEGUERO' : permissions.has('ManageWarehouseDispatch') ? 'DESPACHADOR' : 'CLIENTE';
        return new SignJWT({ sid: session.token, role })
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuer('vendure-prueba').setAudience('vendure-api')
            .setSubject(session.user ? String(session.user.id) : 'anonymous')
            .setJti(String(session.id)).setIssuedAt()
            .setExpirationTime(Math.min(Math.floor(session.expires.getTime() / 1000), Math.floor(Date.now() / 1000) + 8 * 60 * 60))
            .sign(this.key);
    }
    async verify(token: string) {
        const { jwtVerify } = await import('jose');
        const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], issuer: 'vendure-prueba', audience: 'vendure-api', typ: 'JWT', requiredClaims: ['exp', 'iat', 'sub', 'jti'] });
        if (typeof payload.sid !== 'string' || typeof payload.role !== 'string') throw new Error('Token inválido');
        return payload as typeof payload & { sid: string; role: string };
    }
}
