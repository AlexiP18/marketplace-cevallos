import { api, Button, Card, CardContent, CardHeader, CardTitle, PermissionGuard, type DashboardRouteDefinition, useQuery, useQueryClient } from '@vendure/dashboard';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { ResultOf } from 'gql.tada';
import { type FormEvent, useState } from 'react';
import { institutionsQuery, type Institution } from './financial-institutions';
import { formatEcuadorianMobile, InstitutionPicker, isEcuadorianIdentityDocument, isEcuadorianRuc } from './seller-profile-create';
import { sellerPhotoQuery, sellerProfileDetailDocument } from './seller-profile-detail';
import { SellerLogoPicker, type SellerLogo } from './seller-logo-picker';

type Profile = NonNullable<ResultOf<typeof sellerProfileDetailDocument>['sellerProfile']>;
const updateProfile = `mutation UpdateSellerProfile($input: UpdateSellerProfileInput!) {
    updateSellerProfile(input: $input) { id }
}`;
const field = 'mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm';

function TextField({ label, name, value, type = 'text', required = false, mobile = false }: { label: string; name: string; value?: string | null; type?: string; required?: boolean; mobile?: boolean }) {
    return <label className="block text-sm">{label}{required && ' *'}<input className={field} name={name} type={type} required={required} defaultValue={value || ''} inputMode={mobile ? 'numeric' : undefined} onInput={mobile ? event => { event.currentTarget.value = formatEcuadorianMobile(event.currentTarget.value); } : undefined} /></label>;
}

function EditForm({ profile, institutions, initialPhoto }: { profile: Profile; institutions: Institution[]; initialPhoto: SellerLogo | null }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [logo, setLogo] = useState<SellerLogo | null>(profile.logo ? { id: String(profile.logo.id), preview: profile.logo.preview } : null);
    const [profilePhoto, setProfilePhoto] = useState<SellerLogo | null>(initialPhoto);
    const [hasSecondary, setHasSecondary] = useState(profile.hasSecondaryAccount);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const availableInstitutions = institutions.filter(item => item.active || item.name === profile.primaryBankAccount.bankName || item.name === profile.secondaryBankAccount?.bankName);
    const paymentLabels = [['payphone', 'Payphone'], ['deuna', 'DeUna'], ['paypal', 'PayPal'], ['transferenciaBancaria', 'Transferencia bancaria'], ['pagoEnLocal', 'Pago en local']] as const;

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const value = (name: string) => String(data.get(name) || '').trim();
        const account = (prefix: string) => ({ bankName: value(`${prefix}BankName`), accountType: value(`${prefix}AccountType`), accountNumber: value(`${prefix}AccountNumber`), accountHolderName: value(`${prefix}AccountHolderName`), accountHolderId: value(`${prefix}AccountHolderId`) });
        const primary = account('primary');
        const secondary = hasSecondary ? account('secondary') : undefined;
        if (!isEcuadorianRuc(value('ruc'))) { setError('Ingresa un RUC ecuatoriano válido.'); return; }
        if (!isEcuadorianIdentityDocument(primary.accountHolderId) || (secondary?.accountHolderId && !isEcuadorianIdentityDocument(secondary.accountHolderId))) { setError('La cédula o RUC del titular no es válido.'); return; }
        if (![primary, ...(secondary ? [secondary] : [])].every(item => availableInstitutions.some(institution => institution.name === item.bankName))) { setError('Selecciona una institución financiera de la lista.'); return; }
        if (!paymentLabels.some(([name]) => data.has(name))) { setError('Selecciona al menos una modalidad de pago.'); return; }
        setBusy(true); setError('');
        try {
            await api.mutate(updateProfile, { input: {
                id: profile.id,
                business: { name: value('businessName'), address: value('address'), contactPhone: value('businessPhone'), logoAssetId: logo?.id ?? null, socialLinks: { whatsapp: value('whatsapp'), instagram: value('instagram'), facebook: value('facebook'), tiktok: value('tiktok'), website: value('website') } },
                tax: { ruc: value('ruc'), contactPhone: value('taxPhone'), regimenSri: value('regimenSri'), obligadoContabilidad: data.has('obligadoContabilidad'), calificacionArtesanalJnda: value('calificacionArtesanalJnda') },
                administrator: { firstName: value('firstName'), lastName: value('lastName'), emailAddress: value('emailAddress'), contactPhone: value('adminPhone'), photoAssetId: profilePhoto?.id ?? null },
                paymentModalities: Object.fromEntries(paymentLabels.map(([name]) => [name, data.has(name)])),
                primaryBankAccount: primary, hasSecondaryAccount: hasSecondary, secondaryBankAccount: secondary,
            } });
            await queryClient.invalidateQueries({ queryKey: ['sellerProfile', String(profile.id)] });
            await queryClient.invalidateQueries({ queryKey: ['seller-administrator-photo', String(profile.id)] });
            await queryClient.invalidateQueries({ queryKey: ['my-administrator-personal-data'] });
            await queryClient.invalidateQueries({ queryKey: ['PaginatedListDataTable'] });
            await navigate({ to: '/seller-profiles/$id', params: { id: String(profile.id) } });
        } catch (cause) {
            const message = cause instanceof Error ? cause.message.replace(/^GraphQL Request Error:\s*/i, '') : '';
            setError(/email-address-conflict|email.*(already|exists)|correo.*(registrado|existe)/i.test(message) ? 'El correo ya está registrado. Usa otro correo para la cuenta administradora.' : message || 'No se pudieron guardar los cambios.');
        } finally { setBusy(false); }
    }

    const bankFields = (prefix: 'primary' | 'secondary', account: Profile['primaryBankAccount'] | Profile['secondaryBankAccount']) => <div className="grid gap-4 sm:grid-cols-2">
        <InstitutionPicker label="Institución financiera" name={`${prefix}BankName`} institutions={availableInstitutions} initialValue={account?.bankName || ''} />
        <label className="block text-sm">Tipo de cuenta *<select className={field} name={`${prefix}AccountType`} defaultValue={account?.accountType || 'AHORROS'}><option value="AHORROS">Ahorros</option><option value="CORRIENTE">Corriente</option></select></label>
        <TextField label="Número de cuenta" name={`${prefix}AccountNumber`} value={account?.accountNumber} required />
        <TextField label="Nombre del titular" name={`${prefix}AccountHolderName`} value={account?.accountHolderName} required={prefix === 'primary'} />
        <TextField label="Cédula o RUC del titular" name={`${prefix}AccountHolderId`} value={account?.accountHolderId} required={prefix === 'primary'} />
    </div>;

    return <form onSubmit={event => void save(event)} className="space-y-5">
        <Card><CardHeader><CardTitle>Datos del negocio</CardTitle></CardHeader><CardContent className="space-y-4">
            <SellerLogoPicker value={logo} onChange={setLogo} />
            <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nombre del negocio" name="businessName" value={profile.businessName} required />
                <label className="block text-sm">Slug de la tienda<input className={field} value={profile.slug} disabled /></label>
                <TextField label="Dirección" name="address" value={profile.address} required />
                <TextField label="Celular del negocio" name="businessPhone" value={profile.contactPhone} required mobile />
                <TextField label="WhatsApp" name="whatsapp" value={profile.socialLinks?.whatsapp} mobile />
                <TextField label="Instagram" name="instagram" value={profile.socialLinks?.instagram} type="url" />
                <TextField label="Facebook" name="facebook" value={profile.socialLinks?.facebook} type="url" />
                <TextField label="TikTok" name="tiktok" value={profile.socialLinks?.tiktok} type="url" />
                <TextField label="Sitio web" name="website" value={profile.socialLinks?.website} type="url" />
            </div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Tributación SRI</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField label="RUC" name="ruc" value={profile.ruc} required />
            <TextField label="Celular tributario" name="taxPhone" value={profile.taxContactPhone} required mobile />
            <label className="block text-sm">Régimen SRI<select name="regimenSri" className={field} defaultValue={profile.regimenSri}><option value="GENERAL">General</option><option value="RIMPE_EMPRENDEDOR">RIMPE Emprendedor</option><option value="RIMPE_NEGOCIO_POPULAR">RIMPE Negocio Popular</option><option value="OTRO">Otro</option></select></label>
            <TextField label="Calificación artesanal JNDA" name="calificacionArtesanalJnda" value={profile.calificacionArtesanalJnda} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="obligadoContabilidad" defaultChecked={profile.obligadoContabilidad} />Obligado a llevar contabilidad</label>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Administrador</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><SellerLogoPicker label="Foto de perfil" value={profilePhoto} onChange={setProfilePhoto} /></div>
            <TextField label="Nombres" name="firstName" value={profile.adminFirstName} required />
            <TextField label="Apellidos" name="lastName" value={profile.adminLastName} required />
            <TextField label="Correo de acceso" name="emailAddress" value={profile.adminEmail} type="email" required />
            <TextField label="Celular" name="adminPhone" value={profile.adminPhone} required mobile />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Modalidades de pago y cuentas</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">{paymentLabels.map(([name, label]) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={profile.paymentModalities[name]} />{label}</label>)}</div>
            <h3 className="font-medium">Cuenta principal</h3>{bankFields('primary', profile.primaryBankAccount)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasSecondary} onChange={event => setHasSecondary(event.target.checked)} />Cuenta secundaria</label>
            {hasSecondary && <><h3 className="font-medium">Cuenta secundaria</h3>{bankFields('secondary', profile.secondaryBankAccount)}</>}
        </CardContent></Card>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button><Button variant="outline" render={<Link to="/seller-profiles/$id" params={{ id: String(profile.id) }} />}>Cancelar</Button></div>
    </form>;
}

