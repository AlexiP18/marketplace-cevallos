import {
    DashboardRouteDefinition,
    Badge,
    api,
    useQuery,
    useMutation,
    useQueryClient,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Button,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useParams } from '@tanstack/react-router';
import { CheckCircle, XCircle, Ban } from 'lucide-react';

const sellerProfileDetailDocument = graphql(`
    query SellerProfileDetail($id: ID!) {
        sellerProfile(id: $id) {
            id
            createdAt
            updatedAt
            businessName
            slug
            address
            contactPhone
            socialLinks {
                facebook
                instagram
                tiktok
                whatsapp
                website
            }
            obligadoContabilidad
            ruc
            taxContactPhone
            regimenSri
            calificacionArtesanalJnda
            adminFirstName
            adminLastName
            adminEmail
            adminPhone
            paymentModalities {
                payphone
                deuna
                paypal
                transferenciaBancaria
                pagoEnLocal
            }
            primaryBankAccount {
                bankName
                accountType
                accountNumber
                accountHolderName
                accountHolderId
            }
            hasSecondaryAccount
            secondaryBankAccount {
                bankName
                accountType
                accountNumber
                accountHolderName
                accountHolderId
            }
            status
            rejectionReason
            logo {
                id
                preview
            }
            seller {
                id
                name
            }
            channel {
                id
                code
                token
            }
            administrator {
                id
                firstName
                lastName
                emailAddress
            }
        }
    }
`);

const approveSellerProfileMutation = graphql(`
    mutation ApproveSellerProfile($id: ID!) {
        approveSellerProfile(id: $id) {
            id
            status
        }
    }
`);

const rejectSellerProfileMutation = graphql(`
    mutation RejectSellerProfile($id: ID!, $reason: String) {
        rejectSellerProfile(id: $id, reason: $reason) {
            id
            status
        }
    }
`);

const suspendSellerProfileMutation = graphql(`
    mutation SuspendSellerProfile($id: ID!, $reason: String) {
        suspendSellerProfile(id: $id, reason: $reason) {
            id
            status
        }
    }
`);

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
        ACTIVE: 'default',
        PENDING_APPROVAL: 'secondary',
        REJECTED: 'destructive',
        SUSPENDED: 'outline',
    };
    const labels: Record<string, string> = {
        ACTIVE: 'Activo',
        PENDING_APPROVAL: 'Pendiente de aprobación',
        REJECTED: 'Rechazado',
        SUSPENDED: 'Suspendido',
    };
    return <Badge variant={variants[status] ?? 'secondary'}>{labels[status] ?? status}</Badge>;
}

function LabeledField({ label, value }: { label: string; value?: string | null | boolean }) {
    const displayValue = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : (value || '—');
    return (
        <div className="space-y-1">
            <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm">{displayValue}</dd>
        </div>
    );
}

function PaymentBadge({ label, enabled }: { label: string; enabled: boolean }) {
    return (
        <Badge variant={enabled ? 'default' : 'outline'} className="mr-1">
            {label}
        </Badge>
    );
}

const regimenLabels: Record<string, string> = {
    GENERAL: 'General',
    RIMPE_EMPRENDEDOR: 'RIMPE Emprendedor',
    RIMPE_NEGOCIO_POPULAR: 'RIMPE Negocio Popular',
    OTRO: 'Otro',
};

const accountTypeLabels: Record<string, string> = {
    AHORROS: 'Ahorros',
    CORRIENTE: 'Corriente',
};

