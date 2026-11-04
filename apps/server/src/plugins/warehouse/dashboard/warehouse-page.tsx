import { api, Button, Card, CardContent, CardHeader, CardTitle, PermissionGuard, useChannel, useQuery, useQueryClient } from '@vendure/dashboard';
import { type FormEvent, useEffect, useRef, useState } from 'react';

type Shelf = { id: string; code: string; description: string; active: boolean; pairs: number };
type Stock = { variantId: string; sku: string; variantName: string; shelfId: string; shelfCode: string; onHand: number; allocated: number; available: number };
type Unlocated = { variantId: string; sourceLocationId: string; sku: string; sourceName: string; onHand: number; allocated: number };
type PickOrder = { id: string; code: string; state: string; lines: Array<{ id: string; variantId: string; sku: string; quantity: number; scanned: number; unlocated: number; shelves: Array<{ shelfId: string; code: string; quantity: number; scanned: number }> }> };
type KardexEntry = { id: string; createdAt: string; type: string; quantity: number; sku: string; modelCode?: string; locationCode: string; actorUserId?: string; actorName?: string; operation?: string; reason?: string; onHandAfter: number; allocatedAfter: number };

const shelvesQuery = `query WarehouseShelves { warehouseShelves { id code description active pairs } }`;
const inventoryQuery = `query WarehouseInventory($search: String) { warehouseInventory(search: $search) { variantId sku variantName shelfId shelfCode onHand allocated available } }`;
const unlocatedQuery = `query WarehouseUnlocated { warehouseUnlocatedStock { variantId sourceLocationId sku sourceName onHand allocated } }`;
const pickQuery = `query WarehousePickOrders { warehousePickOrders { id code state lines { id variantId sku quantity scanned unlocated shelves { shelfId code quantity scanned } } } }`;
const kardexQuery = `query WarehouseKardex($filter: WarehouseKardexFilter) { warehouseKardex(filter: $filter) { totalItems items { id createdAt type quantity sku modelCode locationCode actorUserId actorName operation reason onHandAfter allocatedAfter } } }`;
const actorsQuery = `query WarehouseKardexActors { warehouseKardexActors { id name } }`;
const createShelfMutation = `mutation CreateWarehouseShelf($input: CreateWarehouseShelfInput!) { createWarehouseShelf(input: $input) { id } }`;
const receiveMutation = `mutation ReceiveWarehouseStock($input: WarehouseStockInput!) { receiveWarehouseStock(input: $input) { variantId onHand } }`;
const placeMutation = `mutation PlaceWarehouseStock($input: WarehousePlacementInput!) { placeWarehouseStock(input: $input) { variantId onHand } }`;
const moveMutation = `mutation MoveWarehouseStock($input: WarehouseMoveInput!) { moveWarehouseStock(input: $input) { variantId onHand } }`;
const adjustMutation = `mutation AdjustWarehouseStock($input: WarehouseStockInput!) { adjustWarehouseStock(input: $input) { variantId onHand } }`;
const scanMutation = `mutation ScanWarehousePair($input: WarehouseScanInput!) { scanWarehousePair(input: $input) { id scanned expected shelfCode } }`;
const variantsQuery = `query WarehouseVariantSearch($search: String!) { productVariants(options: { take: 30, filter: { sku: { contains: $search } } }) { items { id sku name } } }`;
const fieldClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';

function messageOf(error: unknown) {
    return error instanceof Error ? error.message.replace(/^GraphQL Request Error:\s*/i, '') : 'No se pudo completar la operación.';
}

function useWarehouseQuery<T>(key: string, query: string, variables?: Record<string, unknown>) {
    const { activeChannel } = useChannel();
    return useQuery({ queryKey: [key, activeChannel?.id, variables], queryFn: () => api.query<T>(query, variables) });
}

