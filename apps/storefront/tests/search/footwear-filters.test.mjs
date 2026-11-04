import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/features/search/search-helpers.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText;
const {buildSearchInput} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('combined attributes preserve text, facets, collection, sort and pagination', () => {
    const input = buildSearchInput({searchParams: {q: 'zapato', talla: '38', color: 'rojo', capellada: 'cuero', suela: 'tr', horma: 'anatomica', facets: ['1','2'], page: '2', sort: 'price-desc'}, collectionSlug: 'mujer'});
    assert.deepEqual(input.footwear, {talla:'38', color:'rojo', capellada:'cuero', suela:'tr', horma:'anatomica'});
    assert.deepEqual(input.facetValueFilters, [{and:'1'}, {and:'2'}]);
    assert.equal(input.term, 'zapato'); assert.equal(input.collectionSlug, 'mujer');
    assert.equal(input.skip, 12); assert.deepEqual(input.sort, {price:'DESC'});
});

test('empty, repeated and unknown attribute parameters are not sent as filters', () => {
    assert.deepEqual(buildSearchInput({searchParams: {talla:['38','39'],color:'',unexpected:'x'}}).footwear, {});
});
