import { Administrator, Channel, RequestContext, Seller, VendureEvent } from '@vendure/core';
import { SellerProfile } from '../entities/seller-profile.entity';
import { RegisterSellerInput } from '../types';

/**
 * This event is fired whenever a new vendor/almacenista is registered in the marketplace.
 */
export class SellerRegisteredEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public profile: SellerProfile,
        public seller: Seller,
        public channel: Channel,
        public administrator: Administrator,
        public rawInput: RegisterSellerInput,
    ) {
        super();
    }
}
