import { useAuth } from '@vendure/dashboard';

export function WarehouseLoginIntro() {
    const { authenticationError } = useAuth();
    return <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Acceso al administrador</h1>
        <p className="text-sm text-muted-foreground">Ingresa con el correo y contraseña de tu cuenta.</p>
        {authenticationError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">No pudimos iniciar sesión. Revisa tus credenciales. Si tu cuenta está desactivada, contacta al administrador de tu almacén.</p>}
    </div>;
}
