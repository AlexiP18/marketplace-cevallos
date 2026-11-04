export const superadminVisibleSections = new Set(['insights', 'customers', 'multivendor', 'footwear-statistics']);
const allowedPaths = ['/customers', '/customer-groups', '/seller-profiles', '/financial-institutions', '/estadisticas-calzado', '/profile'];

export function isSuperadmin(channels: ReadonlyArray<{ permissions: readonly string[] }> | undefined) {
    return channels?.some(channel => channel.permissions.includes('SuperAdmin')) ?? false;
}

export function landingPath(channels: ReadonlyArray<{ permissions: readonly string[] }> | undefined) {
    if (isSuperadmin(channels)) return '/seller-profiles';
    if (channels?.some(channel => channel.permissions.includes('UpdateSeller'))) return '/products';
    if (channels?.some(channel => channel.permissions.includes('ReadProduct'))) return '/warehouse/receipts';
    if (channels?.some(channel => channel.permissions.includes('ReadOrder'))) return '/warehouse/dispatch';
    return null;
}

export function superadminCanVisit(path: string) {
    return path === '/' || allowedPaths.some(allowed => path === allowed || path.startsWith(`${allowed}/`));
}