function Receipts() {
    const { activeChannel } = useChannel();
    const client = useQueryClient();
    const { data: shelvesData, error: shelvesError } = useWarehouseQuery<{ warehouseShelves: Shelf[] }>('warehouse-shelves', shelvesQuery);
    const { data: stockData } = useWarehouseQuery<{ warehouseInventory: Stock[] }>('warehouse-inventory', inventoryQuery);
    const { data: unlocatedData } = useWarehouseQuery<{ warehouseUnlocatedStock: Unlocated[] }>('warehouse-unlocated', unlocatedQuery);
    const [variantSearch, setVariantSearch] = useState('');
    const [selectedVariant, setSelectedVariant] = useState('');
    const { data: variantsData } = useWarehouseQuery<{ productVariants: { items: Array<{ id: string; sku: string; name: string }> } }>('warehouse-variants', variantsQuery, { search: variantSearch });
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<'receive' | 'adjust'>('receive');

    async function createShelf(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true); setMessage('');
        try {
            await api.mutate(createShelfMutation, { input: { code: String(data.get('code') || ''), description: String(data.get('description') || ''), sourceLocationId: String(data.get('sourceLocationId') || '') || undefined } });
            form.reset(); await Promise.all(['warehouse-shelves', 'warehouse-inventory', 'warehouse-unlocated', 'warehouse-picking'].map(key => client.invalidateQueries({ queryKey: [key, activeChannel?.id] })));
            setMessage(data.get('sourceLocationId') ? 'Ubicación vinculada a la percha; se conservaron las existencias, reservas e historial.' : 'Percha creada.');
        } catch (error) { setMessage(messageOf(error)); } finally { setBusy(false); }
    }

    async function postStock(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true); setMessage('');
        try {
            await api.mutate(mode === 'receive' ? receiveMutation : adjustMutation, { input: {
                variantId: selectedVariant, shelfId: String(data.get('shelfId') || ''),
                quantity: Number(data.get('quantity')), reason: String(data.get('reason') || ''),
            } });
            form.reset(); setSelectedVariant(''); setVariantSearch('');
            await Promise.all(['warehouse-inventory', 'warehouse-unlocated', 'warehouse-shelves', 'warehouse-kardex'].map(key => client.invalidateQueries({ queryKey: [key, activeChannel?.id] })));
            setMessage(mode === 'receive' ? 'Recepción confirmada y stock actualizado.' : 'Ajuste registrado en el kardex.');
        } catch (error) { setMessage(messageOf(error)); } finally { setBusy(false); }
    }

    async function placeStock(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const source = unlocatedData?.warehouseUnlocatedStock.find(row => `${row.variantId}:${row.sourceLocationId}` === data.get('source'));
        if (!source) return;
        setBusy(true); setMessage('');
        try {
            await api.mutate(placeMutation, { input: { variantId: source.variantId, sourceLocationId: source.sourceLocationId, shelfId: String(data.get('shelfId')), quantity: Number(data.get('quantity')) } });
            form.reset();
            await Promise.all(['warehouse-inventory', 'warehouse-unlocated', 'warehouse-shelves', 'warehouse-kardex'].map(key => client.invalidateQueries({ queryKey: [key, activeChannel?.id] })));
            setMessage('Pares trasladados a la percha sin cambiar el total del inventario.');
        } catch (error) { setMessage(messageOf(error)); } finally { setBusy(false); }
    }

    async function moveStock(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const source = stockData?.warehouseInventory.find(row => `${row.variantId}:${row.shelfId}` === data.get('source'));
        if (!source) return;
        setBusy(true); setMessage('');
        try {
            await api.mutate(moveMutation, { input: { variantId: source.variantId, fromShelfId: source.shelfId, toShelfId: String(data.get('toShelfId')), quantity: Number(data.get('quantity')), reason: String(data.get('reason') || '') } });
            form.reset();
            await Promise.all(['warehouse-inventory', 'warehouse-shelves', 'warehouse-kardex'].map(key => client.invalidateQueries({ queryKey: [key, activeChannel?.id] })));
            setMessage('Pares trasladados entre perchas sin cambiar el total.');
        } catch (error) { setMessage(messageOf(error)); } finally { setBusy(false); }
    }

    return <div className="mx-auto max-w-7xl space-y-5 p-6">
        <div><h1 className="text-2xl font-semibold">Recepción física y perchas</h1><p className="text-sm text-muted-foreground">Canal: {activeChannel?.code || 'Selecciona tu almacén'}. El ingreso se suma al stock físico de la percha elegida.</p></div>
        {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
        {shelvesError && <p role="alert" className="text-destructive">No se pudieron cargar las perchas. Selecciona el canal de tu almacén.</p>}
        <div className="grid gap-5 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Perchas y ubicaciones</CardTitle></CardHeader><CardContent className="space-y-4">
                <PermissionGuard requires="UpdateSeller"><form onSubmit={event => void createShelf(event)} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <label className="text-sm">Código<input name="code" className={fieldClass} placeholder="P-A01" required maxLength={60} /></label>
                    <label className="text-sm">Descripción<input name="description" className={fieldClass} placeholder="Fila A, nivel 1" maxLength={255} /></label>
                    <label className="text-sm sm:col-span-2">Ubicación anterior (opcional)<select name="sourceLocationId" className={fieldClass}><option value="">Crear una ubicación nueva</option>{Array.from(new Map((unlocatedData?.warehouseUnlocatedStock || []).map(row => [row.sourceLocationId, row])).values()).map(row => <option key={row.sourceLocationId} value={row.sourceLocationId}>{row.sourceName}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Vincula una ubicación existente para conservar sus pares y reservas sin mover ni duplicar stock.</span></label><Button type="submit" disabled={busy} className="self-end">Agregar</Button>
                </form></PermissionGuard>
                <div className="max-h-72 overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-2 text-left">Percha</th><th className="p-2 text-left">Descripción</th><th className="p-2 text-right">Pares</th></tr></thead><tbody>{shelvesData?.warehouseShelves.map(shelf => <tr key={shelf.id} className="border-t"><td className="p-2 font-medium">{shelf.code}</td><td className="p-2">{shelf.description || '—'}</td><td className="p-2 text-right">{shelf.pairs}</td></tr>)}</tbody></table></div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Registrar movimiento físico</CardTitle></CardHeader><CardContent>
                <form onSubmit={event => void postStock(event)} className="space-y-3">
                    <div className="flex gap-2"><Button type="button" variant={mode === 'receive' ? 'default' : 'outline'} onClick={() => setMode('receive')}>Ingreso del taller</Button><PermissionGuard requires="UpdateSeller"><Button type="button" variant={mode === 'adjust' ? 'default' : 'outline'} onClick={() => setMode('adjust')}>Ajuste justificado</Button></PermissionGuard></div>
                    <label className="block text-sm">Buscar variante por SKU<input className={fieldClass} value={variantSearch} onChange={event => { setVariantSearch(event.target.value); setSelectedVariant(''); }} placeholder="Código SKU" /></label>
                    <label className="block text-sm">Variante<select className={fieldClass} value={selectedVariant} onChange={event => setSelectedVariant(event.target.value)} required><option value="">Selecciona una variante</option>{variantsData?.productVariants.items.map(variant => <option key={variant.id} value={variant.id}>{variant.sku} · {variant.name}</option>)}</select></label>
                    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Percha<select name="shelfId" className={fieldClass} required><option value="">Selecciona una percha</option>{shelvesData?.warehouseShelves.filter(shelf => shelf.active).map(shelf => <option key={shelf.id} value={shelf.id}>{shelf.code}</option>)}</select></label><label className="text-sm">{mode === 'receive' ? 'Pares recibidos' : 'Diferencia de pares (+ / -)'}<input name="quantity" type="number" step="1" min={mode === 'receive' ? 1 : undefined} className={fieldClass} required /></label></div>
                    <label className="block text-sm">Referencia o motivo<input name="reason" className={fieldClass} placeholder={mode === 'receive' ? 'Remisión del taller' : 'Explica el conteo o merma'} minLength={mode === 'adjust' ? 8 : undefined} required={mode === 'adjust'} maxLength={500} /></label>
                    <Button type="submit" disabled={busy || !selectedVariant}>{busy ? 'Guardando…' : mode === 'receive' ? 'Confirmar recepción' : 'Registrar ajuste'}</Button>
                </form>
            </CardContent></Card>
        </div>
        <PermissionGuard requires="UpdateSeller">{!!unlocatedData?.warehouseUnlocatedStock.length && <Card><CardHeader><CardTitle>Stock anterior sin percha</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Ubica pares ya registrados. Este traslado conserva el total de existencias y excluye pares reservados.</p><form onSubmit={event => void placeStock(event)} className="grid gap-3 sm:grid-cols-4"><label className="text-sm">Origen<select name="source" className={fieldClass} required><option value="">Selecciona variante</option>{unlocatedData.warehouseUnlocatedStock.map(row => <option key={`${row.variantId}:${row.sourceLocationId}`} value={`${row.variantId}:${row.sourceLocationId}`}>{row.sku} · {row.sourceName} · {row.onHand - row.allocated} libres</option>)}</select></label><label className="text-sm">Percha de destino<select name="shelfId" className={fieldClass} required><option value="">Selecciona percha</option>{shelvesData?.warehouseShelves.filter(shelf => shelf.active).map(shelf => <option key={shelf.id} value={shelf.id}>{shelf.code}</option>)}</select></label><label className="text-sm">Pares<input name="quantity" type="number" min="1" step="1" className={fieldClass} required /></label><Button type="submit" className="self-end" disabled={busy}>Ubicar pares</Button></form></CardContent></Card>}</PermissionGuard>
        {!!stockData?.warehouseInventory.length && <Card><CardHeader><CardTitle>Trasladar entre perchas</CardTitle></CardHeader><CardContent><form onSubmit={event => void moveStock(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-sm">Variante y origen<select name="source" className={fieldClass} required><option value="">Selecciona stock libre</option>{stockData.warehouseInventory.filter(row => row.available > 0).map(row => <option key={`${row.variantId}:${row.shelfId}`} value={`${row.variantId}:${row.shelfId}`}>{row.sku} · {row.shelfCode} · {row.available} libres</option>)}</select></label><label className="text-sm">Destino<select name="toShelfId" className={fieldClass} required><option value="">Selecciona percha</option>{shelvesData?.warehouseShelves.filter(shelf => shelf.active).map(shelf => <option key={shelf.id} value={shelf.id}>{shelf.code}</option>)}</select></label><label className="text-sm">Pares<input name="quantity" type="number" min="1" step="1" className={fieldClass} required /></label><label className="text-sm">Motivo<input name="reason" className={fieldClass} required minLength={4} maxLength={400} placeholder="Reorganización de bodega" /></label><Button type="submit" className="self-end" disabled={busy}>Trasladar</Button></form></CardContent></Card>}
        <Card><CardHeader><CardTitle>Existencias ubicadas</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-2">Variante</th><th className="p-2">Percha</th><th className="p-2 text-right">Físico</th><th className="p-2 text-right">Reservado</th><th className="p-2 text-right">Libre</th></tr></thead><tbody>{stockData?.warehouseInventory.map(row => <tr key={`${row.variantId}-${row.shelfId}`} className="border-t"><td className="p-2"><span className="font-medium">{row.sku}</span><br />{row.variantName}</td><td className="p-2">{row.shelfCode}</td><td className="p-2 text-right">{row.onHand}</td><td className="p-2 text-right">{row.allocated}</td><td className="p-2 text-right">{row.available}</td></tr>)}</tbody></table></div>{!stockData?.warehouseInventory.length && <p className="pt-3 text-sm text-muted-foreground">Todavía no hay existencias ubicadas en perchas.</p>}</CardContent></Card>
    </div>;
}

function Scanner({ onCode }: { onCode: (code: string) => void }) {
    const video = useRef<HTMLVideoElement>(null);
    const callback = useRef(onCode);
    useEffect(() => { callback.current = onCode; }, [onCode]);
    const [enabled, setEnabled] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        let stream: MediaStream | undefined;
        let frame = 0;
        const Detector = (window as unknown as { BarcodeDetector?: { new (options: { formats: string[] }): { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> }; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        const start = async () => {
            try {
                let detector: InstanceType<NonNullable<typeof Detector>> | undefined;
                try { if (Detector && (!Detector.getSupportedFormats || (await Detector.getSupportedFormats()).includes('qr_code'))) detector = new Detector({ formats: ['qr_code'] }); } catch { /* Use the free software decoder below. */ }
                let decoder = detector ? undefined : (await import('jsqr')).default;
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!active) return;
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara requiere HTTPS o localhost.');
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (!active || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
                video.current.srcObject = stream;
                await video.current.play();
                let previous = 0;
                const detect = async () => {
                    if (!active || !video.current) return;
                    if (video.current.readyState >= 2 && performance.now() - previous >= 100) {
                        previous = performance.now();
                        let value: string | undefined;
                        if (detector) {
                            try { value = (await detector.detect(video.current))[0]?.rawValue; }
                            catch { detector = undefined; decoder = (await import('jsqr')).default; }
                        }
                        if (decoder && context) {
                            canvas.width = Math.min(640, video.current.videoWidth);
                            canvas.height = Math.round(canvas.width * video.current.videoHeight / video.current.videoWidth);
                            context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
                            const image = context.getImageData(0, 0, canvas.width, canvas.height);
                            value = decoder(image.data, image.width, image.height)?.data;
                        }
                        if (active && value) { callback.current(value); setEnabled(false); return; }
                    }
                    frame = window.requestAnimationFrame(() => { void detect(); });
                };
                void detect();
            } catch { if (active) { setError('No se pudo abrir la cámara. Usa HTTPS y revisa los permisos, o conecta un lector QR.'); setEnabled(false); } }
        };
        void start();
        return () => { active = false; window.cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
    }, [enabled]);
    return <div className="space-y-2"><Button type="button" variant="outline" onClick={() => { setError(''); setEnabled(!enabled); }}>{enabled ? 'Cerrar cámara' : 'Escanear con cámara'}</Button>{enabled && <video ref={video} muted playsInline className="max-h-52 w-full rounded-md bg-black object-contain" />}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}

function Picking() {
    const { activeChannel } = useChannel();
    const client = useQueryClient();
    const { data, error } = useWarehouseQuery<{ warehousePickOrders: PickOrder[] }>('warehouse-picking', pickQuery);
    const [lineId, setLineId] = useState('');
    const [shelfId, setShelfId] = useState('');
    const [code, setCode] = useState('');
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);
    const [busy, setBusy] = useState(false);
    const selectedLine = data?.warehousePickOrders.flatMap(order => order.lines).find(line => line.id === lineId);

    async function scan(value: string) {
        if (!lineId || !shelfId) { setSuccess(false); setMessage('Selecciona la línea y la percha antes de escanear.'); return; }
        setBusy(true); setMessage('');
        try {
            const response = await api.mutate<{ scanWarehousePair: { scanned: number; expected: number; shelfCode: string } }>(scanMutation, { input: { orderLineId: lineId, shelfId, code: value } });
            setSuccess(true); setMessage(`✓ Coincide. ${response.scanWarehousePair.scanned} de ${response.scanWarehousePair.expected} pares validados en ${response.scanWarehousePair.shelfCode}.`);
            setCode(''); await client.invalidateQueries({ queryKey: ['warehouse-picking', activeChannel?.id] });
        } catch (error) { setSuccess(false); setMessage(`✗ ${messageOf(error)}`); } finally { setBusy(false); }
    }

    return <div className="mx-auto max-w-7xl space-y-5 p-6">
        <div><h1 className="text-2xl font-semibold">Alistamiento con QR</h1><p className="text-sm text-muted-foreground">El pedido indica las perchas asignadas. Escanea cada caja antes del despacho. Usa etiquetas nuevas con QR individual.</p></div>
        {error && <p role="alert" className="text-destructive">No se pudieron cargar los pedidos del almacén.</p>}
        <PermissionGuard requires="ReadProduct"><Card><CardHeader><CardTitle>Validar par físico</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3"><label className="block text-sm">Línea de pedido<select className={fieldClass} value={lineId} onChange={event => { setLineId(event.target.value); setShelfId(''); }}><option value="">Selecciona pedido y variante</option>{data?.warehousePickOrders.flatMap(order => order.lines.map(line => <option key={line.id} value={line.id}>{order.code} · {line.sku} · {line.scanned}/{line.quantity}</option>))}</select></label><label className="block text-sm">Percha<select className={fieldClass} value={shelfId} onChange={event => setShelfId(event.target.value)}><option value="">Selecciona la ubicación</option>{selectedLine?.shelves.map(shelf => <option key={shelf.shelfId} value={shelf.shelfId}>{shelf.code} · {shelf.scanned}/{shelf.quantity}</option>)}</select></label></div>
            <div className="space-y-3"><Scanner onCode={value => void scan(value)} /><form onSubmit={event => { event.preventDefault(); void scan(code); }} className="flex gap-2"><input className={fieldClass} value={code} onChange={event => setCode(event.target.value)} placeholder="QR individual de la caja" aria-label="Código QR leído" /><Button type="submit" disabled={busy || !code.trim()}>Validar</Button></form>{message && <p role="status" className={`rounded-md p-2 text-sm ${success ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>{message}</p>}</div>
        </CardContent></Card></PermissionGuard>
        <div className="space-y-4">{data?.warehousePickOrders.map(order => <Card key={order.id}><CardHeader><CardTitle>Pedido {order.code}</CardTitle></CardHeader><CardContent>{order.lines.filter(line => line.unlocated > 0).map(line => <p key={line.id} role="alert" className="mb-3 rounded-md bg-amber-100 p-3 text-sm text-amber-950">{line.sku}: {line.unlocated} pares reservados sin percha activa. El administrador debe regularizar esta reserva antes del alistamiento y despacho.</p>)}<div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-2">Variante</th><th className="p-2">Percha</th><th className="p-2 text-right">Requeridos</th><th className="p-2 text-right">Validados</th><th className="p-2">Estado</th></tr></thead><tbody>{order.lines.flatMap(line => line.shelves.map(shelf => <tr key={`${line.id}-${shelf.shelfId}`} className="border-t"><td className="p-2">{line.sku}</td><td className="p-2 font-medium">{shelf.code}</td><td className="p-2 text-right">{shelf.quantity}</td><td className="p-2 text-right">{shelf.scanned}</td><td className={`p-2 ${shelf.scanned >= shelf.quantity ? 'text-green-700' : 'text-amber-700'}`}>{shelf.scanned >= shelf.quantity ? '✓ Validado' : 'Pendiente'}</td></tr>))}</tbody></table></div><p className="mt-3 text-sm">{order.lines.every(line => line.unlocated === 0 && line.shelves.every(shelf => shelf.scanned >= shelf.quantity)) ? 'Pedido validado. Ya puedes registrar el despacho en el pedido.' : 'El despacho queda bloqueado hasta validar todos los pares.'}</p></CardContent></Card>)}</div>
        {!data?.warehousePickOrders.length && <p className="text-sm text-muted-foreground">No hay pedidos pagados pendientes de alistamiento en este canal.</p>}
    </div>;
}

function Kardex() {
    const [filter, setFilter] = useState({ sku: '', type: '', from: '', to: '', userId: '', skip: 0, take: 30 });
    const { data, error } = useWarehouseQuery<{ warehouseKardex: { totalItems: number; items: KardexEntry[] } }>('warehouse-kardex', kardexQuery, { filter: Object.fromEntries(Object.entries(filter).filter(([key, value]) => value || key === 'skip' || key === 'take')) });
    const { data: actors } = useWarehouseQuery<{ warehouseKardexActors: Array<{ id: string; name: string }> }>('warehouse-kardex-actors', actorsQuery);
    return <div className="mx-auto max-w-7xl space-y-5 p-6"><div><h1 className="text-2xl font-semibold">Kardex de existencias</h1><p className="text-sm text-muted-foreground">Movimientos cronológicos de Vendure, sin edición ni eliminación desde esta bitácora.</p></div>
        <Card><CardHeader><CardTitle>Filtros</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm">SKU o código del modelo<input className={fieldClass} value={filter.sku} onChange={event => setFilter({ ...filter, sku: event.target.value, skip: 0 })} /></label>
            <label className="text-sm">Movimiento<select className={fieldClass} value={filter.type} onChange={event => setFilter({ ...filter, type: event.target.value, skip: 0 })}><option value="">Todos</option>{['ADJUSTMENT', 'ALLOCATION', 'RELEASE', 'SALE', 'CANCELLATION'].map(type => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="text-sm">Desde<input type="date" className={fieldClass} value={filter.from} onChange={event => setFilter({ ...filter, from: event.target.value, skip: 0 })} /></label>
            <label className="text-sm">Hasta<input type="date" className={fieldClass} value={filter.to} onChange={event => setFilter({ ...filter, to: event.target.value, skip: 0 })} /></label>
            <label className="text-sm">Usuario<select className={fieldClass} value={filter.userId} onChange={event => setFilter({ ...filter, userId: event.target.value, skip: 0 })}><option value="">Todos</option>{actors?.warehouseKardexActors.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
        </CardContent></Card>
        {error && <p role="alert" className="text-destructive">No se pudo cargar el kardex. Revisa los filtros y el canal activo.</p>}
        <Card><CardHeader><CardTitle>Movimientos ({data?.warehouseKardex.totalItems || 0})</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-2">Fecha</th><th className="p-2">Modelo / SKU</th><th className="p-2">Ubicación</th><th className="p-2">Tipo</th><th className="p-2 text-right">Cantidad</th><th className="p-2 text-right">Físico</th><th className="p-2 text-right">Reservado</th><th className="p-2">Usuario / motivo</th></tr></thead><tbody>{data?.warehouseKardex.items.map(row => <tr key={row.id} className="border-t"><td className="whitespace-nowrap p-2">{new Date(row.createdAt).toLocaleString('es-EC')}</td><td className="p-2">{row.modelCode || '—'} / {row.sku}</td><td className="p-2">{row.locationCode}</td><td className="p-2">{row.operation || row.type}</td><td className="p-2 text-right">{row.quantity}</td><td className="p-2 text-right">{row.onHandAfter}</td><td className="p-2 text-right">{row.allocatedAfter}</td><td className="p-2">{row.actorName || 'Sistema'}{row.reason ? ` · ${row.reason}` : ''}</td></tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-end gap-3"><Button variant="outline" disabled={filter.skip === 0} onClick={() => setFilter({ ...filter, skip: Math.max(0, filter.skip - filter.take) })}>Anterior</Button><span className="text-sm">{filter.skip + 1}–{Math.min(filter.skip + filter.take, data?.warehouseKardex.totalItems || 0)}</span><Button variant="outline" disabled={filter.skip + filter.take >= (data?.warehouseKardex.totalItems || 0)} onClick={() => setFilter({ ...filter, skip: filter.skip + filter.take })}>Siguiente</Button></div></CardContent></Card>
    </div>;
}

export function WarehousePage({ tab }: { tab: 'receipts' | 'picking' | 'kardex' }) {
    return tab === 'receipts' ? <Receipts /> : tab === 'picking' ? <Picking /> : <Kardex />;
}
