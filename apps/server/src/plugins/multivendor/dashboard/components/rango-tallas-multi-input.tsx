import React from 'react';
import {
    DashboardFormComponent,
    DashboardFormComponentProps,
    Checkbox,
} from '@vendure/dashboard';

interface RangoOption {
    value: string;
    label: string;
}

const RANGO_OPTIONS: RangoOption[] = [
    { value: 'Pequeno_21_26', label: 'Pequeño (21-26)' },
    { value: 'Mediano_27_36', label: 'Mediano (27-36)' },
    { value: 'Grande_37_45', label: 'Grande (37-45)' },
];

export const RangoTallasMultiInput: DashboardFormComponent = ({
    value,
    onChange,
    disabled,
}: DashboardFormComponentProps) => {
    const selectedValues: string[] = Array.isArray(value)
        ? value
        : (typeof value === 'string' && value ? [value] : []);

    const handleToggle = (val: string, checked: boolean) => {
        let updated: string[];
        if (checked) {
            updated = selectedValues.includes(val) ? selectedValues : [...selectedValues, val];
        } else {
            updated = selectedValues.filter(v => v !== val);
        }
        onChange(updated);
    };

    return (
        <div className="flex flex-wrap gap-3 py-1">
            {RANGO_OPTIONS.map(opt => {
                const isChecked = selectedValues.includes(opt.value);
                const id = `rango-talla-${opt.value}`;
                return (
                    <label
                        key={opt.value}
                        htmlFor={id}
                        className={`inline-flex items-center gap-2.5 px-3 py-2 border rounded-md cursor-pointer select-none transition-colors text-sm font-medium ${
                            isChecked
                                ? 'bg-primary/10 border-primary text-primary shadow-xs'
                                : 'bg-card border-input hover:bg-muted text-card-foreground'
                        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                    >
                        <Checkbox
                            id={id}
                            checked={isChecked}
                            disabled={disabled}
                            onCheckedChange={(checked) => handleToggle(opt.value, !!checked)}
                        />
                        <span>{opt.label}</span>
                    </label>
                );
            })}
        </div>
    );
};

RangoTallasMultiInput.metadata = {
    isListInput: true,
};
