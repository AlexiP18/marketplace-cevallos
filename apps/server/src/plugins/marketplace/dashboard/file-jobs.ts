import { api, LS_KEY_SELECTED_CHANNEL_TOKEN, LS_KEY_SESSION_TOKEN } from '@vendure/dashboard';

export async function generateWorkerFile(kind: 'labels' | 'report', variables: Record<string, unknown>, cancelled = () => false) {
    const mutation = kind === 'labels'
        ? 'mutation Labels($input: JSON!) { generateMarketplaceLabels(input: $input) { id } }'
        : 'mutation Report($startDate: DateTime!, $endDate: DateTime!) { generateMarketplaceReport(startDate: $startDate, endDate: $endDate) { id } }';
    const response = await api.mutate(mutation, variables) as Record<string, { id: string }>;
    const id = response[kind === 'labels' ? 'generateMarketplaceLabels' : 'generateMarketplaceReport'].id;
    for (let attempt = 0; attempt < 300; attempt++) {
        if (cancelled()) throw new Error('Generación cancelada en esta vista.');
        const status = await api.query('query FileJob($id: ID!) { marketplaceFileJob(id: $id) { state message result downloadUrl } }', { id }) as { marketplaceFileJob: { state: string; message?: string; result?: any; downloadUrl?: string } };
        const job = status.marketplaceFileJob;
        if (job.state === 'failed') throw new Error(job.message || 'No se pudo generar el archivo.');
        if (job.state === 'completed' && job.downloadUrl) {
            const file = await fetch(job.downloadUrl, { headers: { Authorization: `Bearer ${localStorage.getItem(LS_KEY_SESSION_TOKEN) || ''}`, 'vendure-token': localStorage.getItem(LS_KEY_SELECTED_CHANNEL_TOKEN) || '' } });
            if (!file.ok) throw new Error('No se pudo descargar el archivo del almacén.');
            return { blob: await file.blob(), result: job.result };
        }
        await new Promise(resolve => window.setTimeout(resolve, 1000));
    }
    throw new Error('El archivo sigue en cola. Comprueba que el Worker esté activo y vuelve a intentar.');
}
