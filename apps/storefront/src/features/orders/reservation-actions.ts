'use server';

import {parse} from 'graphql';
import type {TadaDocumentNode} from 'gql.tada';
import {query} from '@/platform/vendure/api';

export type OrderReservation = {id: string; orderCode: string; expiresAt: string; serverTime: string; status: string};
const reservationQuery = parse(`query OrderReservations($code: String!) {
    orderByCode(code: $code) { marketplaceReservations { id orderCode expiresAt serverTime status } }
}`) as unknown as TadaDocumentNode<{orderByCode: {marketplaceReservations: OrderReservation[]} | null}, {code: string}>;
const activeReservationQuery = parse(`query ActiveOrderReservations {
    activeOrder { marketplaceReservations { id orderCode expiresAt serverTime status } }
}`) as unknown as TadaDocumentNode<{activeOrder: {marketplaceReservations: OrderReservation[]} | null}, Record<string, never>>;

export async function readOrderReservations(code?: string): Promise<OrderReservation[]> {
    if (!code) {
        const result = await query(activeReservationQuery, {}, {useAuthToken: true, fetch: {cache: 'no-store'}});
        return result.data.activeOrder?.marketplaceReservations || [];
    }
    const result = await query(reservationQuery, {code}, {useAuthToken: true, fetch: {cache: 'no-store'}});
    return result.data.orderByCode?.marketplaceReservations || [];
}
