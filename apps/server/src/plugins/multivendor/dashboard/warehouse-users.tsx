import { api, Button, Card, CardContent, CardHeader, CardTitle, type DashboardRouteDefinition, useChannel, useQuery, useQueryClient } from '@vendure/dashboard';
import { type FormEvent, useState } from 'react';
import { Users } from 'lucide-react';

type WarehouseRole = 'ADMINISTRADOR' | 'BODEGUERO' | 'DESPACHADOR';
type User = { id: string; firstName: string; lastName: string; emailAddress: string; role: WarehouseRole; owner: boolean };
type Data = { warehouseUsers: { businessName: string; owner: User | null; users: User[] } };

const query = `query WarehouseUsers { warehouseUsers { businessName owner { id firstName lastName emailAddress role owner } users { id firstName lastName emailAddress role owner } } }`;
const saveMutation = `mutation SaveWarehouseUser($input: SaveWarehouseUserInput!) { saveWarehouseUser(input: $input) { id } }`;
const removeMutation = `mutation RemoveWarehouseUser($id: ID!) { removeWarehouseUser(id: $id) }`;
const inputClass = 'mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm';
const roles: { value: WarehouseRole; label: string; detail: string }[] = [
    { value: 'ADMINISTRADOR', label: 'Administrador', detail: 'Gestiona catálogo, pedidos y usuarios del almacén.' },
    { value: 'BODEGUERO', label: 'Bodeguero', detail: 'Consulta catálogo y pedidos para recepción y preparación.' },
    { value: 'DESPACHADOR', label: 'Despachador', detail: 'Consulta pedidos y datos de entrega para despacho.' },
];

function WarehouseUsersPage() {
    const { activeChannel } = useChannel();
    const client = useQueryClient();
    const key = ['warehouse-users', activeChannel?.id];
    const { data, error, isLoading } = useQuery({ queryKey: key, queryFn: () => api.query<Data>(query) });
    const [editing, setEditing] = useState<User | null>(null);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (name: string) => String(form.get(name) || '').trim();
        const password = value('password');
        if (!editing && password.length < 8) { setMessage('La contraseña debe tener al menos 8 caracteres.'); return; }
        setBusy(true); setMessage('');
        try {
            await api.mutate(saveMutation, { input: {
                ...(editing ? { id: editing.id } : {}),
                firstName: value('firstName'), lastName: value('lastName'), emailAddress: value('emailAddress'),
                role: value('role'), ...(password ? { password } : {}),
            } });
            await client.invalidateQueries({ queryKey: key });
            setEditing(null); setAdding(false);
            setMessage('Usuario guardado.');
        } catch (cause) {
            const error = cause instanceof Error ? cause.message.replace(/^GraphQL Request Error:\s*/i, '') : '';
            setMessage(/email-address-already|email.*exists|correo.*registrado/i.test(error) ? 'El correo ya está registrado. Usa otro para este usuario.' : error || 'No se pudo guardar el usuario.');
        } finally { setBusy(false); }
    }

    async function remove(user: User) {
        if (!window.confirm(`¿Desactivar el acceso de ${user.firstName} ${user.lastName}?`)) return;
        setBusy(true); setMessage('');
        try {
            await api.mutate(removeMutation, { id: user.id });
            await client.invalidateQueries({ queryKey: key });
            setMessage('Acceso desactivado.');
        } catch (cause) {
            setMessage(cause instanceof Error ? cause.message.replace(/^GraphQL Request Error:\s*/i, '') : 'No se pudo desactivar el usuario.');
        } finally { setBusy(false); }
    }

    return <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Usuarios del almacén</h1><p className="text-sm text-muted-foreground">{data?.warehouseUsers.businessName || 'Cuentas de gestión del canal activo'}</p></div><Button disabled={busy} onClick={() => { setEditing(null); setAdding(true); setMessage(''); }}>Agregar usuario</Button></div>
        {isLoading && <p>Cargando usuarios…</p>}
        {error && <p role="alert" className="text-destructive">No se pudieron cargar los usuarios. Selecciona el canal de tu almacén.</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
        {data && <Card><CardHeader><CardTitle>Personal con acceso</CardTitle></CardHeader><CardContent className="space-y-3">
            {[...(data.warehouseUsers.owner ? [data.warehouseUsers.owner] : []), ...data.warehouseUsers.users].map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div><p className="font-medium">{user.firstName} {user.lastName} {user.owner && <span className="text-xs text-muted-foreground">· Titular</span>}</p><p className="text-sm text-muted-foreground">{user.emailAddress} · {roles.find(role => role.value === user.role)?.label}</p></div>
                {!user.owner && <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setAdding(false); setEditing(user); setMessage(''); }}>Editar</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void remove(user)}>Desactivar</Button></div>}
            </div>)}
        </CardContent></Card>}
        {data && <Card><CardHeader><CardTitle>Alcance de cada perfil</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">{roles.map(role => <div key={role.value} className="rounded-md border p-3"><p className="font-medium">{role.label}</p><p className="mt-1 text-sm text-muted-foreground">{role.detail}</p></div>)}</CardContent></Card>}
        {(adding || editing) && <Card><CardHeader><CardTitle>{editing ? 'Editar usuario' : 'Agregar usuario'}</CardTitle></CardHeader><CardContent>
            <form key={editing?.id || 'new'} onSubmit={event => void save(event)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Nombre<input name="firstName" className={inputClass} defaultValue={editing?.firstName} required minLength={2} /></label><label className="text-sm">Apellido<input name="lastName" className={inputClass} defaultValue={editing?.lastName} required minLength={2} /></label></div>
                <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Correo<input name="emailAddress" type="email" className={inputClass} defaultValue={editing?.emailAddress} required /></label><label className="text-sm">{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}<input name="password" type="password" autoComplete="new-password" className={inputClass} required={!editing} minLength={8} /></label></div>
                <label className="block text-sm">Perfil<select name="role" className={inputClass} defaultValue={editing?.role || 'BODEGUERO'}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                <p className="text-xs text-muted-foreground">Los permisos se limitan al canal de este almacén. Los perfiles operativos tienen acceso de consulta; sus acciones específicas de inventario y despacho requieren controles propios.</p>
                <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar usuario'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setAdding(false); setEditing(null); }}>Cancelar</Button></div>
            </form>
        </CardContent></Card>}
    </div>;
}

export const warehouseUsersRoute: DashboardRouteDefinition = {
    path: '/warehouse-users',
    navMenuItem: { sectionId: 'multivendor', id: 'warehouse-users', title: 'Usuarios del almacén', icon: Users, requiresPermission: 'UpdateSeller' },
    loader: () => ({ breadcrumb: 'Usuarios del almacén' }),
    component: WarehouseUsersPage,
};
