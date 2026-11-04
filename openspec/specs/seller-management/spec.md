# Gestión de vendedores y almacenistas

## Purpose
Definir el alta y la administración de vendedores desde el panel de Vendure.

## Requirements

### Requirement: Alta guiada desde el administrador
Un superadministrador SHALL poder crear un vendedor mediante un formulario por fases para negocio, datos fiscales, administrador y datos de cobro.

#### Scenario: Registro completo
- **GIVEN** un superadministrador con datos válidos del vendedor
- **WHEN** completa las cuatro fases y envía el formulario
- **THEN** se crean el vendedor, su canal, el acceso administrativo y el perfil asociado

### Requirement: Slug derivado del negocio
El formulario SHALL generar el slug desde el nombre del negocio y SHALL mostrarlo sin permitir foco ni edición directa.

#### Scenario: Cambio del nombre
- **GIVEN** la primera fase abierta
- **WHEN** el administrador cambia el nombre del negocio
- **THEN** el slug visible se actualiza automáticamente

### Requirement: Validación de contacto y enlaces
El formulario SHALL validar correo, números móviles ecuatorianos y enlaces de redes sociales antes del envío; los campos de celular SHALL limitarse a diez dígitos.

#### Scenario: Celular excesivo
- **GIVEN** un campo de celular del formulario
- **WHEN** se introducen más de diez dígitos
- **THEN** el formulario impide conservar un valor de más de diez dígitos

#### Scenario: Enlace de red social inválido
- **GIVEN** un enlace de red social informado
- **WHEN** no es una URL HTTP o HTTPS válida
- **THEN** se indica el error antes de crear al vendedor

### Requirement: Identidad y correo únicos
El alta SHALL validar la cédula o RUC según el campo fiscal correspondiente y SHALL rechazar un correo de acceso ya registrado.

#### Scenario: Correo existente
- **GIVEN** un correo ya usado por un administrador
- **WHEN** se intenta crear otro vendedor con ese correo
- **THEN** el formulario muestra una advertencia legible y no duplica la cuenta

### Requirement: Identidades fiscales separadas
El formulario SHALL tratar el RUC del negocio y la cédula o RUC del titular de la cuenta como datos distintos.

#### Scenario: Titular vinculado a negocio
- **GIVEN** un RUC válido del negocio y una identificación válida del titular
- **WHEN** se registran en sus campos respectivos
- **THEN** la validación de instituciones financieras no interpreta la identificación del titular como un nuevo RUC institucional

### Requirement: Administración de perfiles
El administrador con permisos SHALL poder listar, consultar y actualizar los perfiles de vendedor de su canal. Solo el superadministrador SHALL poder aprobar, rechazar o suspender perfiles.

#### Scenario: Revisión de un perfil
- **GIVEN** un usuario autorizado y un perfil existente
- **WHEN** abre la ficha del vendedor
- **THEN** puede consultar sus datos y ejecutar las transiciones de estado disponibles

#### Scenario: Edición de datos del vendedor
- **GIVEN** un superadministrador y un perfil existente
- **WHEN** edita los datos del negocio, tributarios, administrador o cobro y guarda los cambios
- **THEN** la ficha muestra los datos actualizados y el correo de acceso coincide con la cuenta administradora

### Requirement: Logo del negocio
El superadministrador SHALL poder seleccionar o subir una imagen como logo al crear o editar un vendedor, y reemplazarla o quitarla posteriormente.

#### Scenario: Cambio del logo
- **GIVEN** un vendedor existente
- **WHEN** el superadministrador selecciona una imagen en la biblioteca de activos y guarda
- **THEN** la imagen aparece como logo en la ficha del vendedor

#### Scenario: Archivo no válido
- **GIVEN** un archivo de la biblioteca que no es una imagen
- **WHEN** se intenta usarlo como logo
- **THEN** la operación se rechaza sin modificar el perfil

### Requirement: Foto personal del administrador del vendedor
El superadministrador SHALL poder seleccionar o quitar la foto personal del administrador al crear o editar un vendedor; esa foto SHALL compartirse con el perfil de la misma cuenta en Vendure.

#### Scenario: Foto de perfil y logo independientes
- **GIVEN** un vendedor con logo del negocio
- **WHEN** se guarda una foto personal para su administrador
- **THEN** la foto aparece en la ficha y el perfil de esa cuenta sin reemplazar el logo del negocio

#### Scenario: Foto de otro canal
- **GIVEN** un administrador que no es superadministrador
- **WHEN** consulta la foto de un vendedor de otro canal
- **THEN** la foto no se muestra

### Requirement: Usuarios de cada almacén
Un administrador del almacén SHALL poder crear, editar y desactivar usuarios asociados únicamente a su canal, con los perfiles Administrador, Bodeguero y Despachador. El titular inicial del almacén SHALL permanecer identificado y no podrá desactivarse desde este apartado.

#### Scenario: Alta de bodeguero
- **GIVEN** un administrador autorizado en el canal de su almacén
- **WHEN** crea un bodeguero con datos y contraseña válidos
- **THEN** se crea una cuenta de Vendure con un rol limitado al canal del almacén y permisos de consulta para catálogo y pedidos

#### Scenario: Alta de despachador
- **GIVEN** un administrador autorizado en el canal de su almacén
- **WHEN** crea un despachador
- **THEN** la cuenta puede consultar pedidos y datos de entrega del canal, sin permisos generales para modificar pedidos ni pagos

#### Scenario: Protección entre almacenes
- **GIVEN** un usuario de un almacén
- **WHEN** intenta editar o desactivar una cuenta de otro almacén
- **THEN** la operación se rechaza

#### Scenario: Desactivación
- **GIVEN** un usuario adicional de un almacén
- **WHEN** un administrador autorizado desactiva su acceso
- **THEN** la cuenta se elimina lógicamente y deja de aparecer entre los usuarios activos
