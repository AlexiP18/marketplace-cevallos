import { barcodeImage } from '../../../labeling/shared/label-renderer';

export function VariantBarcode({ value }: { value?: string | null }) {
    if (!value) return <p className="text-sm text-muted-foreground">Esta variante todavía no tiene un código de barras.</p>;
    try {
        return <div className="w-fit rounded-md border bg-white p-3"><img src={barcodeImage(value)} alt={`Código de barras Code128 ${value}`} className="h-24 max-w-full" /></div>;
    } catch {
        return <p className="text-sm text-muted-foreground">No se pudo representar este código en Code128.</p>;
    }
}
