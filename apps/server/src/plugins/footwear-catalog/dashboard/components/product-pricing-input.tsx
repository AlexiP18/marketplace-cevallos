import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, type DashboardFormComponent, type DashboardFormComponentProps } from '@vendure/dashboard';
import { useFormContext } from 'react-hook-form';
import { PriceAdjustedMultiInput, ProductBasePriceInput } from './price-adjusted-multi-input';

type Extra = { nombre: string; ajuste: number };
type Adjustment = { ajuste?: number; rangoTalla?: string; capellada?: string; suela?: string };
type PriceOption = { value: string; label: string; amount: number };
type PriceHeader = 'rangoTallas' | 'capellada' | 'suela';

const fields = {
    rangoTallas: {
        adjustmentsField: 'ajustesRangoTalla', optionField: 'rangoTalla',
        options: [{ value: 'Pequeno_21_26', label: 'Pequeño (21–26)' }, { value: 'Mediano_27_36', label: 'Mediano (27–36)' }, { value: 'Grande_37_45', label: 'Grande (37–45)' }],
    },
    capellada: {
        adjustmentsField: 'ajustesCapellada', optionField: 'capellada',
        options: [{ value: 'Cuero', label: 'Cuero' }, { value: 'Sintetico', label: 'Sintético' }, { value: 'Otro', label: 'Otro' }],
    },
    suela: {
        adjustmentsField: 'ajustesSuela', optionField: 'suela',
        options: [{ value: 'PVC', label: 'PVC' }, { value: 'TR', label: 'TR' }, { value: 'Caucho', label: 'Caucho' }, { value: 'EVA', label: 'EVA' }],
    },
};

