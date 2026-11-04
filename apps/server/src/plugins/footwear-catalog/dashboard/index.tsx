import { defineDashboardExtension } from '@vendure/dashboard';
import { ManageFootwearVariants, ProductVariantMatrix, ProductVariantsCatalogMatrix } from './components/product-variant-matrix';
import { ProductColorCombinationsInput } from './components/product-color-combinations-input';
import { VariantBarcode } from './components/variant-barcode';
import { HiddenDashboardField } from './components/price-adjusted-multi-input';
import { ProductCodeInput } from './components/product-code-input';
import { ProductPricingInput } from './components/product-pricing-input';
import './catalog-fields.css';

defineDashboardExtension({
    pageBlocks: [
        {
            id: 'product-footwear-variant-setup',
            title: 'Variantes de producto',
            location: {
                pageId: 'product-detail',
                column: 'main',
                position: { blockId: 'generate-variants', order: 'replace' },
            },
            component: ManageFootwearVariants,
        },
        {
            id: 'product-footwear-options',
            location: {
                pageId: 'product-detail',
                column: 'full',
                position: { blockId: 'option-groups', order: 'replace' },
            },
            component: () => null,
        },
        {
            id: 'manage-footwear-options',
            location: {
                pageId: 'manage-product-variants',
                column: 'full',
                position: { blockId: 'option-groups', order: 'replace' },
            },
            component: () => null,
        },
        {
            id: 'catalog-variant-matrix',
            title: 'Inventario por color y talla',
            location: {
                pageId: 'product-variant-list',
                column: 'full',
                position: { blockId: 'list-table', order: 'replace' },
            },
            component: ProductVariantsCatalogMatrix,
        },
        {
            id: 'editable-footwear-variant-matrix',
            title: 'Variantes',
            location: {
                pageId: 'manage-product-variants',
                column: 'main',
                position: { blockId: 'product-variants', order: 'replace' },
            },
            component: ManageFootwearVariants,
        },
        {
            id: 'footwear-variant-matrix',
            title: 'Variantes de producto',
            location: {
                pageId: 'product-detail',
                column: 'main',
                position: { blockId: 'product-variants-table', order: 'replace' },
            },
            component: ({ context }) => (
                <ProductVariantMatrix
                    productId={String(context.entity.id)}
                />
            ),
        },
        {
            id: 'variant-barcode',
            title: 'Código de barras',
            location: {
                pageId: 'product-variant-detail',
                column: 'main',
                position: { blockId: 'main-form', order: 'after' },
            },
            component: ({ context }) => (
                <VariantBarcode value={context.entity?.customFields?.codigoBarras || context.entity?.sku} />
            ),
        },
    ],
    customFormComponents: {
        customFields: [
            { id: 'product-color-combinations-input', component: ProductColorCombinationsInput },
            { id: 'product-code-input', component: ProductCodeInput },
            { id: 'product-pricing-input', component: ProductPricingInput },
            { id: 'hidden-dashboard-field', component: HiddenDashboardField },
        ],
    },
    navSections: config => ({ sections: config.sections.map(section => section.id === 'catalog' && 'items' in section ? { ...section, items: section.items?.filter(item => item.id !== 'option-groups') } : section) }),
});
