import {parse} from 'graphql';
import type {TadaDocumentNode} from 'gql.tada';
import {query} from '@/platform/vendure/api';
import {FootwearFilters, type FootwearFilterValues} from './footwear-filters';

const document = parse('query FootwearFilters { footwearFilterValues { talla color capellada suela horma } }') as unknown as TadaDocumentNode<{footwearFilterValues: FootwearFilterValues}, Record<string, never>>;
export async function FootwearFiltersData() {
    const result = await query(document, {}, {fetch: {cache: 'no-store'}});
    return <FootwearFilters values={result.data.footwearFilterValues} />;
}
