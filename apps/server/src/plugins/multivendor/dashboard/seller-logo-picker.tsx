import { AssetPickerDialog, Button } from '@vendure/dashboard';
import { useState } from 'react';

export type SellerLogo = { id: string; preview: string };

export function SellerLogoPicker({ value, onChange, label = 'Logo del negocio' }: { value: SellerLogo | null; onChange: (logo: SellerLogo | null) => void; label?: string }) {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');
    return <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex flex-wrap items-center gap-3">
            {value && <img src={value.preview} alt={label} className="h-20 w-20 rounded-md border object-contain" />}
            <Button type="button" variant="outline" onClick={() => setOpen(true)}>{value ? 'Cambiar imagen' : 'Seleccionar o subir imagen'}</Button>
            {value && <Button type="button" variant="outline" onClick={() => { onChange(null); setError(''); }}>Quitar imagen</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AssetPickerDialog open={open} onClose={() => setOpen(false)} title={`Seleccionar ${label.toLowerCase()}`} onSelect={assets => {
            const asset = assets[0];
            if (!asset || asset.type !== 'IMAGE') { setError('Selecciona una imagen válida.'); return; }
            onChange({ id: String(asset.id), preview: asset.preview });
            setError('');
        }} />
    </div>;
}
