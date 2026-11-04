import type { ConnectionOptions } from 'bullmq';

export const MARKETPLACE_OPTIONS = Symbol('MARKETPLACE_OPTIONS');
export type MarketplaceOptions = { redis: ConnectionOptions; privateFiles: string; apiOrigin: string; queuePrefix: string; reservationTtlMinutes: number; workerRole?: 'all'|'admission'|'general' };
