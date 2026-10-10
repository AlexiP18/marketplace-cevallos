import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getRouteLocale } from '@/platform/i18n/server';
import { SellerRegistrationForm } from '@/features/seller/seller-registration-form';
import { Store, ShieldCheck, Sparkles, Truck, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'Registro de Vendedor / Almacenista | Marketplace de Calzado',
        description: 'Únete a nuestra plataforma multivendedor para comercializar tus productos de calzado y artesanías con tu propio canal y panel de administración.',
    };
}

function FormSkeleton() {
    return (
        <Card className="max-w-3xl mx-auto">
            <CardContent className="space-y-6 pt-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-full" />
                <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-32 ml-auto" />
            </CardContent>
        </Card>
    );
}

export default async function SellerRegistrationPage() {
    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 mt-14 bg-gradient-to-b from-muted/30 via-background to-background">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Hero section */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
                        <Store className="h-3.5 w-3.5" />
                        Comunidad de Fabricantes y Almacenistas
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                        Vende tu Calzado en Nuestro Marketplace
                    </h1>
                    <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                        Crea tu tienda oficial con canal propio, gestión de inventario por tallas y colores, modalidades de pago locales (Payphone, DeUna, transferencias) y catálogo personalizado.
                    </p>
                </div>

                {/* Benefits banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                    <div className="flex items-center gap-3 p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs shadow-xs">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                            <Store className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-foreground">Canal y Tienda Propia</p>
                            <p className="text-[11px] text-muted-foreground">Tu propia URL y catálogo exclusivo</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs shadow-xs">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-foreground">Validación SRI / JNDA</p>
                            <p className="text-[11px] text-muted-foreground">Comercio formal y seguro</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3.5 rounded-xl border bg-card/60 backdrop-blur-xs shadow-xs">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-foreground">Aprobación Supervisada</p>
                            <p className="text-[11px] text-muted-foreground">Revisión previa por el Superadmin</p>
                        </div>
                    </div>
                </div>

                {/* Main Form */}
                <Suspense fallback={<FormSkeleton />}>
                    <SellerRegistrationForm />
                </Suspense>
            </div>
        </div>
    );
}
