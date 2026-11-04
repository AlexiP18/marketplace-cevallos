import { RequestContext, VendureEvent } from '@vendure/core';
import { SellerProfile } from '../entities/seller-profile.entity';

export class SellerProfileStatusChangedEvent extends VendureEvent {
    constructor(public ctx: RequestContext, public profile: SellerProfile) { super(); }
}
