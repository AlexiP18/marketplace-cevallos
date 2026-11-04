# Inicio de sesión del administrador

## Requirements

### Requirement: Acceso de usuarios activos
El administrador SHALL autenticar usuarios del dashboard con sus credenciales registradas. Una cuenta dada de baja SHALL perder sus sesiones y no SHALL poder iniciar otra. Los intentos fallidos SHALL mostrar una advertencia comprensible sin revelar si el correo existe.

#### Scenario: Cuenta dada de baja
- **GIVEN** un usuario de almacén desactivado
- **WHEN** intenta iniciar sesión
- **THEN** no obtiene acceso y ve una advertencia para revisar sus credenciales o contactar al administrador

### Requirement: Entrada según el perfil
Tras autenticarse, un usuario que entra en la página principal SHALL ser dirigido al área correspondiente: superadministrador a vendedores, administrador de almacén a productos, bodeguero a recepción y perchas, y despachador a alistamiento. Una ruta solicitada explícitamente SHALL conservarse.

#### Scenario: Bodeguero
- **GIVEN** un usuario con permisos de bodeguero
- **WHEN** inicia sesión sin una ruta de destino explícita
- **THEN** se abre recepción y perchas en su canal

### Requirement: Expiración de sesión
La sesión del dashboard y storefront SHALL utilizar JWT firmado HS256 con identidad y rol, duración máxima de ocho horas y verificación de firma, emisor, audiencia y expiración en cada petición. Vendure SHALL conservar la sesión revocable y la autorización por canal en el servidor. El cierre de sesión SHALL revocar la sesión y eliminar el token del cliente.
