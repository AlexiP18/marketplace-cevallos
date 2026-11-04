import { api, Button, useChannel, useQuery } from '@vendure/dashboard';
import { useState, type FormEvent } from 'react';
import { buildStatisticsReportPdf } from '../../statistics/dashboard/statistics-report-pdf';
import { ReservationCountdown } from './reservation-countdown';

type DispatchOrder = { id: string; code: string; state: string; total: number; currency: string; customer: string; email: string; address: Record<string, string>; lines: Array<{ id: string; sku: string; name: string; quantity: number; total: number }>; operation: { status?: string; reference?: string; institution?: string; reason?: string; delivery?: { code: string; carrier: string; trackingCode: string; date: string } } };
const query = `query DispatchOrders { warehouseDispatchOrders }`;
const field = 'mt-1 block h-9 w-full rounded-md border bg-background px-2';
const money = (value: number, currency: string) => new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(value / 100);

export function DispatchPage() {
    const { activeChannel } = useChannel();
    const result = useQuery({ queryKey: ['warehouse-dispatch', activeChannel?.id], queryFn: () => api.query<{ warehouseDispatchOrders: DispatchOrder[] }>(query), enabled: Boolean(activeChannel?.id) });
    const [selected, setSelected] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [reason, setReason] = useState('');
    const order = result.data?.warehouseDispatchOrders.find(item => item.id === selected);
    async function action(run: () => Promise<unknown>) {
        setBusy(true); setMessage('');
        try { await run(); await result.refetch(); setMessage('Operación registrada correctamente.'); }
        catch (error) { setMessage(String(error instanceof Error ? error.message : error).replace(/^GraphQL Request Error:\s*/, '').split('\n')[0]); }
        finally { setBusy(false); }
    }
    async function upload(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const file = form.get('file') as File;
        if (!file || file.size > 524288) { setMessage('Selecciona un JPG, PNG o PDF de hasta 512 KB.'); return; }
        const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        await action(() => api.mutate(`mutation Proof($orderId: ID!, $reference: String!, $institution: String!, $amount: Int!, $file: String!) { saveWarehousePaymentProof(orderId: $orderId, reference: $reference, institution: $institution, amount: $amount, file: $file) }`, { orderId: selected, reference: String(form.get('reference')), institution: String(form.get('institution')), amount: Math.round(Number(form.get('amount')) * 100), file: encoded }));
    }
    async function viewProof() {
        await action(async () => {
            const data = await api.query<{ warehousePaymentProof: string }>(`query Proof($id: ID!) { warehousePaymentProof(orderId: $id) }`, { id: selected });
            const blob = await (await fetch(data.warehousePaymentProof)).blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = `comprobante-${order?.code}.${blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : 'jpg'}`; link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        });
    }
    function deliveryPdf() {
        if (!order?.operation.delivery) return;
        const delivery = order.operation.delivery;
        buildStatisticsReportPdf({ title: `Nota de entrega ${delivery.code}`, channel: activeChannel?.code || '', period: delivery.date.slice(0, 10), scope: 'Despachado', metrics: [['Cliente', order.customer], ['Correo', order.email], ['Dirección', Object.values(order.address || {}).filter(Boolean).join(', ')], ['Pedido', order.code], ['Transportista', delivery.carrier], ['Guía', delivery.trackingCode], ['Total del pedido', money(order.total, order.currency)]], sections: [{ title: 'Pares despachados', columns: ['SKU', 'Variante', 'Cantidad', 'Importe'], rows: order.lines.map(line => [line.sku, line.name, line.quantity, money(line.total, order.currency)]) }] }).save(`${delivery.code}.pdf`);
    }
    return <div className="space-y-5 p-6"><h1 className="text-2xl font-semibold">Pagos y despacho</h1>
        <p className="text-sm text-muted-foreground">Valida el comprobante antes del alistamiento. El despacho requiere todos los pares escaneados.</p>
        {result.error && <p role="alert">No se pudieron cargar los pedidos. Comprueba tus permisos y el canal.</p>}
        <label className="block text-sm">Pedido<select className={field} value={selected} onChange={event => { setSelected(event.target.value); setMessage(''); setReason(''); }}><option value="">Selecciona un pedido</option>{result.data?.warehouseDispatchOrders.map(item => <option key={item.id} value={item.id}>{item.code} · {item.customer} · {item.state}</option>)}</select></label>
        {message && <p role="status" className="rounded-md border p-3">{message}</p>}
        {order && <>
            <ReservationCountdown orderId={order.id} />
            <div className="rounded-md border p-4"><strong>{order.customer}</strong> · {money(order.total, order.currency)}<p>{order.state === 'PaymentSettled' ? 'Pago confirmado — aprobado para empaque' : order.state}</p><p>Comprobante: {order.operation.status || 'Sin adjuntar'} {order.operation.reference} {order.operation.reason}</p></div>
            {order.state === 'ArrangingPayment' && <form onSubmit={event => void upload(event)} className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
                <label className="text-sm">Referencia bancaria<input name="reference" className={field} required minLength={3} maxLength={100} /></label><label className="text-sm">Entidad emisora<input name="institution" className={field} required minLength={3} maxLength={150} /></label>
                <label className="text-sm">Importe ({order.currency})<input name="amount" type="number" min="0.01" step="0.01" defaultValue={order.total / 100} key={order.id} className={field} required /></label><label className="text-sm">Comprobante (máximo 512 KB)<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required className="mt-2 block" /></label><Button disabled={busy}>Guardar comprobante</Button>
            </form>}
            {order.operation.status && <Button variant="outline" disabled={busy} onClick={() => void viewProof()}>Descargar comprobante</Button>}
            {order.operation.status === 'PENDING' && <div className="flex flex-wrap items-end gap-3 rounded-md border p-4"><Button disabled={busy} onClick={() => void action(() => api.mutate(`mutation Approve($id: ID!) { reviewWarehousePayment(orderId: $id, approve: true) }`, { id: selected }))}>Aprobar pago</Button><label className="text-sm">Motivo de rechazo<input className={field} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} /></label><Button variant="destructive" disabled={busy || reason.trim().length < 5} onClick={() => void action(() => api.mutate(`mutation Reject($id: ID!, $reason: String!) { reviewWarehousePayment(orderId: $id, approve: false, reason: $reason) }`, { id: selected, reason }))}>Rechazar y liberar reserva</Button></div>}
            {order.state === 'PaymentSettled' && !order.operation.delivery && <form className="flex flex-wrap items-end gap-3 rounded-md border p-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void action(() => api.mutate(`mutation Dispatch($id: ID!, $carrier: String!, $tracking: String!) { dispatchWarehouseOrder(orderId: $id, carrier: $carrier, trackingCode: $tracking) }`, { id: selected, carrier: String(form.get('carrier')), tracking: String(form.get('tracking')) })); }}><label className="text-sm">Transportista o entrega a domicilio<input name="carrier" className={field} required minLength={3} maxLength={150} /></label><label className="text-sm">Número de guía<input name="tracking" className={field} required minLength={3} maxLength={100} /></label><Button disabled={busy}>Confirmar despacho</Button></form>}
            {order.operation.delivery && <Button onClick={deliveryPdf}>Descargar nota de entrega PDF</Button>}
        </>}
    </div>;
}