function SellerProfileEditPage() {
    const { id } = useParams({ strict: false }) as { id: string };
    const profile = useQuery({ queryKey: ['sellerProfile', id], queryFn: () => api.query(sellerProfileDetailDocument, { id }) });
    const photo = useQuery({ queryKey: ['seller-administrator-photo', id], queryFn: () => api.query<{ sellerProfile: { administratorPhoto: SellerLogo | null } | null }>(sellerPhotoQuery, { id }) });
    const institutions = useQuery({ queryKey: ['financial-institutions'], queryFn: () => api.query<{ financialInstitutions: Institution[] }>(institutionsQuery) });
    return <PermissionGuard requires="SuperAdmin"><div className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-2xl font-semibold">Editar vendedor / almacenista</h1>
        {(profile.isLoading || institutions.isLoading || photo.isLoading) ? <p>Cargando datos…</p> : profile.error || institutions.error || photo.error ? <p role="alert">No se pudieron cargar los datos del vendedor o las instituciones.</p> : profile.data?.sellerProfile ? <EditForm profile={profile.data.sellerProfile} institutions={institutions.data?.financialInstitutions || []} initialPhoto={photo.data?.sellerProfile?.administratorPhoto ?? null} /> : <p>Perfil de vendedor no encontrado.</p>}
    </div></PermissionGuard>;
}

export const sellerProfileEdit: DashboardRouteDefinition = {
    path: '/seller-profiles/$id/edit',
    loader: () => ({ breadcrumb: [{ label: 'Vendedores', path: '/seller-profiles' }, { label: 'Editar' }] }),
    component: () => <SellerProfileEditPage />,
};