function SellerProfileDetailPage() {
    const { id } = useParams({ strict: false }) as { id: string };
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['sellerProfile', id],
        queryFn: () => api.query(sellerProfileDetailDocument, { id }),
    });

    const approveMutation = useMutation({
        mutationFn: () => api.mutate(approveSellerProfileMutation, { id }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sellerProfile', id] });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: () => {
            const reason = window.prompt('Motivo del rechazo:');
            return api.mutate(rejectSellerProfileMutation, { id, reason });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sellerProfile', id] });
        },
    });

    const suspendMutation = useMutation({
        mutationFn: () => {
            const reason = window.prompt('Motivo de la suspensión:');
            return api.mutate(suspendSellerProfileMutation, { id, reason });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sellerProfile', id] });
        },
    });

    if (isLoading) {
        return <div className="p-6">Cargando...</div>;
    }

    const profile = data?.sellerProfile;
    if (!profile) {
        return <div className="p-6">Perfil de vendedor no encontrado</div>;
    }

    return (
        <div className="space-y-6 p-6">
            {/* Encabezado */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {profile.logo && (
                        <img
                            src={profile.logo.preview + '?preset=tiny'}
                            alt={profile.businessName}
                            className="h-16 w-16 rounded-lg object-cover"
                        />
                    )}
                    <div>
                        <h1 className="text-2xl font-bold">{profile.businessName}</h1>
                        <p className="text-muted-foreground">/{profile.slug}</p>
                    </div>
                    <StatusBadge status={profile.status} />
                </div>
                <div className="flex gap-2">
                    {profile.status === 'PENDING_APPROVAL' && (
                        <>
                            <Button
                                variant="default"
                                onClick={() => approveMutation.mutate()}
                                disabled={approveMutation.isPending}
                            >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Aprobar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => rejectMutation.mutate()}
                                disabled={rejectMutation.isPending}
                            >
                                <XCircle className="mr-2 h-4 w-4" />
                                Rechazar
                            </Button>
                        </>
                    )}
                    {profile.status === 'ACTIVE' && (
                        <Button
                            variant="outline"
                            onClick={() => suspendMutation.mutate()}
                            disabled={suspendMutation.isPending}
                        >
                            <Ban className="mr-2 h-4 w-4" />
                            Suspender
                        </Button>
                    )}
                </div>
            </div>

            {profile.rejectionReason && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
                    <p className="text-sm font-medium text-destructive">
                        Motivo: {profile.rejectionReason}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Datos del Negocio */}
                <Card>
                    <CardHeader>
                        <CardTitle>Datos del Negocio</CardTitle>
                        <CardDescription>Información general del negocio</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4">
                            <LabeledField label="Nombre" value={profile.businessName} />
                            <LabeledField label="Slug" value={profile.slug} />
                            <LabeledField label="Dirección" value={profile.address} />
                            <LabeledField label="Teléfono" value={profile.contactPhone} />
                            {profile.socialLinks && (
                                <>
                                    <LabeledField label="Facebook" value={profile.socialLinks.facebook} />
                                    <LabeledField label="Instagram" value={profile.socialLinks.instagram} />
                                    <LabeledField label="TikTok" value={profile.socialLinks.tiktok} />
                                    <LabeledField label="WhatsApp" value={profile.socialLinks.whatsapp} />
                                    <LabeledField label="Sitio Web" value={profile.socialLinks.website} />
                                </>
                            )}
                        </dl>
                    </CardContent>
                </Card>

                {/* Datos de Tributación */}
                <Card>
                    <CardHeader>
                        <CardTitle>Datos de Tributación</CardTitle>
                        <CardDescription>Información tributaria y SRI</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4">
                            <LabeledField label="RUC" value={profile.ruc} />
                            <LabeledField label="Obligado a llevar contabilidad" value={profile.obligadoContabilidad} />
                            <LabeledField label="Régimen SRI" value={regimenLabels[profile.regimenSri] ?? profile.regimenSri} />
                            <LabeledField label="Teléfono tributación" value={profile.taxContactPhone} />
                            <LabeledField label="N° Calificación Artesanal JNDA" value={profile.calificacionArtesanalJnda} />
                        </dl>
                    </CardContent>
                </Card>

                {/* Datos del Administrador */}
                <Card>
                    <CardHeader>
                        <CardTitle>Datos del Propietario / Administrador</CardTitle>
                        <CardDescription>Información del administrador del taller</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4">
                            <LabeledField label="Nombres" value={profile.adminFirstName} />
                            <LabeledField label="Apellidos" value={profile.adminLastName} />
                            <LabeledField label="Correo Electrónico" value={profile.adminEmail} />
                            <LabeledField label="Teléfono" value={profile.adminPhone} />
                        </dl>
                    </CardContent>
                </Card>

                {/* Modalidades de Pago */}
                <Card>
                    <CardHeader>
                        <CardTitle>Modalidades de Pago</CardTitle>
                        <CardDescription>Métodos de pago habilitados</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            <PaymentBadge label="Payphone" enabled={profile.paymentModalities.payphone} />
                            <PaymentBadge label="DeUna" enabled={profile.paymentModalities.deuna} />
                            <PaymentBadge label="PayPal" enabled={profile.paymentModalities.paypal} />
                            <PaymentBadge label="Transferencia Bancaria" enabled={profile.paymentModalities.transferenciaBancaria} />
                            <PaymentBadge label="Pago en Local" enabled={profile.paymentModalities.pagoEnLocal} />
                        </div>
                    </CardContent>
                </Card>

                {/* Datos Bancarios - Cuenta Primaria */}
                <Card>
                    <CardHeader>
                        <CardTitle>Cuenta Bancaria Principal</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4">
                            <LabeledField label="Institución Financiera" value={profile.primaryBankAccount.bankName} />
                            <LabeledField label="Tipo de Cuenta" value={accountTypeLabels[profile.primaryBankAccount.accountType] ?? profile.primaryBankAccount.accountType} />
                            <LabeledField label="Número de Cuenta" value={profile.primaryBankAccount.accountNumber} />
                            <LabeledField label="Titular" value={profile.primaryBankAccount.accountHolderName} />
                            <LabeledField label="Cédula / RUC Titular" value={profile.primaryBankAccount.accountHolderId} />
                        </dl>
                    </CardContent>
                </Card>

                {/* Datos Bancarios - Cuenta Secundaria */}
                {profile.hasSecondaryAccount && profile.secondaryBankAccount && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Cuenta Bancaria Secundaria</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid grid-cols-2 gap-4">
                                <LabeledField label="Institución Financiera" value={profile.secondaryBankAccount.bankName} />
                                <LabeledField label="Tipo de Cuenta" value={accountTypeLabels[profile.secondaryBankAccount.accountType] ?? profile.secondaryBankAccount.accountType} />
                                <LabeledField label="Número de Cuenta" value={profile.secondaryBankAccount.accountNumber} />
                                <LabeledField label="Titular" value={profile.secondaryBankAccount.accountHolderName} />
                                <LabeledField label="Cédula / RUC Titular" value={profile.secondaryBankAccount.accountHolderId} />
                            </dl>
                        </CardContent>
                    </Card>
                )}

                {/* Info del sistema Vendure */}
                <Card>
                    <CardHeader>
                        <CardTitle>Información del Sistema</CardTitle>
                        <CardDescription>Recursos asociados en Vendure</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4">
                            <LabeledField label="Seller" value={profile.seller.name} />
                            <LabeledField label="Canal" value={profile.channel.code} />
                            <LabeledField label="Token Canal" value={profile.channel.token} />
                            {profile.administrator && (
                                <LabeledField
                                    label="Administrador Vendure"
                                    value={`${profile.administrator.firstName} ${profile.administrator.lastName} (${profile.administrator.emailAddress})`}
                                />
                            )}
                            <LabeledField label="Creado" value={new Date(profile.createdAt).toLocaleString()} />
                            <LabeledField label="Actualizado" value={new Date(profile.updatedAt).toLocaleString()} />
                        </dl>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export const sellerProfileDetail: DashboardRouteDefinition = {
    path: '/seller-profiles/$id',
    loader: () => ({
        breadcrumb: [
            { label: 'Vendedores', path: '/seller-profiles' },
            { label: 'Detalle' },
        ],
    }),
    component: () => <SellerProfileDetailPage />,
};
