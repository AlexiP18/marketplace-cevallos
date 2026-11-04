import type { DashboardFormComponent, DashboardFormComponentProps } from '@vendure/dashboard';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

export const ProductCodeInput: DashboardFormComponent = ({ value, onChange, disabled }: DashboardFormComponentProps) => {
    const [target, setTarget] = useState<HTMLElement | null>(null);
    const placeholder = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        // shortcut: Dashboard has no slot for a custom product field in DetailFormGrid; replace when it adds one.
        setTarget(document.getElementById('field-name')?.closest('.grid') as HTMLElement | null);
    }, []);

    useEffect(() => {
        if (!target) return;
        const field = placeholder.current?.closest('[data-slot="field"]') as HTMLElement | null;
        if (!field) return;
        const display = field.style.display;
        field.style.display = 'none';
        return () => { field.style.display = display; };
    }, [target]);

    const input = <div className="product-code-field">
        <label htmlFor="product-code" className="text-sm font-medium">Código</label>
        <input id="product-code" value={value ?? ''} onChange={event => onChange(event.target.value)} disabled={disabled} className="mt-1 h-9 w-full rounded-md border bg-background px-3" />
    </div>;

    return target
        ? <><span ref={placeholder} className="product-code-portal-placeholder" />{createPortal(input, target)}</>
        : input;
};
