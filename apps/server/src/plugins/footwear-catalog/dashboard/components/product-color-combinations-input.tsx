import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    type DashboardFormComponent,
    type DashboardFormComponentProps,
} from '@vendure/dashboard';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { ESTILO_OPTIONS_BY_TIPO } from './dependent-estilo-input';

export type ProductColorCombination = {
    primarioNombre: string;
    primarioCodigo: string;
    secundarioNombre: string;
    secundarioCodigo: string;
    terciarioNombre: string;
    terciarioCodigo: string;
};

export const presetColors: Record<string, string> = {
    Negro: '#000000', Blanco: '#ffffff', Café: '#6f4e37', Beige: '#f5f5dc',
    Azul: '#0000ff', Rojo: '#ff0000', Rosa: '#ffc0cb', Miel: '#d99a26',
    Gris: '#808080', Verde: '#008000', Amarillo: '#ffff00', Morado: '#800080',
};

const slots = ['primario', 'secundario', 'terciario'] as const;
const emptyCombination = (): ProductColorCombination => ({
    primarioNombre: '', primarioCodigo: '', secundarioNombre: '', secundarioCodigo: '', terciarioNombre: '', terciarioCodigo: '',
});

export function colorAsHex(input: string): string | undefined {
    const value = input.trim();
    if (/^#[\da-f]{6}$/i.test(value)) return value;
    if (/^#[\da-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map(c => c + c).join('')}`;
    const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i.exec(value);
    if (rgb) {
        const channels = rgb.slice(1, 4).map(Number);
        if (channels.some(channel => channel > 255)) return;
        return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    }
    const cmyk = /^cmyk\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*\)$/i.exec(value);
    if (cmyk) {
        const channels = cmyk.slice(1).map(channel => Number.parseFloat(channel) / (channel.endsWith('%') ? 100 : 1));
        if (channels.some(channel => !Number.isFinite(channel) || channel < 0 || channel > 1)) return;
        return `#${channels.slice(0, 3).map(channel => Math.round(255 * (1 - channel) * (1 - channels[3])).toString(16).padStart(2, '0')).join('')}`;
    }
    const preset = presetColors[Object.keys(presetColors).find(name => name.toLowerCase() === value.toLowerCase()) ?? ''];
    if (preset) return preset;
    if (typeof document !== 'undefined' && typeof CSS !== 'undefined' && CSS.supports('color', value)) {
        const context = document.createElement('canvas').getContext('2d');
        if (context) {
            context.fillStyle = value;
            if (/^#[\da-f]{6}$/i.test(context.fillStyle)) return context.fillStyle;
        }
    }
}

export const ProductColorCombinationsInput: DashboardFormComponent = ({ value, onChange, disabled, name }: DashboardFormComponentProps) => {
    const form = useFormContext();
    const combinations: ProductColorCombination[] = Array.isArray(value) ? value : [];
    const prefix = name?.replace(/\.combinacionesColores$/, '') ?? 'customFields';
    const generoPath = `${prefix}.genero`;
    const tipoPath = `${prefix}.tipo`;
    const estiloPath = `${prefix}.estilo`;
    const genero = form.watch(generoPath);
    const tipo = form.watch(tipoPath);
    const estilo = form.watch(estiloPath);
    const filter = tipo || genero;
    const estilos = filter ? ESTILO_OPTIONS_BY_TIPO[filter] ?? [] : [];
    const styleItems = Object.fromEntries([['__none__', '-- Ninguno --'], ...estilos.map(option => [option.value, option.label])]);
    const update = (index: number, patch: Partial<ProductColorCombination>) =>
        onChange(combinations.map((combination, item) => item === index ? { ...combination, ...patch } : combination));

    useEffect(() => {
        if (estilo && !estilos.some(option => option.value === estilo)) {
            form.setValue(estiloPath, null, { shouldDirty: true });
        }
    }, [estilo, estilos, estiloPath, form]);

    const setField = (path: string, fieldValue: string | null) =>
        form.setValue(path, fieldValue, { shouldDirty: true, shouldValidate: true });

    return <Card className="product-color-combinations-card">
        <CardHeader>
            <CardTitle>Combinaciones de color</CardTitle>
            <CardDescription>Agrega todas las combinaciones disponibles. El color primario y su código son obligatorios; los demás son opcionales.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-3">
                    <datalist id="product-preset-colors">{Object.keys(presetColors).map(color => <option key={color} value={color} />)}</datalist>
                    <div className="max-h-[23rem] space-y-3 overflow-y-auto pr-1">
                    {combinations.map((combination, index) => <fieldset key={index} disabled={disabled} className="space-y-3 rounded-md border p-3">
                        <legend className="px-1 font-medium">Combinación {index + 1}</legend>
                        {slots.map(slot => {
                            const nameKey = `${slot}Nombre` as keyof ProductColorCombination;
                            const codeKey = `${slot}Codigo` as keyof ProductColorCombination;
                            const code = combination[codeKey] ?? '';
                            const hex = colorAsHex(code);
                            return <div key={slot} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                                <label className="text-sm">Color {slot}{slot === 'primario' ? ' *' : ''}
                                    <input list="product-preset-colors" value={combination[nameKey] ?? ''} onChange={event => {
                                        const color = event.target.value;
                                        const oldPreset = presetColors[combination[nameKey]];
                                        update(index, { [nameKey]: color, ...(oldPreset === code || !code ? { [codeKey]: presetColors[color] ?? '' } : {}) });
                                    }} className="mt-1 h-9 w-full rounded-md border bg-background px-3" />
                                </label>
                                <label className="text-sm">Código de color{slot === 'primario' ? ' *' : ''}
                                    <input value={code} onChange={event => update(index, { [codeKey]: event.target.value })} placeholder="#112233, rgb(…), cmyk(…)" className="mt-1 h-9 w-full rounded-md border bg-background px-3" />
                                </label>
                                <label className="flex items-center gap-2 text-sm">Selector
                                    <input type="color" value={hex ?? '#000000'} onChange={event => update(index, { [codeKey]: event.target.value })} className="h-9 w-12 cursor-pointer rounded border bg-background" aria-label={`Elegir color ${slot} de la combinación ${index + 1}`} />
                                </label>
                                {code && !hex && <p className="text-sm text-destructive sm:col-span-3">Usa HEX (#RRGGBB), RGB, CMYK o un color predefinido.</p>}
                            </div>;
                        })}
                        <button type="button" onClick={() => onChange(combinations.filter((_, item) => item !== index))} className="text-sm text-destructive hover:underline">Quitar combinación</button>
                    </fieldset>)}
                    </div>
                    <button type="button" disabled={disabled} onClick={() => onChange([...combinations, emptyCombination()])} className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">Agregar combinación</button>
                </div>
                <div className="w-full space-y-4">
            <label className="block w-full text-sm font-medium">Género
                <Select value={genero ?? '__none__'} onValueChange={next => setField(generoPath, next === '__none__' ? null : next)} disabled={disabled} items={{ Hombre: 'Hombre', Mujer: 'Mujer', Unisex: 'Unisex', __none__: '-- Ninguno --' }}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Selecciona un género" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">-- Ninguno --</SelectItem><SelectItem value="Hombre">Hombre</SelectItem><SelectItem value="Mujer">Mujer</SelectItem><SelectItem value="Unisex">Unisex</SelectItem></SelectContent>
                </Select>
            </label>
            <label className="block w-full text-sm font-medium">Tipo
                <Select value={tipo ?? '__none__'} onValueChange={next => setField(tipoPath, next === '__none__' ? null : next)} disabled={disabled} items={{ Adulto: 'Adulto', Teen: 'Teen', Nino: 'Niño', Infantil: 'Infantil', __none__: '-- Ninguno --' }}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">-- Ninguno --</SelectItem><SelectItem value="Adulto">Adulto</SelectItem><SelectItem value="Teen">Teen</SelectItem><SelectItem value="Nino">Niño</SelectItem><SelectItem value="Infantil">Infantil</SelectItem></SelectContent>
                </Select>
            </label>
            <label className="block w-full text-sm font-medium">Estilo
                <Select value={estilo ?? '__none__'} onValueChange={next => setField(estiloPath, next === '__none__' ? null : next)} disabled={disabled || !filter} items={styleItems}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder={filter ? 'Selecciona un estilo' : 'Selecciona género o tipo'} /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">-- Ninguno --</SelectItem>{estilos.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
            </label>
                </div>
            </div>
        </CardContent>
    </Card>;
};

ProductColorCombinationsInput.metadata = { isListInput: true, isFullWidth: true };
