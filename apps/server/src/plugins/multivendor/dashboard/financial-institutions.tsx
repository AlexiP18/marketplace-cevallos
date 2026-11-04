import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, Button, Card, CardContent, CardHeader, CardTitle, DashboardRouteDefinition, PermissionGuard } from '@vendure/dashboard';
import { graphql } from '@/gql';

export type Institution = { id: string; name: string; kind: string; ruc: string | null; active: boolean };
export const institutionsQuery = graphql(`query FinancialInstitutions { financialInstitutions { id name kind ruc active } }`);
const saveInstitution = graphql(`mutation SaveFinancialInstitution($input: SaveFinancialInstitutionInput!) { saveFinancialInstitution(input: $input) { id name kind ruc active } }`);
const kinds: Record<string, string> = { BANCO_PRIVADO: 'Banco privado', BANCO_PUBLICO: 'Banco público', COOPERATIVA: 'Cooperativa', MUTUALISTA: 'Mutualista', OTRO: 'Otro' };
const field = 'mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm';
const empty = { name: '', kind: 'BANCO_PRIVADO', ruc: '', active: true };

function InstitutionsPage() {
    const list = useQuery({ queryKey: ['financial-institutions'], queryFn: () => api.query<{ financialInstitutions: Institution[] }>(institutionsQuery) });
    const [search, setSearch] = useState('');
    const [draft, setDraft] = useState<Partial<Institution> & typeof empty>(empty);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [page, setPage] = useState(0);
    const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matches = (list.data?.financialInstitutions || []).filter(item => normalize(`${item.name} ${item.ruc || ''} ${kinds[item.kind]}`).includes(normalize(search)));
    async function save(event: React.FormEvent) {
        event.preventDefault(); setError(''); setBusy(true);
        try {
            await api.mutate(saveInstitution, { input: { ...draft, id: draft.id || undefined, ruc: draft.ruc.trim() || undefined } });
            await list.refetch(); setDraft(empty);
        } catch (cause) { setError(cause instanceof Error ? cause.message.replace(/^GraphQL Request Error:\s*/i, '') : 'No se pudo guardar la institución.'); }
        finally { setBusy(false); }
    }
    return <PermissionGuard requires="SuperAdmin"><div className="mx-auto max-w-5xl space-y-5 p-6">
        <div><h1 className="text-2xl font-semibold">Instituciones financieras</h1><p className="text-sm text-muted-foreground">Administra las opciones disponibles para el registro de vendedores.</p></div>
        <Card><CardHeader><CardTitle>{draft.id ? 'Editar institución' : 'Agregar institución'}</CardTitle></CardHeader><CardContent>
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Nombre *<input className={field} required minLength={3} maxLength={255} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
                <label className="text-sm">Tipo *<select className={field} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm">RUC (opcional)<input className={field} inputMode="numeric" pattern="[0-9]{13}" maxLength={13} value={draft.ruc} onChange={e => setDraft({ ...draft, ruc: e.target.value.replace(/\D/g, '').slice(0, 13) })} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Disponible en el selector</label>
                {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
                <div className="flex gap-2 sm:col-span-2"><Button disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar institución'}</Button>{draft.id && <Button type="button" variant="outline" onClick={() => { setDraft(empty); setError(''); }}>Cancelar edición</Button>}</div>
            </form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Catálogo</CardTitle></CardHeader><CardContent className="space-y-3">
            <label className="block text-sm">Buscar por nombre, RUC o tipo<input className={field} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
            {list.isLoading && <p>Cargando instituciones…</p>}{list.isError && <p role="alert">No se pudieron cargar las instituciones.</p>}
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Nombre</th><th>Tipo</th><th>RUC</th><th>Estado</th><th /></tr></thead><tbody>{matches.slice(page * 25, (page + 1) * 25).map(item => <tr key={item.id} className="border-t"><td className="py-2 pr-3">{item.name}</td><td>{kinds[item.kind]}</td><td>{item.ruc || '—'}</td><td>{item.active ? 'Activo' : 'Inactivo'}</td><td><Button type="button" variant="outline" onClick={() => { setDraft({ ...item, ruc: item.ruc || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</Button></td></tr>)}</tbody></table></div>
            <div className="flex items-center gap-3 text-sm"><span>{matches.length} instituciones</span><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page + 1} de {Math.max(1, Math.ceil(matches.length / 25))}</span><Button variant="outline" disabled={(page + 1) * 25 >= matches.length} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
        </CardContent></Card>
    </div></PermissionGuard>;
}
export const financialInstitutionsRoute: DashboardRouteDefinition = { path: '/financial-institutions', navMenuItem: { sectionId: 'multivendor', id: 'financial-institutions', title: 'Instituciones financieras' }, loader: () => ({ breadcrumb: 'Instituciones financieras' }), component: () => <InstitutionsPage /> };
