import { api, Button, useQuery, useQueryClient } from '@vendure/dashboard';
import { useState } from 'react';
import { formatEcuadorianMobile } from './seller-profile-create';
import { SellerLogoPicker, type SellerLogo } from './seller-logo-picker';

const personalDataQuery = `query MyAdministratorPersonalData {
    myAdministratorPersonalData { phone photo { id preview } }
    currentSellerProfile { businessName }
}`;
const updatePersonalData = `mutation UpdateMyAdministratorPersonalData($input: UpdateMyPersonalDataInput!) {
    updateMyAdministratorPersonalData(input: $input) { phone photo { id preview } }
}`;
type PersonalData = { myAdministratorPersonalData: { phone: string | null; photo: SellerLogo | null } | null; currentSellerProfile: { businessName: string } | null };

function PersonalDataForm({ data }: { data: PersonalData }) {
    const queryClient = useQueryClient();
    const [phone, setPhone] = useState(data.myAdministratorPersonalData?.phone || '');
    const [photo, setPhoto] = useState<SellerLogo | null>(data.myAdministratorPersonalData?.photo || null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);

    async function save() {
        const digits = phone.replace(/\D/g, '');
        if ((digits && (digits.length !== 10 || !digits.startsWith('09'))) || (!digits && data.currentSellerProfile)) {
            setFailed(true); setMessage('Ingresa un celular ecuatoriano de 10 dígitos que comience con 09.'); return;
        }
        setBusy(true); setMessage('');
        try {
            await api.mutate(updatePersonalData, { input: { phone: phone || null, photoAssetId: photo?.id ?? null } });
            await queryClient.invalidateQueries({ queryKey: ['my-administrator-personal-data'] });
            await queryClient.invalidateQueries({ queryKey: ['sellerProfile'] });
            await queryClient.invalidateQueries({ queryKey: ['seller-administrator-photo'] });
            setFailed(false); setMessage('Datos personales guardados.');
        } catch (cause) {
            setFailed(true); setMessage(cause instanceof Error ? cause.message.replace(/^GraphQL Request Error:\s*/i, '') : 'No se pudieron guardar los datos personales.');
        } finally { setBusy(false); }
    }

    return <div className="space-y-4">
        <SellerLogoPicker label="Foto de perfil" value={photo} onChange={setPhoto} />
        <label className="block text-sm">Celular{data.currentSellerProfile ? ' *' : ''}
            <input type="tel" inputMode="numeric" value={phone} onChange={event => setPhone(formatEcuadorianMobile(event.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-3" />
        </label>
        {data.currentSellerProfile && <p className="text-xs text-muted-foreground">Datos asociados al vendedor {data.currentSellerProfile.businessName}.</p>}
        {message && <p role={failed ? 'alert' : 'status'} className={`text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>}
        <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar foto y celular'}</Button>
    </div>;
}

export function AdministratorPersonalProfileBlock() {
    const data = useQuery({ queryKey: ['my-administrator-personal-data'], queryFn: () => api.query<PersonalData>(personalDataQuery) });
    if (data.isLoading) return <p className="text-sm">Cargando datos personales…</p>;
    if (data.error || !data.data) return <p role="alert" className="text-sm text-destructive">No se pudieron cargar los datos personales.</p>;
    return <PersonalDataForm data={data.data} />;
}
