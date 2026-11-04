import { api, Button, useQuery } from '@vendure/dashboard';
import { graphql } from '@/gql';
import { Link, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ResultOf } from 'gql.tada';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const variantMatrixDocument = graphql(`
    query FootwearVariantMatrix($productId: ID, $options: ProductVariantListOptions) {
        productVariants(productId: $productId, options: $options) {
            totalItems
            items {
                id
                sku
                priceWithTax
                currencyCode
                customFields { codigo colores { nombre codigo } }
                product { id name customFields { codigo } }
                featuredAsset { id preview }
                options {
                    id
                    code
                    name
                    group { id code name }
                    customFields { colores { nombre codigo } }
                }
                stockLevels { stockOnHand stockAllocated }
            }
        }
    }
`);

const colorOptionsDocument = graphql(`
    query FootwearColorOptions($id: ID!) {
        product(id: $id) {
            name
            customFields {
                codigo rangoTallas capellada suela precioBase margenGanancia
                ajustesRangoTalla { rangoTalla ajuste }
                ajustesCapellada { capellada ajuste }
                ajustesSuela { suela ajuste }
                extrasPrecio { nombre ajuste }
                combinacionesColores { primarioNombre primarioCodigo secundarioNombre secundarioCodigo terciarioNombre terciarioCodigo }
            }
            variants { id sku options { id } }
            optionGroups {
                id
                code
                name
                options { id code name }
            }
        }
    }
`);

const createColorOptionDocument = graphql(`
    mutation CreateFootwearColorOption($input: CreateProductOptionInput!) {
        createProductOption(input: $input) { id }
    }
`);

const deleteColorOptionDocument = graphql(`
    mutation DeleteFootwearOption($id: ID!) {
        deleteProductOption(id: $id) { result message }
    }
`);

const createColorGroupDocument = graphql(`
    mutation CreateFootwearColorGroup($input: CreateProductOptionGroupInput!) {
        createProductOptionGroup(input: $input) { id }
    }
`);

const addColorGroupDocument = graphql(`
    mutation AddFootwearColorGroup($productId: ID!, $optionGroupId: ID!) {
        addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) { id }
    }
`);

const createFootwearVariantDocument = graphql(`
    mutation CreateFootwearVariant($input: [CreateProductVariantInput!]!) {
        createProductVariants(input: $input) { id }
    }
`);

const deleteFootwearVariantsDocument = graphql(`
    mutation DeleteFootwearVariants($ids: [ID!]!) {
        deleteProductVariants(ids: $ids) {
            result
            message
        }
    }
`);

type Variant = ResultOf<typeof variantMatrixDocument>['productVariants']['items'][number];
type VariantOptionKind = 'color' | 'size' | 'capellada' | 'suela';

function optionGroupMatches(code: string, kind: VariantOptionKind) {
    const normalized = code.toLowerCase();
    if (kind === 'color') return ['calzado-color', 'color', 'colour'].includes(normalized) || normalized.startsWith('calzado-color-');
    if (kind === 'size') return ['calzado-talla', 'talla', 'size'].includes(normalized) || normalized.startsWith('calzado-talla-');
    return normalized === `calzado-${kind}` || normalized === kind || normalized.startsWith(`calzado-${kind}-`);
}

async function fetchVariants(productId?: string) {
    const variants: Variant[] = [];
    let skip = 0;
    const take = 100;
    do {
        const result = await api.query(variantMatrixDocument, { productId, options: { skip, take } });
        variants.push(...result.productVariants.items);
        skip += result.productVariants.items.length;
        if (skip >= result.productVariants.totalItems || result.productVariants.items.length === 0) break;
    } while (true);
    return variants;
}

function optionOf(variant: Variant, kind: VariantOptionKind) {
    return variant.options.find(option => optionGroupMatches(option.group.code, kind));
}

function variantRowKey(variant: Variant) {
    return [variant.product.id, optionOf(variant, 'color')?.id ?? colorLabel(variant), optionOf(variant, 'capellada')?.id ?? '', optionOf(variant, 'suela')?.id ?? ''].join(':');
}

