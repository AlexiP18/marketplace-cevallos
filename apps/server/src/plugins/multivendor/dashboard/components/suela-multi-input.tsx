import React from 'react';
import {
    DashboardFormComponent,
    DashboardFormComponentProps,
    Checkbox,
} from '@vendure/dashboard';

interface SuelaOption {
    value: string;
    label: string;
}

const SUELA_OPTIONS: SuelaOption[] = [
    { value: 'PVC', label: 'PVC' },
    { value: 'TR', label: 'TR' },
    { value: 'Caucho', label: 'Caucho' },
    { value: 'EVA', label: 'EVA' },
];

export const SuelaMultiInput: DashboardFormComponent = ({
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
        <div className="flex flex-wrap gap-2.5 py-1">
            {SUELA_OPTIONS.map(opt => {
                const isChecked = selectedValues.includes(opt.value);
                const id = `suela-mat-${opt.value}`;
                return (
                    <label
                        key={opt.value}
                        htmlFor={id}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-md cursor-pointer select-none transition-colors text-sm font-medium ${
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

SuelaMultiInput.metadata = {
    isListInput: true,
};
