import assert from 'node:assert/strict';
import { bootstrap } from '@vendure/core';
import { config } from '../src/vendure-config';

async function main() {
    config.apiOptions.port = 0;
    const app = await bootstrap(config);
    try {
        const address = app.getHttpServer().address();
        const url = `http://127.0.0.1:${address.port}/admin-api`;
        const request = async (query: string, token?: string, variables?: object) => {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Apollo-Require-Preflight': 'true', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query, variables }) });
            return { response, body: await response.json() as any };
        };
        const login = await request('mutation Login($username: String!, $password: String!) { login(username: $username, password: $password) { __typename } }', undefined, { username: process.env.SUPERADMIN_USERNAME, password: process.env.SUPERADMIN_PASSWORD });
        assert.equal(login.body.data?.login?.__typename, 'CurrentUser');
        const token = login.response.headers.get('vendure-auth-token') || '';
        assert.equal(token.split('.').length, 3, 'El login debe emitir JWT');
        const profile = await request('{ activeAdministrator { id } }', token);
        assert.ok(profile.body.data?.activeAdministrator?.id, 'El JWT debe autorizar la consulta');
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        assert.equal(claims.role, 'SUPERADMIN');
        assert.equal((await request('{ activeAdministrator { id } }', claims.sid)).response.status, 401, 'El token interno no debe permitir eludir JWT');
        const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
        assert.equal((await request('{ activeAdministrator { id } }', tampered)).response.status, 401);
        assert.equal((await request('mutation { logout { success } }', token)).body.data?.logout?.success, true);
        assert.equal((await request('{ activeAdministrator { id } }', token)).response.status, 401, 'El logout debe revocar el JWT');
        assert.equal((await request('{ administrators { totalItems } }')).response.status, 403, 'Los recursos protegidos deben rechazar acceso sin permisos');
        const injection = await request('mutation Login($username: String!, $password: String!) { login(username: $username, password: $password) { __typename } }', undefined, { username: "' OR 1=1 --", password: 'invalid-password' });
        assert.notEqual(injection.body.data?.login?.__typename, 'CurrentUser');
        const shopUrl = url.replace('/admin-api', '/shop-api');
        const cart = await fetch(shopUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Apollo-Require-Preflight': 'true' }, body: JSON.stringify({ query: '{ activeOrder { id } }' }) });
        const anonymousToken = cart.headers.get('vendure-auth-token') || '';
        assert.equal(anonymousToken.split('.').length, 3, 'El carrito anónimo también debe emitir JWT');
        const anonymousLogout = await fetch(shopUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonymousToken}` }, body: JSON.stringify({ query: 'mutation { logout { success } }' }) });
        assert.equal((await anonymousLogout.json() as any).data?.logout?.success, true);
        console.log('JWT login, firma, acceso, bloqueo del token interno y revocación: correctos.');
    } finally { await app.close(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