function priceLabel(variants: Variant[]) {
    const prices = variants.map(variant => variant.priceWithTax);
    const currency = variants[0]?.currencyCode || 'USD';
    const format = (price: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(price / 100);
    return Math.min(...prices) === Math.max(...prices)
        ? format(prices[0])
        : `${format(Math.min(...prices))} – ${format(Math.max(...prices))}`;
}

function colorsOf(variant: Variant) {
    const option = optionOf(variant, 'color');
    const colors = option?.customFields?.colores?.filter(color => color?.nombre)
        ?? variant.customFields?.colores?.filter(color => color?.nombre) ?? [];
    return colors.length ? colors : (option?.name ?? 'Sin color').split(/\s*\/\s*/).map(nombre => ({ nombre, codigo: null }));
}

function colorLabel(variant: Variant) {
    return colorsOf(variant).map(color => color.nombre).join(' / ');
}

function colorCodeLabel(variant: Variant) {
    return colorsOf(variant).map(color => color.codigo).filter(Boolean).join(' / ') || '—';
}

type Color = { nombre: string; codigo: string };
type PendingVariant = {
    id: string;
    code: string;
    colors: Color[];
    colorOptionId: string;
    optionIds: string[];
    size: string;
    upper: string;
    sole: string;
    price: number;
    sku: string;
    name: string;
};

function validatedColors(colors: Color[]) {
    const values = colors.map(color => ({ nombre: color.nombre.trim(), codigo: color.codigo.trim() }));
    if (!values[0].nombre || !values[0].codigo || values.slice(1).some(color => Boolean(color.nombre) !== Boolean(color.codigo))) {
        throw new Error('El color primario y su código son obligatorios; cada color adicional necesita su código.');
    }
    if (values[2]?.nombre && !values[1]?.nombre) {
        throw new Error('Indica el color secundario antes del terciario.');
    }
    const selected = values.filter(color => color.nombre);
    if (new Set(selected.map(color => color.nombre.toLocaleLowerCase('es'))).size !== selected.length) {
        throw new Error('No repitas un color dentro de la combinación.');
    }
    return selected;
}

function colorOptionName(colors: Color[]) {
    return colors.map(color => color.nombre).join(' / ');
}

function colorOptionCode(colors: Color[]) {
    return colors.map(color => color.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('-');
}

function colorsFromCombination(combination: {
    primarioNombre?: string | null; primarioCodigo?: string | null;
    secundarioNombre?: string | null; secundarioCodigo?: string | null;
    terciarioNombre?: string | null; terciarioCodigo?: string | null;
}): Color[] {
    return [
        { nombre: combination.primarioNombre ?? '', codigo: combination.primarioCodigo ?? '' },
        { nombre: combination.secundarioNombre ?? '', codigo: combination.secundarioCodigo ?? '' },
        { nombre: combination.terciarioNombre ?? '', codigo: combination.terciarioCodigo ?? '' },
    ].filter(color => color.nombre || color.codigo);
}

const sizeRanges: Record<string, readonly [number, number]> = {
    Pequeno_21_26: [21, 26],
    Mediano_27_36: [27, 36],
    Grande_37_45: [37, 45],
};

function isAllowedSize(optionName: string, ranges: readonly string[]) {
    if (!ranges.length) return true;
    const size = Number(optionName.replace(',', '.'));
    return Number.isFinite(size) && ranges.some(range => {
        const limits = sizeRanges[range];
        return limits !== undefined && size >= limits[0] && size <= limits[1];
    });
}

function rangeForSize(optionName: string) {
    const size = Number(optionName.replace(',', '.'));
    return Object.entries(sizeRanges).find(([, limits]) => size >= limits[0] && size <= limits[1])?.[0];
}

function sizesFromRanges(ranges: readonly string[]) {
    return [...new Set(ranges.flatMap(range => {
        const limits = sizeRanges[range];
        return limits ? Array.from({ length: limits[1] - limits[0] + 1 }, (_, index) => String(limits[0] + index)) : [];
    }))].sort((a, b) => Number(a) - Number(b));
}

function CreateFootwearVariant({ pendingVariants, setPendingVariants, saving }: {
    pendingVariants: PendingVariant[];
    setPendingVariants: Dispatch<SetStateAction<PendingVariant[]>>;
    saving: boolean;
}) {
    const { id: productId } = useParams({ strict: false });
    const queryClient = useQueryClient();
    const { data, refetch } = useQuery({
        queryKey: ['footwear-color-options', productId],
        queryFn: () => api.query(colorOptionsDocument, { id: productId }),
    });
    const product = data?.product;
    const groupFor = (kind: VariantOptionKind) => product?.optionGroups.find(group => optionGroupMatches(group.code, kind));
    const colorGroup = groupFor('color');
    const otherGroups = (['size', 'capellada', 'suela'] as VariantOptionKind[]).flatMap(kind => {
        const group = groupFor(kind);
        return group ? [group] : [];
    });
    const selectedRanges = product?.customFields?.rangoTallas ?? [];
    const optionsForGroup = (group: typeof otherGroups[number]) => {
        const isSizeGroup = optionGroupMatches(group.code, 'size');
        if (isSizeGroup) return group.options.filter(option => isAllowedSize(option.name, selectedRanges) && selectedRanges.length > 0)
            .sort((a, b) => Number(a.name.replace(',', '.')) - Number(b.name.replace(',', '.')));
        const selected = optionGroupMatches(group.code, 'capellada') ? product?.customFields?.capellada : product?.customFields?.suela;
        return group.options.filter(option => selected?.some(value => value.toLowerCase() === option.name.toLowerCase() || value.toLowerCase() === option.code.toLowerCase()));
    };
    const [selectedCombination, setSelectedCombination] = useState('');
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [configuringOptions, setConfiguringOptions] = useState(false);
    const [syncError, setSyncError] = useState('');
    const [message, setMessage] = useState('');
    const lastSyncAttempt = useRef('');

    const optionSetups = product ? [
        {
            kind: 'size' as const, code: `calzado-talla-${productId}`, name: 'Rango de talla',
            options: sizesFromRanges(product.customFields?.rangoTallas ?? []).map(size => ({ code: `talla-${size}`, name: size })),
        },
        {
            kind: 'color' as const, code: `calzado-color-${productId}`, name: 'Color',
            options: (product.customFields?.combinacionesColores ?? []).map(colorsFromCombination).filter(colors => colors[0]?.nombre).map(colors => ({ code: colorOptionCode(colors), name: colorOptionName(colors) })),
        },
        {
            kind: 'capellada' as const, code: `calzado-capellada-${productId}`, name: 'Capellada',
            options: (product.customFields?.capellada ?? []).map(name => ({ code: name.toLowerCase(), name })),
        },
        {
            kind: 'suela' as const, code: `calzado-suela-${productId}`, name: 'Suela',
            options: (product.customFields?.suela ?? []).map(name => ({ code: name.toLowerCase(), name })),
        },
    ] : [];

    const missingConfiguration = optionSetups.filter(setup => !setup.options.length);
    const usedOptionIds = new Set(product?.variants.flatMap(variant => variant.options.map(option => option.id)) ?? []);
    const needsSync = !missingConfiguration.length && optionSetups.some(setup => {
        const group = groupFor(setup.kind);
        if (!group) return true;
        const desiredCodes = new Set(setup.options.map(option => option.code));
        return setup.options.some(option => !group.options.some(existing => existing.code === option.code)) ||
            group.code === setup.code && group.options.some(option => !desiredCodes.has(option.code) && !usedOptionIds.has(option.id));
    });
    const syncKey = JSON.stringify({ productId, setups: optionSetups, groups: product?.optionGroups, used: [...usedOptionIds] });

    useEffect(() => {
        if (!product || !needsSync || lastSyncAttempt.current === syncKey) return;
        lastSyncAttempt.current = syncKey;
        void prepareVariantOptions();
    }, [syncKey, needsSync]);

    async function prepareVariantOptions() {
        if (!product) return;
        setConfiguringOptions(true);
        setSyncError('');
        try {
            for (const setup of optionSetups) {
                const group = groupFor(setup.kind);
                if (!group) {
                    const created = await api.mutate(createColorGroupDocument, { input: {
                        code: setup.code,
                        translations: [{ languageCode: 'en', name: setup.name }, { languageCode: 'es', name: setup.name }],
                        options: setup.options.map(option => ({
                            code: option.code,
                            translations: [{ languageCode: 'en', name: option.name }, { languageCode: 'es', name: option.name }],
                        })),
                    } }) as { createProductOptionGroup: { id: string } };
                    await api.mutate(addColorGroupDocument, { productId, optionGroupId: created.createProductOptionGroup.id });
                    continue;
                }
                const existingCodes = new Set(group.options.map(option => option.code));
                for (const option of setup.options.filter(option => !existingCodes.has(option.code))) {
                    await api.mutate(createColorOptionDocument, { input: {
                        productOptionGroupId: group.id,
                        code: option.code,
                        translations: [{ languageCode: 'en', name: option.name }, { languageCode: 'es', name: option.name }],
                    } });
                }
                if (group.code === setup.code) {
                    const desiredCodes = new Set(setup.options.map(option => option.code));
                    for (const option of group.options.filter(option => !desiredCodes.has(option.code) && !usedOptionIds.has(option.id))) {
                        const deleted = await api.mutate(deleteColorOptionDocument, { id: option.id });
                        if (deleted.deleteProductOption.result !== 'DELETED') {
                            throw new Error(deleted.deleteProductOption.message || `No se pudo retirar la opción ${option.name}.`);
                        }
                    }
                }
            }
            setSelectedOptions({});
            await refetch();
            await queryClient.invalidateQueries({ queryKey: ['productOptionGroups', productId] });
        } catch (error) {
            setSyncError(error instanceof Error ? error.message : 'No se pudieron sincronizar las opciones de variante.');
        } finally {
            setConfiguringOptions(false);
        }
    }

    function addVariant() {
        if (!product) return;
        if (otherGroups.length !== 3 || !colorGroup) {
            setMessage('No están disponibles las opciones de talla, color, capellada y suela.');
            return;
        }
        const combination = selectedCombination === '' ? undefined : product.customFields?.combinacionesColores?.[Number(selectedCombination)];
        if (!combination) {
            setMessage('Selecciona una combinación de color del producto.');
            return;
        }
        let selectedColors: Color[];
        try { selectedColors = validatedColors(colorsFromCombination(combination)); } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Colores inválidos.');
            return;
        }
        const optionIds = otherGroups.map(group => {
            const options = optionsForGroup(group);
            return selectedOptions[group.id] || (options.length === 1 ? options[0].id : '');
        });
        const otherNames = otherGroups.map((group, index) => optionsForGroup(group).find(option => option.id === optionIds[index])?.name).filter(Boolean);
        if (optionIds.some(id => !id)) {
            setMessage('Selecciona las demás opciones permitidas.');
            return;
        }
        if (otherGroups.some((group, index) => !optionsForGroup(group).some(option => option.id === optionIds[index]))) {
            setMessage('Selecciona una talla, capellada y suela configuradas para este producto.');
            return;
        }
        const selectedName = (kind: VariantOptionKind) => {
            const index = otherGroups.findIndex(group => optionGroupMatches(group.code, kind));
            return index < 0 ? undefined : optionsForGroup(otherGroups[index]).find(option => option.id === optionIds[index])?.name;
        };
        const sizeName = selectedName('size');
        const range = sizeName ? rangeForSize(sizeName) : undefined;
        const upper = selectedName('capellada');
        const sole = selectedName('suela');
        const basePrice = product.customFields?.precioBase ?? 0;
        const rangeAdjustment = product.customFields?.ajustesRangoTalla?.find(item => item.rangoTalla === range)?.ajuste ?? 0;
        const upperAdjustment = product.customFields?.ajustesCapellada?.find(item => item.capellada === upper)?.ajuste ?? 0;
        const soleAdjustment = product.customFields?.ajustesSuela?.find(item => item.suela === sole)?.ajuste ?? 0;
        const extras = product.customFields?.extrasPrecio?.reduce((total, item) => total + (item.ajuste ?? 0), 0) ?? 0;
        const calculatedPrice = Math.round((basePrice + rangeAdjustment + upperAdjustment + soleAdjustment + extras) * (1 + (product.customFields?.margenGanancia ?? 0) / 10000));
        if (calculatedPrice < 0) {
            setMessage('Las reglas de precio generan un valor negativo. Corrige los ajustes del producto.');
            return;
        }
        const variantSku = ''; // The backend assigns the final SKU when these rows are saved.
        const optionName = colorOptionName(selectedColors);
        const existing = colorGroup?.options.find(option => option.code === colorOptionCode(selectedColors));
        if (!existing) {
            setMessage('La combinación de color todavía no está disponible para este producto.');
            return;
        }
        const allOptionIds = [existing.id, ...optionIds].sort();
        if (product.variants.some(variant => {
            const ids = variant.options.map(option => option.id);
            return ids.length === allOptionIds.length && allOptionIds.every(id => ids.includes(id));
        }) || pendingVariants.some(variant => variant.colorOptionId === existing.id && variant.optionIds.length === optionIds.length && [...variant.optionIds, variant.colorOptionId].sort().every((id, index) => id === allOptionIds[index]))) {
            setMessage('Ya existe una variante con esta combinación y las mismas opciones.');
            return;
        }
        setPendingVariants(current => [...current, {
            id: `${existing.id}:${optionIds.join(':')}`,
            code: product.customFields?.codigo ?? '',
            colors: selectedColors,
            colorOptionId: existing.id,
            optionIds,
            size: sizeName ?? '—',
            upper: upper ?? '—',
            sole: sole ?? '—',
            price: calculatedPrice,
            sku: variantSku,
            name: `${product.name} ${optionName} ${otherNames.join(' ')}`.trim(),
        }]);
        setSelectedCombination('');
        setSelectedOptions({});
        setMessage('Variante agregada a la tabla. Guarda las variantes cuando termines.');
    }

    if (!product) return <p className="text-sm text-muted-foreground">Cargando producto…</p>;
    if (missingConfiguration.length) return <p className="text-sm text-muted-foreground">Configura {missingConfiguration.map(setup => setup.name.toLowerCase()).join(', ')} en el producto para crear variantes.</p>;
    if (needsSync || configuringOptions) return <div role="status" className="space-y-2 text-sm">
        <p>{syncError || 'Preparando automáticamente las opciones del producto…'}</p>
        {syncError && <Button type="button" variant="outline" onClick={() => { lastSyncAttempt.current = ''; void prepareVariantOptions(); }}>Reintentar</Button>}
    </div>;
    const combinations = product.customFields?.combinacionesColores ?? [];
    if (!combinations.length) return <p className="text-sm text-muted-foreground">Configura al menos una combinación de color en el producto antes de crear variantes.</p>;
    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Las combinaciones se administran en el producto. Selecciona una para esta variante.</p>
        <label className="block text-sm">Combinación de color *
            <select value={selectedCombination} onChange={event => setSelectedCombination(event.target.value)} className="mt-1 h-9 w-full max-w-md rounded-md border bg-background px-3">
                <option value="">Seleccionar…</option>
                {combinations.map((combination, index) => <option key={index} value={index}>{[combination.primarioNombre, combination.secundarioNombre, combination.terciarioNombre].filter(Boolean).join(' / ')}</option>)}
            </select>
        </label>
        <p className="text-sm text-muted-foreground">Código heredado: <span className="font-mono">{product.customFields?.codigo || 'Sin código de producto'}</span>. El SKU y el código de barras se generan automáticamente.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherGroups.map(group => {
                const options = optionsForGroup(group);
                return <label key={group.id} className="text-sm">{optionGroupMatches(group.code, 'size') ? 'Talla' : group.name} *
                <select value={selectedOptions[group.id] || (options.length === 1 ? options[0].id : '')} onChange={event => setSelectedOptions(current => ({ ...current, [group.id]: event.target.value }))} className="mt-1 h-9 w-full rounded-md border bg-background px-3" disabled={!options.length}>
                    {options.length !== 1 && <option value="">{options.length ? 'Seleccionar…' : 'Sin opciones disponibles'}</option>}
                    {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
            </label>;
            })}
        </div>
        <Button type="button" disabled={saving} onClick={addVariant}>Agregar a la tabla</Button>
        {message && <p role="status" className="text-sm">{message}</p>}
    </div>;
}

function VariantMatrixTable({ variants, showProduct = false }: { variants: Variant[]; showProduct?: boolean }) {
    const sizes = [...new Set(variants.map(variant => optionOf(variant, 'size')?.name ?? 'Única'))]
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const groups = new Map<string, Variant[]>();
    for (const variant of variants) {
        const key = variantRowKey(variant);
        groups.set(key, [...(groups.get(key) ?? []), variant]);
    }
    const rows = [...groups.values()].sort((a, b) => {
        const productOrder = a[0].product.name.localeCompare(b[0].product.name, 'es');
        return productOrder || colorLabel(a[0]).localeCompare(colorLabel(b[0]), 'es');
    });

    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1050px] border-collapse text-sm">
                <thead className="bg-muted/30">
                    <tr className="border-b text-left">
                        {showProduct && <th scope="col" className="min-w-56 px-3 py-3 font-medium">Producto</th>}
                        <th scope="col" className="min-w-36 px-3 py-3 font-medium">Color(es)</th>
                        <th scope="col" className="min-w-28 px-3 py-3 font-medium">Capellada</th>
                        <th scope="col" className="min-w-24 px-3 py-3 font-medium">Suela</th>
                        <th scope="col" className="w-24 px-3 py-3 font-medium">Foto</th>
                        <th scope="col" className="min-w-28 px-3 py-3 font-medium">Código</th>
                        <th scope="col" className="min-w-32 px-3 py-3 font-medium">Códigos de color</th>
                        <th scope="col" className="min-w-28 px-3 py-3 font-medium">Precio</th>
                        {sizes.map(size => <th scope="col" key={size} className="min-w-16 px-3 py-3 text-center font-medium">{size}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(colorVariants => {
                        const first = colorVariants[0];
                        const color = colorLabel(first);
                        const code = first.customFields?.codigo || first.product.customFields?.codigo || '—';
                        const colorCode = colorCodeLabel(first);
                        const photo = colorVariants.find(variant => variant.featuredAsset)?.featuredAsset;

                        return (
                            <tr key={variantRowKey(first)} className="border-b last:border-b-0 hover:bg-muted/20">
                                {showProduct && (
                                    <td className="px-3 py-3">
                                        <Link to="/products/$id" params={{ id: first.product.id }} className="font-medium hover:underline">
                                            {first.product.name}
                                        </Link>
                                    </td>
                                )}
                                <th scope="row" className="px-3 py-3 text-left font-normal">{color}</th>
                                <td className="px-3 py-3">{optionOf(first, 'capellada')?.name ?? '—'}</td>
                                <td className="px-3 py-3">{optionOf(first, 'suela')?.name ?? '—'}</td>
                                <td className="px-3 py-2">
                                    {photo ? <img src={photo.preview} alt={`${first.product.name} ${color}`} className="h-11 w-11 rounded-md border object-cover" /> :
                                        <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-3 font-mono text-xs">{code}</td>
                                <td className="px-3 py-3 font-mono text-xs">{colorCode}</td>
                                <td className="px-3 py-3 whitespace-nowrap">{priceLabel(colorVariants)}</td>
                                {sizes.map(size => {
                                    const variant = colorVariants.find(item => (optionOf(item, 'size')?.name ?? 'Única') === size);
                                    const stock = variant?.stockLevels.reduce((total, level) => total + level.stockOnHand, 0);
                                    return (
                                        <td key={size} className="px-2 py-2 text-center">
                                            {variant ? (
                                                <Link
                                                    to="/product-variants/$id"
                                                    params={{ id: variant.id }}
                                                    search={{ from: 'product' }}
                                                    title={`${variant.sku}: ${stock} unidades`}
                                                    className={`inline-flex min-h-9 min-w-11 items-center justify-center rounded-md px-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary ${stock === 0 ? 'bg-muted/70 text-destructive' : ''}`}
                                                >
                                                    {stock}
                                                </Link>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function ProductVariantMatrix({ productId, showManageButton = true }: { productId: string; showManageButton?: boolean }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['footwear-variant-matrix', productId],
        queryFn: () => fetchVariants(productId),
    });

    if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Cargando variantes…</p>;
    if (error) return <p className="py-6 text-sm text-destructive">No se pudieron cargar las variantes: {error instanceof Error ? error.message : 'Error desconocido.'}</p>;
    return (
        <div className="space-y-4">
            {!data?.length ? <p className="py-6 text-sm text-muted-foreground">Este producto aún no tiene variantes.</p> : <>
            <p className="text-sm text-muted-foreground">Stock físico por color y talla. Selecciona una cantidad para editar la variante.</p>
            <VariantMatrixTable variants={data} />
            </>}
            {showManageButton && <Button render={<Link to="./variants" />} variant="outline" type="button">Administrar variantes</Button>}
        </div>
    );
}

export function ProductVariantsCatalogMatrix() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['footwear-inventory-matrix'],
        queryFn: () => fetchVariants(),
    });

    if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Cargando variantes…</p>;
    if (error) return <p className="py-6 text-sm text-destructive">No se pudieron cargar las variantes: {error instanceof Error ? error.message : 'Error desconocido.'}</p>;
    if (!data?.length) return <p className="py-6 text-sm text-muted-foreground">Aún no hay variantes.</p>;

    return <VariantMatrixTable variants={data} showProduct />;
}

export function ManageFootwearVariants() {
    const { id: productId } = useParams({ strict: false });
    const queryClient = useQueryClient();
    const [pendingVariants, setPendingVariants] = useState<PendingVariant[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function savePendingVariants() {
        if (!pendingVariants.length) return;
        setSaving(true);
        setMessage('');
        try {
            await api.mutate(createFootwearVariantDocument, { input: pendingVariants.map(variant => ({
                productId,
                sku: variant.sku,
                price: variant.price,
                stockOnHand: 0,
                optionIds: [variant.colorOptionId, ...variant.optionIds],
                customFields: { colores: variant.colors },
                translations: [{ languageCode: 'en', name: variant.name }, { languageCode: 'es', name: variant.name }],
            })) });
            setPendingVariants([]);
            await queryClient.invalidateQueries({ queryKey: ['footwear-color-options', productId] });
            await queryClient.invalidateQueries({ queryKey: ['DetailPage', 'product', productId] });
            await queryClient.invalidateQueries({ queryKey: ['productOptionGroups', productId] });
            await queryClient.invalidateQueries({ queryKey: ['footwear-variant-matrix'] });
            await queryClient.invalidateQueries({ queryKey: ['footwear-inventory-matrix'] });
            setMessage('Variantes guardadas.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No se pudieron guardar las variantes.');
        } finally {
            setSaving(false);
        }
    }

    return <div className="space-y-6">
        <CreateFootwearVariant pendingVariants={pendingVariants} setPendingVariants={setPendingVariants} saving={saving} />
        <EditableFootwearVariantMatrix pendingVariants={pendingVariants} setPendingVariants={setPendingVariants} creatingVariants={saving} onSavePending={savePendingVariants} saveMessage={message} />
    </div>;
}

function EditableFootwearVariantMatrix({ pendingVariants, setPendingVariants, creatingVariants, onSavePending, saveMessage }: {
    pendingVariants: PendingVariant[];
    setPendingVariants: Dispatch<SetStateAction<PendingVariant[]>>;
    creatingVariants: boolean;
    onSavePending: () => Promise<void>;
    saveMessage: string;
}) {
    const { id: productId } = useParams({ strict: false });
    const queryClient = useQueryClient();
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['footwear-variant-matrix', productId],
        queryFn: () => fetchVariants(productId),
    });
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState('');

    if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Cargando variantes…</p>;
    if (error) return <p className="py-6 text-sm text-destructive">No se pudieron cargar las variantes: {error instanceof Error ? error.message : 'Error desconocido.'}</p>;
    if (!data?.length && !pendingVariants.length) return <p className="py-6 text-sm text-muted-foreground">Este producto aún no tiene variantes.</p>;

    const sizes = [...new Set([...(data ?? []).map(variant => optionOf(variant, 'size')?.name ?? 'Única'), ...pendingVariants.map(variant => variant.size)])]
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const grouped = new Map<string, { variants: Variant[]; pending: PendingVariant[] }>();
    for (const variant of data ?? []) {
        const key = variantRowKey(variant);
        const row = grouped.get(key) ?? { variants: [], pending: [] };
        row.variants.push(variant);
        grouped.set(key, row);
    }
    for (const variant of pendingVariants) {
        const key = [productId, variant.colorOptionId, variant.optionIds[1], variant.optionIds[2]].join(':');
        const row = grouped.get(key) ?? { variants: [], pending: [] };
        row.pending.push(variant);
        grouped.set(key, row);
    }
    const rows = [...grouped.entries()]
        .map(([key, row]) => ({ key, ...row }))
        .sort((a, b) => {
            const aColor = a.variants[0] ? colorLabel(a.variants[0]) : colorOptionName(a.pending[0].colors);
            const bColor = b.variants[0] ? colorLabel(b.variants[0]) : colorOptionName(b.pending[0].colors);
            return aColor.localeCompare(bColor, 'es');
        });

    async function removeSelected() {
        const selected = rows.filter(row => selectedRows.has(row.key) && row.variants.length);
        const ids = selected.flatMap(row => row.variants.map(variant => variant.id));
        if (!ids.length) return;
        if (!window.confirm(`Eliminarás ${ids.length} variante(s) de ${selected.length} fila(s), incluidas sus tallas. Esta acción no se puede deshacer.`)) return;

        setDeleting(true);
        setMessage('');
        try {
            const response = await api.mutate(deleteFootwearVariantsDocument, { ids });
            const failed = response.deleteProductVariants.filter(result => result.result !== 'DELETED');
            if (failed.length) {
                throw new Error(failed.map(result => result.message).filter(Boolean).join(' ') || 'No se pudieron eliminar las variantes seleccionadas.');
            }
            setSelectedRows(new Set());
            await refetch();
            await queryClient.invalidateQueries({ queryKey: ['footwear-inventory-matrix'] });
            setMessage('Variantes eliminadas.');
        } catch (deleteError) {
            setMessage(deleteError instanceof Error ? deleteError.message : 'No se pudieron eliminar las variantes.');
        } finally {
            setDeleting(false);
        }
    }

    function toggleRow(key: string, checked: boolean) {
        setSelectedRows(current => {
            const next = new Set(current);
            if (checked) next.add(key);
            else next.delete(key);
            return next;
        });
    }

    return <section className="space-y-4">
        <p className="text-sm text-muted-foreground">El código proviene del producto. Las celdas pendientes se guardan con “Guardar variantes”; los cambios en variantes existentes, con “Guardar cambios”.</p>
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-muted/30">
                    <tr className="border-b text-left">
                        <th scope="col" className="w-12 px-3 py-3 font-medium">Eliminar</th>
                        <th scope="col" className="min-w-32 px-3 py-3 font-medium">Código</th>
                        <th scope="col" className="min-w-40 px-3 py-3 font-medium">Color(es)</th>
                        <th scope="col" className="min-w-28 px-3 py-3 font-medium">Capellada</th>
                        <th scope="col" className="min-w-24 px-3 py-3 font-medium">Suela</th>
                        {sizes.map(size => <th scope="col" key={size} className="min-w-20 px-3 py-3 text-center font-medium">{size}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const first = row.variants[0];
                        const pendingFirst = row.pending[0];
                        const color = first ? colorLabel(first) : colorOptionName(pendingFirst.colors);
                        const upper = first ? optionOf(first, 'capellada')?.name : pendingFirst.upper;
                        const sole = first ? optionOf(first, 'suela')?.name : pendingFirst.sole;
                        const code = first?.product.customFields?.codigo || first?.customFields?.codigo || pendingFirst?.code || '—';
                        return <tr key={row.key} className="border-b last:border-b-0">
                            <td className="px-3 py-3 text-center">{first && <input type="checkbox" checked={selectedRows.has(row.key)} onChange={event => toggleRow(row.key, event.target.checked)} disabled={saving || deleting || creatingVariants} aria-label={`Seleccionar ${color}, ${upper ?? 'sin capellada'}, ${sole ?? 'sin suela'} para eliminar`} />}</td>
                            <td className="px-3 py-3 font-mono text-xs">{code}</td>
                            <th scope="row" className="px-3 py-3 text-left font-normal">{color}</th>
                            <td className="px-3 py-3">{upper ?? '—'}</td>
                            <td className="px-3 py-3">{sole ?? '—'}</td>
                            {sizes.map(size => {
                                const variant = row.variants.find(item => (optionOf(item, 'size')?.name ?? 'Única') === size);
                                const pending = row.pending.find(item => item.size === size);
                                if (pending) return <td key={size} className="p-2">
                                    <span className="block py-2 text-center text-sm">0</span>
                                    <button type="button" onClick={() => setPendingVariants(current => current.filter(item => item.id !== pending.id))} disabled={saving || deleting || creatingVariants} className="mt-1 block w-full text-center text-xs text-destructive hover:underline">Quitar</button>
                                </td>;
                                if (!variant) return <td key={size} className="px-2 py-2 text-center text-muted-foreground">—</td>;
                                const stock = variant.stockLevels.reduce((total, level) => total + level.stockOnHand, 0);
                                return <td key={size} className="p-2">
                                    <span className="block py-2 text-center text-sm" aria-label={`Stock de ${color}, ${upper ?? 'sin capellada'}, ${sole ?? 'sin suela'}, talla ${size}`}>{stock}</span>
                                </td>;
                            })}
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>
        <div className="flex items-center gap-3">
            {pendingVariants.length > 0 && <Button type="button" disabled={saving || deleting || creatingVariants} onClick={() => void onSavePending()}>{creatingVariants ? 'Guardando…' : `Guardar variantes (${pendingVariants.length})`}</Button>}
            <Link to="/warehouse/receipts" className="text-sm underline">Gestionar stock por percha</Link>
            <Button type="button" variant="destructive" disabled={!selectedRows.size || saving || deleting || creatingVariants} onClick={() => void removeSelected()}>{deleting ? 'Eliminando…' : `Eliminar seleccionadas (${selectedRows.size})`}</Button>
            {(message || saveMessage) && <p role="status" className="text-sm">{message || saveMessage}</p>}
        </div>
    </section>;
}
