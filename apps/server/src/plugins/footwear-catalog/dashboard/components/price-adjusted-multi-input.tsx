import { Checkbox } from '@vendure/dashboard';
import type { DashboardFormComponentProps } from '@vendure/dashboard';
import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';

type PriceAdjustment = { ajuste: number } & Record<string, string | number>;

export function PriceAdjustedMultiInput({ value, onChange, disabled, name, options, adjustmentsField, optionField }: DashboardFormComponentProps & {
    options: Array<{ value: string; label: string }>;
    adjustmentsField: string;
    optionField: string;
}) {
    const form = useFormContext();
    const selected: string[] = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
    const path = name?.replace(/\.[^.]+$/, `.${adjustmentsField}`) ?? `customFields.${adjustmentsField}`;
    const adjustments: PriceAdjustment[] = form.watch(path) ?? [];

    function changeSelection(option: string, checked: boolean) {
        onChange(checked ? [...selected, option] : selected.filter(item => item !== option));
        if (!checked) form.setValue(path, adjustments.filter(item => item[optionField] !== option), { shouldDirty: true });
    }

    function changeAdjustment(option: string, input: string) {
        const amount = Number(input.replace(',', '.'));
        if (!Number.isFinite(amount)) return;
        const next = adjustments.filter(item => item[optionField] !== option);
        next.push({ [optionField]: option, ajuste: Math.round(amount * 100) } as PriceAdjustment);
        form.setValue(path, next, { shouldDirty: true, shouldValidate: true });
    }

    return <div className="space-y-2 py-1">
        {options.map(option => {
            const checked = selected.includes(option.value);
            const adjustment = adjustments.find(item => item[optionField] === option.value)?.ajuste ?? 0;
            return <div key={option.value} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <label className="inline-flex min-w-40 cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox checked={checked} disabled={disabled} onCheckedChange={state => changeSelection(option.value, !!state)} />
                    {option.label}
                </label>
                {checked && <label className="flex items-center gap-2 text-sm">
                    Ajuste de precio
                    <input type="number" step="0.01" disabled={disabled} defaultValue={(adjustment / 100).toFixed(2)} onChange={event => changeAdjustment(option.value, event.target.value)} className="h-9 w-28 rounded-md border bg-background px-2 text-right" aria-label={`Ajuste de precio de ${option.label}`} />
                </label>}
            </div>;
        })}
        <p className="text-xs text-muted-foreground">Usa un importe negativo para descontar del precio base.</p>
    </div>;
}

export function HiddenDashboardField() {
    const field = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const container = field.current?.closest('[data-slot="field"]') as HTMLElement | null;
        if (!container) return;
        const display = container.style.display;
        container.style.display = 'none';
        return () => { container.style.display = display; };
    }, []);
    return <span ref={field} className="hidden-dashboard-field" />;
}

export function ProductBasePriceInput({ value, onChange, disabled }: DashboardFormComponentProps) {
    const input = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState('');
    useEffect(() => {
        if (document.activeElement !== input.current) setDraft(typeof value === 'number' ? (value / 100).toFixed(2) : '');
    }, [value]);

    return <input ref={input} type="number" min="0" step="0.01" disabled={disabled} value={draft} onBlur={() => setDraft(typeof value === 'number' ? (value / 100).toFixed(2) : '')} onChange={event => {
        setDraft(event.target.value);
        const amount = Number(event.target.value.replace(',', '.'));
        if (Number.isFinite(amount) && amount >= 0) onChange(Math.round(amount * 100));
    }} className="h-9 w-full rounded-md border bg-background px-3" aria-label="Precio base" />;
}
