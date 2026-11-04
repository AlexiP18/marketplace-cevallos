const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const path = require('node:path');
const Redis = require('ioredis');
require('dotenv').config({path: path.join(__dirname, '../.env'), quiet: true});

async function main() {
    assert.equal(process.env.APP_ENV, 'dev');
    const files = process.argv.slice(2);
    assert.ok(files.length);
    for (const file of files) assert.match(file, /^(marketplace\.integration|marketplace-latency\.benchmark|catalog-search\.integration|checkout-stock\.integration)\.ts$/);
    const database = `vendure_mq_test_${Date.now()}`, prefix = `mq-test-${database}`;
    const docker = (...args) => execFileSync('docker', args, {maxBuffer: 150 * 1024 * 1024});
    const postgres = 'vendure-prueba-postgres_db-1', user = process.env.DB_USERNAME;
    docker('exec', postgres, 'createdb', '-U', user, database);
    try {
        const dump = docker('exec', postgres, 'pg_dump', '-U', user, process.env.DB_NAME);
        const restored = spawnSync('docker', ['exec', '-i', postgres, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database], {input: dump, maxBuffer: 150 * 1024 * 1024});
        assert.equal(restored.status, 0, restored.stderr?.toString());
        for (const file of files) {
            const child = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', path.join(__dirname, file)], {
                cwd: path.join(__dirname, '..'), stdio: 'inherit', env: {...process.env, DB_NAME: database, MARKETPLACE_TEST_DB: database, REDIS_PREFIX: prefix},
            });
            assert.equal(child.status, 0, `${file} falló`);
        }
    } finally {
        docker('exec', postgres, 'dropdb', '--force', '-U', user, database);
        const redis = new Redis({host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6479), password: process.env.REDIS_PASSWORD || undefined});
        try {
            let cursor = '0';
            do {
                const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
                cursor = next;
                if (keys.length) await redis.unlink(...keys);
            } while (cursor !== '0');
        } finally { await redis.quit(); }
    }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
