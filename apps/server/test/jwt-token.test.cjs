const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JwtSessionTokens } = require('../src/plugins/security/jwt-token');
const { BcryptPasswordHashingStrategy } = require('@vendure/core');
const { JwtApiMiddleware } = require('../src/plugins/security/api/jwt-api.middleware');
const { SecurityPlugin } = require('../src/plugins/security/security.plugin');
const { JwtSessionService } = require('../src/plugins/security/jwt-session.service');
const secret = 'testing-only-a-strong-secret-with-48-characters-12345';
test('JWT contiene identidad y rol y rechaza firma o expiración incorrectas', async () => {
    const tokens = new JwtSessionTokens(secret);
    const session = { id: 1, token: 'internal-session', expires: new Date(Date.now() + 3600000), user: { id: 9, channelPermissions: [{ permissions: ['ReadProduct'] }] } };
    const token = await tokens.issue(session);
    const claims = await tokens.verify(token);
    assert.equal(claims.sub, '9'); assert.equal(claims.role, 'BODEGUERO');
    await assert.rejects(new JwtSessionTokens('different-secret-with-at-least-32-bytes').verify(token));
    await assert.rejects(tokens.verify(await tokens.issue({ ...session, expires: new Date(Date.now() - 10000) })));
    await assert.rejects(tokens.verify('eyJhbGciOiJub25lIn0.e30.'));
    assert.throws(() => new JwtSessionTokens('short'));
});
test('las contraseñas usan bcrypt con coste mínimo 10 y no se guardan en claro', async () => {
    const hashing = new BcryptPasswordHashingStrategy();
    const hash = await hashing.hash('Password-for-test-only');
    assert.notEqual(hash, 'Password-for-test-only');
    assert.ok(Number(hash.split('$')[2]) >= 10);
    assert.equal(await hashing.check('Password-for-test-only', hash), true);
    assert.equal(await hashing.check('incorrect', hash), false);
});
test('producción redirige HTTP al origen HTTPS configurado y permite recuperar el login', async () => {
    const options = { secret, production: true, publicOrigin: 'https://api.example.com' };
    SecurityPlugin.init(options);
    const middleware = new JwtApiMiddleware(new JwtSessionService({}, options), options);
    let redirected, status, next = false;
    const response = { locals: {}, setHeader() {}, redirect(code, url) { redirected = [code, url]; }, status(code) { status = code; return this; }, json() {} };
    await middleware.use({ secure: false, originalUrl: '/admin-api', headers: { host: 'evil.example' } }, response, () => { next = true; });
    assert.deepEqual(redirected, [308, 'https://api.example.com/admin-api']);
    assert.equal(next, false);
    const devOptions = { secret, production: false };
    SecurityPlugin.init(devOptions);
    const devMiddleware = new JwtApiMiddleware(new JwtSessionService({}, devOptions), devOptions);
    redirected = undefined;
    await middleware.use({ secure: false, originalUrl: '/admin-api', headers: {} }, response, () => {});
    assert.deepEqual(redirected, [308, 'https://api.example.com/admin-api'], 'Otra configuración no debe cambiar un middleware ya creado');
    const req = { secure: false, headers: { authorization: 'Bearer invalid' }, body: { query: 'mutation { login(username:"user", password:"pass") { __typename } }' } };
    await devMiddleware.use(req, response, () => { next = true; });
    assert.equal(next, true); assert.equal(req.headers.authorization, undefined);
    next = false;
    await devMiddleware.use({ ...req, headers: { authorization: 'Bearer invalid' }, body: { query: '{ administrators { totalItems } }' } }, response, () => { next = true; });
    assert.equal(next, false); assert.equal(status, 401);
});

test('el servicio de sesión se prueba sin importar el registro y rechaza sesiones revocadas', async () => {
    let current = { id: 1, token: 'native-session', expires: new Date(Date.now() + 3600000), user: { id: 9, channelPermissions: [{ permissions: ['ReadProduct'] }] } };
    const jwt = new JwtSessionService({ getSessionFromToken: async () => current }, { secret, production: false });
    const encoded = await jwt.issue(current.token);
    assert.equal((await jwt.verify(encoded)).sub, '9');
    assert.equal(await jwt.issue(current.token, encoded, current.token), encoded);
    current = null;
    await assert.rejects(jwt.verify(encoded), /Sesión no vigente/);
    await assert.rejects(jwt.issue('native-session'), /No se pudo emitir/);
});

test('el adaptador GraphQL convierte el token usando el emisor de la petición', async () => {
    const { jwtResponsePlugin } = require('../src/plugins/security/api/jwt-response.plugin');
    const headers = new Map([['auth', 'native-session']]);
    const outgoing = new Map();
    const plugin = jwtResponsePlugin('auth');
    const hook = await plugin.requestDidStart();
    await hook.willSendResponse({ contextValue: { req: {}, res: { locals: { issueSessionJwt: async token => { assert.equal(token, 'native-session'); return 'signed.jwt.token'; } }, getHeader: key => headers.get(key), setHeader: (key, value) => headers.set(key, value) } }, response: { http: { headers: outgoing }, body: { kind: 'single', singleResult: { errors: [{ extensions: { code: 'FORBIDDEN' } }] } } } });
    assert.equal(headers.get('auth'), 'signed.jwt.token');
    assert.equal(outgoing.get('auth'), 'signed.jwt.token');
    assert.equal(outgoing.get('cache-control'), 'no-store');
});
