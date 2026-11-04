export const SECURITY_OPTIONS = Symbol('SECURITY_OPTIONS');
export type SecurityOptions = { secret: string; production: boolean; publicOrigin?: string };
