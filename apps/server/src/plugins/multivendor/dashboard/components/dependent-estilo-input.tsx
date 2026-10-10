import React, { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import {
    DashboardFormComponent,
    DashboardFormComponentProps,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';

interface EstiloOption {
    value: string;
    label: string;
}

const ESTILO_OPTIONS_BY_TIPO: Record<string, EstiloOption[]> = {
    Hombre: [
        { value: 'Zapatillas', label: 'Zapatillas' },
        { value: 'Casual', label: 'Casual' },
        { value: 'Urbano', label: 'Urbano' },
        { value: 'Botas', label: 'Botas' },
        { value: 'Sandalias', label: 'Sandalias' },
    ],
    Mujer: [
        { value: 'Zapatillas', label: 'Zapatillas' },
        { value: 'Casual', label: 'Casual' },
        { value: 'Tacones', label: 'Tacones' },
        { value: 'Flats', label: 'Flats' },
        { value: 'Botas_Botines', label: 'Botas / Botines' },
    ],
    Nino: [
        { value: 'Escolares', label: 'Escolares' },
        { value: 'Zapatillas', label: 'Zapatillas' },
        { value: 'Casual', label: 'Casual' },
        { value: 'Urbano', label: 'Urbano' },
    ],
    Niño: [
        { value: 'Escolares', label: 'Escolares' },
        { value: 'Zapatillas', label: 'Zapatillas' },
        { value: 'Casual', label: 'Casual' },
        { value: 'Urbano', label: 'Urbano' },
    ],
    Infantil: [
        { value: 'Bebes', label: 'Bebés' },
        { value: 'Primeros_Pasos', label: 'Primeros pasos' },
        { value: 'Escolares', label: 'Escolares' },
    ],
    Unisex: [
        { value: 'Zapatillas', label: 'Zapatillas' },
        { value: 'Casual', label: 'Casual' },
        { value: 'Urbano', label: 'Urbano' },
        { value: 'Botas', label: 'Botas' },
        { value: 'Sandalias', label: 'Sandalias' },
    ],
};

export const DependentEstiloInput: DashboardFormComponent = ({
    value,
    onChange,
    disabled,
    name,
}: DashboardFormComponentProps) => {
    const formContext = useFormContext();
    const tipoFieldName = name ? name.replace(/\.estilo$/, '.tipo') : 'customFields.tipo';
    const generoFieldName = name ? name.replace(/\.estilo$/, '.genero') : 'customFields.genero';
    const tipoValue = formContext?.watch(tipoFieldName) ?? formContext?.watch('customFields.tipo') ?? formContext?.watch('tipo');
    const generoValue = formContext?.watch(generoFieldName) ?? formContext?.watch('customFields.genero') ?? formContext?.watch('genero');

    const effectiveFilter = tipoValue || generoValue;
    const availableOptions: EstiloOption[] = effectiveFilter ? (ESTILO_OPTIONS_BY_TIPO[effectiveFilter] || []) : [];

    // Clear estilo if tipo/genero changed and current value is no longer valid
    useEffect(() => {
        if (effectiveFilter && value) {
            const isValid = availableOptions.some(opt => opt.value === value);
            if (!isValid) {
                onChange(null);
            }
        }
    }, [effectiveFilter]);

    if (!effectiveFilter) {
        return (
            <div className="text-sm text-muted-foreground p-2.5 border border-dashed rounded-md bg-muted/20">
                Selecciona primero el <strong>Tipo</strong> o <strong>Género</strong> para desplegar los estilos correspondientes.
            </div>
        );
    }

    const selectItems = Object.fromEntries(
        availableOptions.map(opt => [opt.value, opt.label])
    );
    selectItems['__none__'] = '-- Ninguno --';

    const selectValue = value ?? '__none__';

    return (
        <Select
            value={selectValue}
            onValueChange={(newVal) => {
                if (!newVal || newVal === '__none__') {
                    onChange(null);
                } else {
                    onChange(newVal);
                }
            }}
            disabled={disabled}
            items={selectItems}
        >
            <SelectTrigger className="mb-0">
                <SelectValue placeholder="Selecciona un estilo..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="__none__">-- Ninguno --</SelectItem>
                {availableOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
