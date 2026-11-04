import { api, useChannel, useQuery } from '@vendure/dashboard';
import { useEffect, useState } from 'react';

type Reservation = { id: string; orderCode: string; expiresAt: string; serverTime: string; status: string };
const query = `query ReservationClock($id: ID!) { order(id: $id) { marketplaceReservations { id orderCode expiresAt serverTime status } } }`;

export function ReservationCountdown({ orderId }: { orderId: string }) {
    const { activeChannel } = useChannel();
    const [elapsed, setElapsed] = useState(0);
    const result = useQuery({ queryKey: ['reservation-clock', activeChannel?.id, orderId], queryFn: async () => {
        const data = await api.query<{ order: { marketplaceReservations: Reservation[] } | null }>(query, { id: orderId });
        return { rows: data.order?.marketplaceReservations || [], receivedAt: performance.now() };
    }, enabled: Boolean(orderId && activeChannel?.id), refetchInterval: 15000 });
    useEffect(() => {
        const tick = () => setElapsed(result.data ? performance.now() - result.data.receivedAt : 0);
        tick();
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [result.data]);
    if (result.error) return <p role="alert" className="text-sm text-destructive">No se pudo actualizar el estado de la reserva.</p>;
    return <div className="space-y-2">{result.data?.rows.map(row => {
        const seconds = Math.max(0, Math.ceil((Date.parse(row.expiresAt) - Date.parse(row.serverTime) - elapsed) / 1000));
        const status = row.status === 'PENDING' ? seconds ? `Tiempo para confirmar el pago: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Plazo vencido; pendiente de liberación automática' : row.status === 'PAID' ? 'Pago confirmado: pares comprometidos hasta el despacho' : row.status === 'EXPIRED' ? 'Reserva expirada y liberada' : 'Reserva cancelada';
        return <p key={row.id} role="timer" aria-live="off" className="rounded-md border p-3 text-sm"><strong>{row.orderCode}</strong> · {status}</p>;
    })}</div>;
}