export const ProductPricingInput: DashboardFormComponent = ({ value, onChange, disabled, name }: DashboardFormComponentProps) => {
    const form = useFormContext();
    const prefix = name?.replace(/\.precioBase$/, '') ?? 'customFields';
    const fieldProps = (field: keyof typeof fields) => {
        const config = fields[field];
        const path = `${prefix}.${field}`;
        return {
            ...config,
            name: path,
            value: form.watch(path),
            disabled,
            onChange: (next: string[]) => form.setValue(path, next, { shouldDirty: true, shouldValidate: true }),
        };
    };
    const extrasPath = `${prefix}.extrasPrecio`;
    const extras: Extra[] = form.watch(extrasPath) ?? [];
    const setExtras = (next: Extra[]) => form.setValue(extrasPath, next, { shouldDirty: true, shouldValidate: true });
    const marginPath = `${prefix}.margenGanancia`;
    const margin = Number(form.watch(marginPath) ?? 0);
    const extraTotal = extras.reduce((total, extra) => total + (extra.ajuste ?? 0), 0);
    const money = (amount: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(amount / 100);
    const selectedAdjustments = (field: keyof typeof fields): PriceOption[] => {
        const config = fields[field];
        const selected = form.watch(`${prefix}.${field}`) as string[] | undefined;
        const adjustments = (form.watch(`${prefix}.${config.adjustmentsField}`) as Adjustment[] | undefined) ?? [];
        const options = config.options.filter(option => selected?.includes(option.value)).map(option => ({
            value: option.value,
            label: option.label,
            amount: adjustments.find(item => item[config.optionField] === option.value)?.ajuste ?? 0,
        }));
        return options.length ? options : [{ value: 'sin-ajuste', label: 'Sin ajuste', amount: 0 }];
    };
    const rangePrices = selectedAdjustments('rangoTallas');
    const upperPrices = selectedAdjustments('capellada');
    const solePrices = selectedAdjustments('suela');
    const estimatedPrice = (range: { amount: number }, upper: { amount: number }, sole: { amount: number }) =>
        Math.round(((typeof value === 'number' ? value : 0) + range.amount + upper.amount + sole.amount + extraTotal) * (1 + margin / 10000));
    const columnsByHeader: Record<PriceHeader, PriceOption[]> = { rangoTallas: rangePrices, capellada: upperPrices, suela: solePrices };
    const matrixRows: Record<PriceHeader, Array<{ label: string; prices: number[] }>> = {
        rangoTallas: upperPrices.flatMap(upper => solePrices.map(sole => ({ label: `${upper.label} · ${sole.label}`, prices: rangePrices.map(range => estimatedPrice(range, upper, sole)) }))),
        capellada: rangePrices.flatMap(range => solePrices.map(sole => ({ label: `${range.label} · ${sole.label}`, prices: upperPrices.map(upper => estimatedPrice(range, upper, sole)) }))),
        suela: rangePrices.flatMap(range => upperPrices.map(upper => ({ label: `${range.label} · ${upper.label}`, prices: solePrices.map(sole => estimatedPrice(range, upper, sole)) }))),
    };
    const rowLabelByHeader: Record<PriceHeader, string> = { rangoTallas: 'Capellada · Suela', capellada: 'Rango de talla · Suela', suela: 'Rango de talla · Capellada' };

    return <Card className="product-pricing-card">
        <CardHeader>
            <CardTitle>Precios</CardTitle>
            <CardDescription>Define el precio base y los ajustes aplicables según las características del calzado.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-6">
                <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-[14rem_10rem_1fr] md:items-end">
                    <label className="block">
                        <span className="block text-lg font-semibold">Precio base</span>
                        <ProductBasePriceInput value={value} onChange={onChange} disabled={disabled} />
                    </label>
                    <label className="text-sm font-medium">Margen de ganancia (%)
                        <input type="number" min="0" step="0.01" value={(margin / 100).toFixed(2)} disabled={disabled} onChange={event => {
                            const percent = Number(event.target.value.replace(',', '.'));
                            if (Number.isFinite(percent) && percent >= 0) form.setValue(marginPath, Math.round(percent * 100), { shouldDirty: true, shouldValidate: true });
                        }} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-right" />
                    </label>
                    <div className="rounded-md border bg-muted/30 px-4 py-2 text-sm">
                        <div className="text-muted-foreground">Extras acumulados</div>
                        <strong className="text-base">{money(extraTotal)}</strong>
                        <div className="text-xs text-muted-foreground">Se suma una vez a cada precio estimado.</div>
                    </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-6">
                        <section><h3 className="mb-2 text-sm font-medium">Ajuste por rango de talla</h3><PriceAdjustedMultiInput {...fieldProps('rangoTallas')} /></section>
                        <section><h3 className="mb-2 text-sm font-medium">Ajuste por capellada</h3><PriceAdjustedMultiInput {...fieldProps('capellada')} /></section>
                    </div>
                    <div className="space-y-6">
                        <section><h3 className="mb-2 text-sm font-medium">Ajuste por suela</h3><PriceAdjustedMultiInput {...fieldProps('suela')} /></section>
                        <section className="space-y-2">
                            <h3 className="text-sm font-medium">Extras u otros ajustes</h3>
                            {extras.map((extra, index) => <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                                <input value={extra.nombre} disabled={disabled} onChange={event => setExtras(extras.map((item, itemIndex) => itemIndex === index ? { ...item, nombre: event.target.value } : item))} placeholder="Nombre" className="h-9 rounded-md border bg-background px-3" />
                                <input type="number" step="0.01" value={(extra.ajuste / 100).toFixed(2)} disabled={disabled} onChange={event => {
                                    const amount = Number(event.target.value.replace(',', '.'));
                                    if (Number.isFinite(amount)) setExtras(extras.map((item, itemIndex) => itemIndex === index ? { ...item, ajuste: Math.round(amount * 100) } : item));
                                }} aria-label={`Ajuste de ${extra.nombre || 'extra'}`} className="h-9 rounded-md border bg-background px-2 text-right" />
                                <button type="button" disabled={disabled} onClick={() => setExtras(extras.filter((_, itemIndex) => itemIndex !== index))} className="text-sm text-destructive hover:underline">Quitar</button>
                            </div>)}
                            <button type="button" disabled={disabled} onClick={() => setExtras([...extras, { nombre: '', ajuste: 0 }])} className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">Agregar extra</button>
                        </section>
                    </div>
                </div>
                <section className="space-y-2">
                    <h3 className="text-sm font-medium">Precios estimados por configuración</h3>
                    <Tabs defaultValue="general">
                        <TabsList>
                            <TabsTrigger value="general">Vista general</TabsTrigger>
                            <TabsTrigger value="especifica">Vista específica</TabsTrigger>
                        </TabsList>
                        <TabsContent value="general" className="mt-3">
                            <Tabs defaultValue="capellada">
                                <TabsList className="h-auto max-w-full flex-wrap justify-start">
                                    <TabsTrigger value="capellada">Columnas: capellada</TabsTrigger>
                                    <TabsTrigger value="suela">Columnas: suela</TabsTrigger>
                                </TabsList>
                                {(['capellada', 'suela'] as PriceHeader[]).map(header => <TabsContent key={header} value={header} className="mt-3">
                                    <div className="overflow-x-auto rounded-md border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{rowLabelByHeader[header]}</th>{columnsByHeader[header].map(column => <th key={column.value} className="px-3 py-2 text-right font-medium">{column.label}</th>)}</tr></thead>
                                            <tbody>{matrixRows[header].map(row => <tr key={row.label} className="border-t"><td className="px-3 py-2">{row.label}</td>{row.prices.map((price, index) => <td key={columnsByHeader[header][index].value} className="px-3 py-2 text-right font-medium">{money(price)}</td>)}</tr>)}</tbody>
                                        </table>
                                    </div>
                                </TabsContent>)}
                            </Tabs>
                        </TabsContent>
                        <TabsContent value="especifica" className="mt-3">
                            <Tabs defaultValue={rangePrices[0].value}>
                                <TabsList className="h-auto max-w-full flex-wrap justify-start">
                                    {rangePrices.map(range => <TabsTrigger key={range.value} value={range.value}>Talla: {range.label}</TabsTrigger>)}
                                </TabsList>
                                {rangePrices.map(range => <TabsContent key={range.value} value={range.value} className="mt-3">
                                    <Tabs defaultValue={upperPrices[0].value}>
                                        <TabsList className="h-auto max-w-full flex-wrap justify-start">
                                            {upperPrices.map(upper => <TabsTrigger key={upper.value} value={upper.value}>Capellada: {upper.label}</TabsTrigger>)}
                                        </TabsList>
                                        {upperPrices.map(upper => <TabsContent key={upper.value} value={upper.value} className="mt-3">
                                            <Tabs defaultValue={solePrices[0].value}>
                                                <TabsList className="h-auto max-w-full flex-wrap justify-start">
                                                    {solePrices.map(sole => <TabsTrigger key={sole.value} value={sole.value}>Suela: {sole.label}</TabsTrigger>)}
                                                </TabsList>
                                                {solePrices.map(sole => <TabsContent key={sole.value} value={sole.value} className="mt-3">
                                                    <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
                                                        <div className="text-muted-foreground">Precio para esta configuración</div>
                                                        <strong className="text-xl">{money(estimatedPrice(range, upper, sole))}</strong>
                                                    </div>
                                                </TabsContent>)}
                                            </Tabs>
                                        </TabsContent>)}
                                    </Tabs>
                                </TabsContent>)}
                            </Tabs>
                        </TabsContent>
                    </Tabs>
                </section>
            </div>
        </CardContent>
    </Card>;
};

ProductPricingInput.metadata = { isFullWidth: true };
