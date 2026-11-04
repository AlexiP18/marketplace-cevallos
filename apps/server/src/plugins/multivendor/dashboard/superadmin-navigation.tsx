import { useAuth, useChannel } from '@vendure/dashboard';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { forwardRef, useEffect, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { isSuperadmin, landingPath, superadminCanVisit, superadminVisibleSections } from './superadmin-scope';

export function superadminSectionIcon(id: string, Icon?: LucideIcon): LucideIcon | undefined {
    if (superadminVisibleSections.has(id)) return Icon;
    const SectionIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
        const { channels } = useAuth();
        const hidden = isSuperadmin(channels) || undefined;
        return Icon ? <Icon {...props} ref={ref} data-superadmin-hidden={hidden} /> : <svg {...props} ref={ref} data-superadmin-hidden={hidden} />;
    });
    return SectionIcon;
}

export function SuperadminDashboardScope({ children }: { children: ReactNode }) {
    const { channels } = useAuth();
    const { activeChannel, setActiveChannel } = useChannel();
    const superadmin = isSuperadmin(channels);
    const defaultChannel = channels?.find(channel => channel.code === '__default_channel__');
    useEffect(() => {
        document.documentElement.toggleAttribute('data-superadmin-dashboard', superadmin);
        return () => document.documentElement.removeAttribute('data-superadmin-dashboard');
    }, [superadmin]);
    useEffect(() => {
        if (superadmin && defaultChannel && activeChannel?.id !== defaultChannel.id) setActiveChannel(defaultChannel.id);
    }, [superadmin, defaultChannel?.id, activeChannel?.id, setActiveChannel]);
    const router = useRouter();
    const path = useRouterState({ select: state => state.location.pathname });
    const base = router.basepath === '/' ? '' : router.basepath.replace(/\/$/, '');
    const relativePath = base && (path === base || path.startsWith(`${base}/`)) ? path.slice(base.length) || '/' : path;
    useEffect(() => {
        const destination = landingPath(channels);
        if (relativePath === '/' && destination) void router.navigate({ to: destination });
    }, [channels, relativePath, router]);
    if (superadmin && !superadminCanVisit(relativePath)) {
        return <div className="p-6"><h1 className="text-xl font-semibold">Sección no disponible</h1><p className="mt-2 text-muted-foreground">La gestión de esta sección corresponde a los almacenes.</p></div>;
    }
    return children;
}
