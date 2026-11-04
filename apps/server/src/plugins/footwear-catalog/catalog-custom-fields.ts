import { CustomFields, LanguageCode } from '@vendure/core';

export const footwearCustomFields: CustomFields = {
    Product: [
        { name: 'horma', type: 'string', nullable: true, label: [{ languageCode: LanguageCode.es, value: 'Horma' }, { languageCode: LanguageCode.en, value: 'Shoe last' }], validate: (value: string | null) => value && value.length > 100 ? 'La horma admite hasta 100 caracteres.' : undefined },
        {
            name: 'combinacionesColores',
            type: 'struct',
            list: true,
            nullable: true,
            ui: { component: 'product-color-combinations-input', fullWidth: true },
            fields: [
                { name: 'primarioNombre', type: 'string' },
                { name: 'primarioCodigo', type: 'string' },
                { name: 'secundarioNombre', type: 'string' },
                { name: 'secundarioCodigo', type: 'string' },
                { name: 'terciarioNombre', type: 'string' },
                { name: 'terciarioCodigo', type: 'string' },
            ],
            validate: value => {
                if (value == null) return;
                if (!Array.isArray(value)) return 'Las combinaciones deben ser una lista.';
                for (const combination of value as Array<Record<string, string | undefined>>) {
                    if (!combination.primarioNombre?.trim() || !combination.primarioCodigo?.trim()) return 'Cada combinación necesita un color primario y su código.';
                    if (Boolean(combination.secundarioNombre?.trim()) !== Boolean(combination.secundarioCodigo?.trim())) return 'El color secundario necesita nombre y código.';
                    if (Boolean(combination.terciarioNombre?.trim()) !== Boolean(combination.terciarioCodigo?.trim())) return 'El color terciario necesita nombre y código.';
                    if (combination.terciarioNombre?.trim() && !combination.secundarioNombre?.trim()) return 'Indica el color secundario antes del terciario.';
                }
            },
            label: [
                { languageCode: LanguageCode.es, value: 'Combinaciones de color' },
                { languageCode: LanguageCode.en, value: 'Color combinations' },
            ],
        },
        {
            name: 'codigo',
            type: 'string',
            nullable: true,
            ui: { component: 'product-code-input' },
            label: [
                { languageCode: LanguageCode.es, value: 'Código' },
                { languageCode: LanguageCode.en, value: 'Code' },
            ],
            description: [
                { languageCode: LanguageCode.es, value: 'Código del modelo, independiente del SKU de cada talla y color.' },
                { languageCode: LanguageCode.en, value: 'Model code, separate from each size and color SKU.' },
            ],
        },
        {
            name: 'genero',
            type: 'string',
            options: [
                { value: 'Hombre', label: [{ languageCode: LanguageCode.en, value: 'Hombre' }, { languageCode: LanguageCode.es, value: 'Hombre' }] },
                { value: 'Mujer', label: [{ languageCode: LanguageCode.en, value: 'Mujer' }, { languageCode: LanguageCode.es, value: 'Mujer' }] },
                { value: 'Unisex', label: [{ languageCode: LanguageCode.en, value: 'Unisex' }, { languageCode: LanguageCode.es, value: 'Unisex' }] },
            ],
            nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            label: [
                { languageCode: LanguageCode.en, value: 'Género' },
                { languageCode: LanguageCode.es, value: 'Género' },
            ],
        },
        {
            name: 'tipo',
            type: 'string',
            options: [
                { value: 'Adulto', label: [{ languageCode: LanguageCode.en, value: 'Adult' }, { languageCode: LanguageCode.es, value: 'Adulto' }] },
                { value: 'Teen', label: [{ languageCode: LanguageCode.en, value: 'Teen' }, { languageCode: LanguageCode.es, value: 'Teen' }] },
                { value: 'Nino', label: [{ languageCode: LanguageCode.en, value: 'Niño' }, { languageCode: LanguageCode.es, value: 'Niño' }] },
                { value: 'Infantil', label: [{ languageCode: LanguageCode.en, value: 'Infantil' }, { languageCode: LanguageCode.es, value: 'Infantil' }] },
            ],
            nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            label: [
                { languageCode: LanguageCode.en, value: 'Tipo' },
                { languageCode: LanguageCode.es, value: 'Tipo' },
            ],
        },
        {
            name: 'estilo',
            type: 'string',
            ui: { component: 'hidden-dashboard-field' },
            options: [
                { value: 'Zapatillas', label: [{ languageCode: LanguageCode.en, value: 'Zapatillas' }, { languageCode: LanguageCode.es, value: 'Zapatillas' }] },
                { value: 'Casual', label: [{ languageCode: LanguageCode.en, value: 'Casual' }, { languageCode: LanguageCode.es, value: 'Casual' }] },
                { value: 'Urbano', label: [{ languageCode: LanguageCode.en, value: 'Urbano' }, { languageCode: LanguageCode.es, value: 'Urbano' }] },
                { value: 'Botas', label: [{ languageCode: LanguageCode.en, value: 'Botas' }, { languageCode: LanguageCode.es, value: 'Botas' }] },
                { value: 'Sandalias', label: [{ languageCode: LanguageCode.en, value: 'Sandalias' }, { languageCode: LanguageCode.es, value: 'Sandalias' }] },
                { value: 'Tacones', label: [{ languageCode: LanguageCode.en, value: 'Tacones' }, { languageCode: LanguageCode.es, value: 'Tacones' }] },
                { value: 'Flats', label: [{ languageCode: LanguageCode.en, value: 'Flats' }, { languageCode: LanguageCode.es, value: 'Flats' }] },
                { value: 'Botas_Botines', label: [{ languageCode: LanguageCode.en, value: 'Botas / Botines' }, { languageCode: LanguageCode.es, value: 'Botas / Botines' }] },
                { value: 'Escolares', label: [{ languageCode: LanguageCode.en, value: 'Escolares' }, { languageCode: LanguageCode.es, value: 'Escolares' }] },
                { value: 'Bebes', label: [{ languageCode: LanguageCode.en, value: 'Bebés' }, { languageCode: LanguageCode.es, value: 'Bebés' }] },
                { value: 'Primeros_Pasos', label: [{ languageCode: LanguageCode.en, value: 'Primeros pasos' }, { languageCode: LanguageCode.es, value: 'Primeros pasos' }] },
            ],
            nullable: true,
            label: [
                { languageCode: LanguageCode.en, value: 'Estilo' },
                { languageCode: LanguageCode.es, value: 'Estilo' },
            ],
        },
        {
            name: 'suela',
            type: 'string',
            list: true,
            ui: { component: 'hidden-dashboard-field' },
            options: [
                { value: 'PVC', label: [{ languageCode: LanguageCode.en, value: 'PVC' }] },
                { value: 'TR', label: [{ languageCode: LanguageCode.en, value: 'TR' }] },
                { value: 'Caucho', label: [{ languageCode: LanguageCode.en, value: 'Caucho' }] },
                { value: 'EVA', label: [{ languageCode: LanguageCode.en, value: 'EVA' }] },
            ],
            nullable: true,
            label: [
                { languageCode: LanguageCode.en, value: 'Suela (Material)' },
                { languageCode: LanguageCode.es, value: 'Suela (Material)' },
            ],
        },
        {
            name: 'capellada',
            type: 'string',
            list: true,
            ui: { component: 'hidden-dashboard-field' },
            options: [
                { value: 'Cuero', label: [{ languageCode: LanguageCode.en, value: 'Cuero' }, { languageCode: LanguageCode.es, value: 'Cuero' }] },
                { value: 'Sintetico', label: [{ languageCode: LanguageCode.en, value: 'Sintético' }, { languageCode: LanguageCode.es, value: 'Sintético' }] },
                { value: 'Otro', label: [{ languageCode: LanguageCode.en, value: 'Otro' }, { languageCode: LanguageCode.es, value: 'Otro' }] },
            ],
            nullable: true,
            label: [
                { languageCode: LanguageCode.en, value: 'Capellada (Material)' },
                { languageCode: LanguageCode.es, value: 'Capellada (Material)' },
            ],
        },
        {
            name: 'rangoTallas',
            type: 'string',
            list: true,
            ui: { component: 'hidden-dashboard-field' },
            options: [
                { value: 'Pequeno_21_26', label: [{ languageCode: LanguageCode.en, value: 'Pequeño (21-26)' }, { languageCode: LanguageCode.es, value: 'Pequeño (21-26)' }] },
                { value: 'Mediano_27_36', label: [{ languageCode: LanguageCode.en, value: 'Mediano (27-36)' }, { languageCode: LanguageCode.es, value: 'Mediano (27-36)' }] },
                { value: 'Grande_37_45', label: [{ languageCode: LanguageCode.en, value: 'Grande (37-45)' }, { languageCode: LanguageCode.es, value: 'Grande (37-45)' }] },
            ],
            nullable: true,
            label: [
                { languageCode: LanguageCode.en, value: 'Rango de Tallas' },
                { languageCode: LanguageCode.es, value: 'Rango de Tallas' },
            ],
        },
        {
            name: 'precioBase',
            type: 'int',
            nullable: true,
            ui: { component: 'product-pricing-input', fullWidth: true },
            label: [{ languageCode: LanguageCode.es, value: 'Precio base' }],
        },
        {
            name: 'margenGanancia',
            type: 'int',
            nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            label: [{ languageCode: LanguageCode.es, value: 'Margen de ganancia' }],
        },
        {
            name: 'ajustesRangoTalla',
            type: 'struct', list: true, nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            fields: [{ name: 'rangoTalla', type: 'string' }, { name: 'ajuste', type: 'int' }],
            label: [{ languageCode: LanguageCode.es, value: 'Ajustes por rango de talla' }],
        },
        {
            name: 'ajustesCapellada',
            type: 'struct', list: true, nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            fields: [{ name: 'capellada', type: 'string' }, { name: 'ajuste', type: 'int' }],
            label: [{ languageCode: LanguageCode.es, value: 'Ajustes por capellada' }],
        },
        {
            name: 'extrasPrecio',
            type: 'struct', list: true, nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            fields: [{ name: 'nombre', type: 'string' }, { name: 'ajuste', type: 'int' }],
            label: [{ languageCode: LanguageCode.es, value: 'Extras u otros ajustes' }],
        },
        {
            name: 'ajustesSuela',
            type: 'struct',
            list: true,
            nullable: true,
            ui: { component: 'hidden-dashboard-field' },
            fields: [
                { name: 'suela', type: 'string' },
                { name: 'ajuste', type: 'int' },
            ],
            label: [
                { languageCode: LanguageCode.en, value: 'Sole price adjustments' },
                { languageCode: LanguageCode.es, value: 'Ajustes de precio por suela' },
            ],
        },
    ],
    ProductOption: [
        {
            name: 'colores',
            type: 'struct',
            list: true,
            nullable: true,
            fields: [
                { name: 'nombre', type: 'string' },
                { name: 'codigo', type: 'string' },
            ],
            validate: value => value.length <= 3 ? undefined : 'Se permite un máximo de 3 colores por combinación.',
            label: [
                { languageCode: LanguageCode.es, value: 'Colores de la opción' },
                { languageCode: LanguageCode.en, value: 'Option colors' },
            ],
        },
    ],
    ProductVariant: [
        {
            name: 'codigo',
            type: 'string',
            nullable: true,
            readonly: true,
            label: [
                { languageCode: LanguageCode.es, value: 'Código' },
                { languageCode: LanguageCode.en, value: 'Code' },
            ],
            description: [
                { languageCode: LanguageCode.es, value: 'Código heredado automáticamente del producto.' },
                { languageCode: LanguageCode.en, value: 'Code inherited automatically from the product.' },
            ],
        },
        {
            name: 'codigoBarras',
            type: 'string',
            nullable: true,
            readonly: true,
            validate: (value: string | null | undefined) => !value || /^[0-9A-Z .$/+%\-]+$/i.test(value)
                ? undefined
                : 'El código de barras solo admite letras, números, espacios y - . $ / + %.',
            label: [
                { languageCode: LanguageCode.es, value: 'Código de barras' },
                { languageCode: LanguageCode.en, value: 'Barcode' },
            ],
            description: [
                { languageCode: LanguageCode.es, value: 'Se genera automáticamente a partir del SKU.' },
                { languageCode: LanguageCode.en, value: 'Generated automatically from the SKU.' },
            ],
        },
        {
            name: 'colores',
            type: 'struct',
            list: true,
            nullable: true,
            fields: [
                {
                    name: 'nombre',
                    type: 'string',
                    options: [
                        'Negro', 'Blanco', 'Café', 'Beige', 'Azul', 'Rojo',
                        'Rosa', 'Miel', 'Gris', 'Verde', 'Amarillo', 'Morado',
                    ].map(value => ({
                        value,
                        label: [
                            { languageCode: LanguageCode.es, value },
                            { languageCode: LanguageCode.en, value },
                        ],
                    })),
                },
                { name: 'codigo', type: 'string' },
            ],
            validate: value => value.length <= 3 ? undefined : 'Se permite un máximo de 3 colores por variante.',
            label: [
                { languageCode: LanguageCode.es, value: 'Colores de la variante' },
                { languageCode: LanguageCode.en, value: 'Variant colors' },
            ],
            description: [
                { languageCode: LanguageCode.es, value: 'Agrega hasta tres colores y el código de cada uno.' },
                { languageCode: LanguageCode.en, value: 'Add up to three colors and the code for each one.' },
            ],
        },
    ],
};
