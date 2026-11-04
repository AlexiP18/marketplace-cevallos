# Fundamento multivendedor: vendedores y canales

## Purpose
Definir cómo se relacionan los vendedores, canales, cuentas y perfiles en esta instalación de Vendure.

## Requirements

### Requirement: Alcance del dashboard del superadministrador
El dashboard del superadministrador SHALL mostrar la gestión de vendedores o almacenistas, instituciones financieras, clientes y estadísticas. Las secciones de usuarios de almacén, catálogo, marketing, etiquetas y operaciones de bodega SHALL quedar fuera de su vista, incluso al abrir sus rutas directamente. Esta presentación SHALL conservar las secciones disponibles para usuarios vendedores según sus permisos.

#### Scenario: Acceso al catálogo
- **GIVEN** un superadministrador autenticado en cualquier canal
- **WHEN** intenta abrir el catálogo en el dashboard
- **THEN** se muestra que la sección corresponde a los almacenes

#### Scenario: Gestión del catálogo por el vendedor
- **GIVEN** un vendedor con permisos de catálogo
- **WHEN** abre su dashboard
- **THEN** puede acceder a las secciones que corresponden a sus permisos

### Requirement: Identidad comercial y canal
El registro de un vendedor SHALL crear un `Seller` de Vendure y un `Channel` asociado a ese vendedor, con código y token derivados del slug del negocio.

#### Scenario: Alta de un negocio
- **GIVEN** un negocio nuevo con slug `calzados-andes`
- **WHEN** se completa su registro
- **THEN** existe un Seller y un Channel asociado cuyo código y token son `calzados-andes`

### Requirement: Identificador único de canal
El registro SHALL rechazar un slug ya utilizado por un perfil o por el código o token de otro canal.

#### Scenario: Slug ocupado
- **GIVEN** un canal con código `calzados-andes`
- **WHEN** se intenta registrar otro negocio con ese slug
- **THEN** el alta se rechaza antes de crear otro vendedor

### Requirement: Configuración inicial del canal
El canal nuevo SHALL tomar el idioma y la moneda por defecto configurados para el plugin o, en su ausencia, los del canal predeterminado; SHALL tomar de ese canal la configuración tributaria y las zonas tributaria y de envío iniciales.

#### Scenario: Valores heredados
- **GIVEN** un canal predeterminado en español y USD sin opciones de idioma o moneda del plugin
- **WHEN** se registra un vendedor
- **THEN** su nuevo canal inicia con español y USD y la configuración tributaria y de zonas del canal predeterminado

### Requirement: Acceso administrativo acotado al canal
El registro SHALL crear un rol con permisos de vendedor asociado únicamente al nuevo canal y SHALL asignarlo a la nueva cuenta administradora.

#### Scenario: Cuenta del vendedor
- **GIVEN** un vendedor recién registrado
- **WHEN** se consulta el rol de su administrador
- **THEN** el rol está asociado al canal creado para ese vendedor

### Requirement: Perfil ampliado del vendedor
El sistema SHALL guardar un `SellerProfile` que relacione el Seller, el Channel y la cuenta administradora con los datos comerciales, tributarios, de contacto y cobro del negocio.

#### Scenario: Consulta desde el administrador
- **GIVEN** un vendedor registrado
- **WHEN** un administrador autorizado abre su perfil
- **THEN** puede identificar el Seller, el Channel y la cuenta asociados junto a los datos del negocio

### Requirement: Estado inicial según origen del alta
El alta iniciada por un superadministrador SHALL dejar el perfil activo; el registro público SHALL dejarlo pendiente de aprobación salvo que esté habilitada la aprobación automática.

#### Scenario: Alta desde el panel
- **GIVEN** un superadministrador en el formulario de vendedores
- **WHEN** registra un negocio válido
- **THEN** el perfil resultante queda activo

#### Scenario: Alta pública sin aprobación automática
- **GIVEN** la aprobación automática deshabilitada
- **WHEN** un negocio se registra por la API pública
- **THEN** su perfil queda pendiente de aprobación

### Requirement: Directorio público de vendedores activos
La consulta pública del directorio SHALL listar únicamente perfiles con estado activo.

#### Scenario: Directorio con perfiles pendientes
- **GIVEN** un perfil activo y otro pendiente
- **WHEN** se consulta el directorio público
- **THEN** solo aparece el perfil activo

### Requirement: Alcance de datos del canal
Los informes de estadísticas y las plantillas de etiquetas SHALL consultar los datos del canal activo, de manera que el canal creado para un vendedor sirva como ámbito de esas capacidades.

#### Scenario: Informe de un vendedor
- **GIVEN** dos canales con pedidos y variantes distintos
- **WHEN** un administrador autorizado consulta estadísticas en el canal de un vendedor
- **THEN** el informe no incorpora los pedidos ni el catálogo del otro canal

## Known limitations

- Crear un vendedor no asigna productos existentes a su canal ni divide pedidos entre vendedores.
- Aprobar, rechazar o suspender un perfil modifica su estado; estas acciones no desactivan automáticamente el Channel ni la cuenta administradora vinculada.
