import { api, Button, useChannel, useQuery, useQueryClient } from '@vendure/dashboard';
import { useState } from 'react';

const query = `query ChannelCombinedShippingPreference { channelCombinedShippingPreference }`;
const mutation = `mutation SetChannelCombinedShippingPreference($enabled: Boolean!) { setChannelCombinedShippingPreference(enabled: $enabled) }`;

export function CombinedShippingPreference() {
    const { activeChannel } = useChannel();
    const queryClient = useQueryClient();
    const key = ['combined-shipping-preference', activeChannel?.id];
    const result = useQuery({ queryKey: key, queryFn: () => api.query<{ channelCombinedShippingPreference: boolean | null }>(query) });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const enabled = result.data?.channelCombinedShippingPreference;

    async function save(value: boolean) {
        setBusy(true); setMessage('');
        try {
            await api.mutate(mutation, { enabled: value });
            await queryClient.invalidateQueries({ queryKey: key });
            setMessage('Preferencia guardada.');
        } catch {
            setMessage('No se pudo guardar la preferencia. Comprueba tus permisos.');
        } finally { setBusy(false); }
    }

    if (result.isLoading) return <p>Cargando preferencia…</p>;
    if (result.error) return <p role="alert">No se pudo cargar la preferencia de envío.</p>;
    if (enabled == null) return <p className="text-sm">Selecciona el canal de un vendedor para configurar su preferencia.</p>;
    return <div className="space-y-3">
        <p className="text-sm">Permite que este almacén participe en la coordinación de envíos con otros vendedores.</p>
        <p className="text-sm text-muted-foreground">Esta preferencia aún no activa envíos conjuntos ni modifica el precio del checkout.</p>
        <p className="text-sm">Estado: <strong>{enabled ? 'Permitido' : 'No permitido'}</strong></p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save(!enabled)}>{enabled ? 'Desactivar' : 'Permitir envío conjunto'}</Button>
        {message && <p role="status" className="text-sm">{message}</p>}
    </div>;
}
