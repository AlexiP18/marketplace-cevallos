'use client';

import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/platform/i18n/navigation';
import { RegisteredSellerProfile } from './types';
import { Clock, CheckCircle2, Store, ArrowRight, ShieldAlert, Building2, User, Phone, MapPin, CreditCard } from 'lucide-react';

interface PendingApprovalCardProps {
    profile: RegisteredSellerProfile;
    adminEmail?: string;
    ruc?: string;
    regimenSri?: string;
    onReset?: () => void;
}

export function PendingApprovalCard({ profile, adminEmail, ruc, regimenSri }: PendingApprovalCardProps) {
    const paymentMethods = [];
    if (profile.paymentModalities?.payphone) paymentMethods.push('Payphone');
    if (profile.paymentModalities?.deuna) paymentMethods.push('DeUna');
    if (profile.paymentModalities?.paypal) paymentMethods.push('PayPal');
    if (profile.paymentModalities?.transferenciaBancaria) paymentMethods.push('Transferencia Bancaria');
    if (profile.paymentModalities?.pagoEnLocal) paymentMethods.push('Pago en Local');

    return (
        <Card className="w-full max-w-3xl mx-auto shadow-lg border-amber-200/80 dark:border-amber-900/50 bg-card overflow-hidden">
            {/* Header banner */}
            <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 dark:from-amber-950/40 dark:to-background p-6 border-b border-amber-200/50 dark:border-amber-900/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full">
                            <Clock className="h-8 w-8 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                    Solicitud Registrada
                                </span>
                                <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10">
                                    <Clock className="h-3 w-3 mr-1 inline" />
                                    Pendiente de Aprobación
                                </Badge>
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                                ¡Solicitud de Almacenista en Revisión!
                            </h2>
                        </div>
                    </div>
                </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
                {/* Notice Alert */}
                <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800/60 p-4 sm:p-5 flex items-start gap-4 text-amber-900 dark:text-amber-200">
                    <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-sm leading-relaxed">
                        <p className="font-semibold text-base">
                            Tu cuenta comercial ha sido creada exitosamente con estado PENDIENTE.
                        </p>
                        <p className="text-muted-foreground text-amber-800/90 dark:text-amber-300/80">
                            Por motivos de seguridad y verificación tributaria (SRI), el <strong>Superadministrador del marketplace</strong> debe revisar y aprobar los datos de tu taller/negocio antes de que tu tienda comience a vender al público.
                        </p>
                    </div>
                </div>

                {/* Summary Grid */}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Store className="h-4 w-4" />
                        Resumen de la Información Registrada
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border bg-muted/30 p-5">
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs text-muted-foreground">Nombre Comercial / Taller</p>
                                <p className="font-semibold text-foreground flex items-center gap-1.5">
                                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                                    {profile.businessName}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-muted-foreground">Identificador URL (Slug del Canal)</p>
                                <code className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border">
                                    /{profile.slug}
                                </code>
                            </div>

                            <div>
                                <p className="text-xs text-muted-foreground">Dirección del Local</p>
                                <p className="text-sm text-foreground flex items-center gap-1.5">
                                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {profile.address}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-muted-foreground">Teléfono Comercial</p>
                                <p className="text-sm text-foreground flex items-center gap-1.5">
                                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {profile.contactPhone}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {adminEmail && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Correo de Acceso (Administrador)</p>
                                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                        <User className="h-4 w-4 text-primary shrink-0" />
                                        {adminEmail}
                                    </p>
                                </div>
                            )}

                            {ruc && (
                                <div>
                                    <p className="text-xs text-muted-foreground">RUC (Ecuador)</p>
                                    <p className="text-sm font-mono text-foreground">{ruc}</p>
                                </div>
                            )}

                            {regimenSri && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Régimen Tributario SRI</p>
                                    <p className="text-sm font-medium text-foreground">{regimenSri}</p>
                                </div>
                            )}

                            {paymentMethods.length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Modalidades de Pago Habilitadas</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {paymentMethods.map((m) => (
                                            <span
                                                key={m}
                                                className="inline-flex items-center text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                                            >
                                                <CreditCard className="h-3 w-3 mr-1 inline" />
                                                {m}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Next Steps */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                    <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ¿Qué pasos siguen ahora?
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                        <li>El equipo de administración revisará la consistencia del RUC y datos bancarios.</li>
                        <li>Una vez aprobado tu perfil, el estado cambiará automáticamente a <strong>ACTIVO</strong>.</li>
                        <li>Podrás ingresar a la consola de administración en <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/dashboard</code> con tu correo y contraseña registrados para subir tus productos de calzado y gestionar tu inventario.</li>
                    </ul>
                </div>
            </CardContent>

            <CardFooter className="bg-muted/20 px-6 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-t">
                <p className="text-xs text-muted-foreground text-center sm:text-left">
                    ¿Tienes dudas sobre el proceso? Contáctanos a soporte del marketplace.
                </p>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Button render={<Link href="/" />} variant="outline" className="w-full sm:w-auto">
                        Ir al Inicio
                    </Button>
                    <Button render={<Link href="/collection/calzado" />} className="w-full sm:w-auto">
                        Explorar Catálogo
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
