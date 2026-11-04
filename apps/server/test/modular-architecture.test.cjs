const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require(require.resolve('typescript', { paths: [path.join(__dirname, '..')] }));

const root = path.resolve(__dirname, '../src/plugins');
function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
const sources = new Map(files(root).map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)]));
const imports = new Map([...sources].map(([file, source]) => [file, source.statements
    .filter(node => (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && !node.isTypeOnly) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
    .map(node => node.moduleSpecifier.text)]));
const label = file => path.relative(root, file);
function resolve(file, specifier) {
    if (!specifier.startsWith('.')) return;
    const base = path.resolve(path.dirname(file), specifier);
    return [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(candidate => sources.has(candidate));
}

test('los módulos personalizados no contienen ciclos de importación', () => {
    const done = new Set(), active = new Set(), stack = [];
    function visit(file) {
        assert.ok(!active.has(file), `Ciclo: ${[...stack, file].map(label).join(' → ')}`);
        if (done.has(file)) return;
        active.add(file); stack.push(file);
        for (const specifier of imports.get(file)) {
            const target = resolve(file, specifier);
            if (target) visit(target);
        }
        stack.pop(); active.delete(file); done.add(file);
    }
    for (const file of sources.keys()) visit(file);
});

test('servicios y presentación no leen estado estático de clases de registro', () => {
    for (const [file, source] of sources) if (!file.endsWith('.plugin.ts')) {
        assert.doesNotMatch(source.text, /\b\w+Plugin\.(options|sessions|tokens)\b/, label(file));
    }
});

test('resolvers delegan la persistencia y el backend no importa el dashboard', () => {
    for (const [file, source] of sources) {
        if (file.endsWith('.resolver.ts')) assert.doesNotMatch(source.text, /\.(getRepository|rawConnection|createQueryBuilder)\b/, label(file));
        if (!file.includes(`${path.sep}dashboard${path.sep}`)) {
            for (const specifier of imports.get(file)) {
                const target = resolve(file, specifier);
                assert.ok(specifier !== '@vendure/dashboard' && !target?.includes(`${path.sep}dashboard${path.sep}`), `${label(file)} importa presentación: ${specifier}`);
            }
        }
    }
});

test('la interfaz compartida no importa persistencia y cada dashboard conserva sus componentes internos', () => {
    for (const [file, specifiers] of imports) for (const specifier of specifiers) {
        const target = resolve(file, specifier);
        if (file.includes(`${path.sep}shared${path.sep}`)) {
            assert.ok(!['@vendure/core', '@nestjs/common'].includes(specifier) && !target?.endsWith('.entity.ts') && !target?.endsWith('.service.ts'), `${label(file)} depende del backend: ${specifier}`);
        }
        if (target?.includes(`${path.sep}dashboard${path.sep}components${path.sep}`)) {
            assert.equal(label(file).split(path.sep)[0], label(target).split(path.sep)[0], `${label(file)} importa un componente privado de ${label(target)}`);
        }
    }
});
