# Plataforma de administración

## Purpose
Definir el acceso y los límites comunes de las extensiones del administrador de Vendure.

## Requirements

### Requirement: Secciones de administración
El administrador SHALL ofrecer navegación a Multivendedor, Etiquetas y Estadísticas de calzado junto al catálogo de Vendure.

#### Scenario: Acceso a una sección instalada
- **GIVEN** un administrador autenticado con los permisos de las secciones
- **WHEN** abre el menú del administrador
- **THEN** puede encontrar las secciones de Multivendedor, Etiquetas y Estadísticas

### Requirement: Autorización en la API
Cada operación personalizada SHALL comprobar los permisos de Vendure que exige su capacidad antes de leer o modificar datos.

#### Scenario: Operación sin permiso suficiente
- **GIVEN** un administrador sin el permiso requerido
- **WHEN** solicita una operación protegida de un plugin
- **THEN** la API rechaza la operación

### Requirement: Alcance por canal
Las consultas de etiquetas y estadísticas SHALL usar el canal activo del administrador para acotar los datos correspondientes.

#### Scenario: Cambio de canal activo
- **GIVEN** datos distintos en dos canales
- **WHEN** el administrador cambia el canal activo
- **THEN** las consultas de etiquetas y estadísticas muestran los datos del nuevo canal

### Requirement: Evolución del esquema
Los campos personalizados y entidades persistentes SHALL incorporarse mediante migraciones de base de datos antes de usarse en la API.

#### Scenario: Despliegue con campos nuevos
- **GIVEN** una versión que añade un campo persistente
- **WHEN** se despliega sobre una base de datos existente
- **THEN** se ejecuta la migración correspondiente antes de consultar ese campo

### Requirement: Datos personales del administrador
Cada administrador SHALL poder consultar y actualizar su celular y su foto de perfil desde su propio perfil, además de los datos personales proporcionados por Vendure.

#### Scenario: Foto personal de un administrador
- **GIVEN** un administrador autenticado
- **WHEN** selecciona una imagen y guarda sus datos personales
- **THEN** la imagen aparece en su perfil y no modifica la foto de otros usuarios

#### Scenario: Perfil vinculado a un vendedor
- **GIVEN** un administrador asociado a un vendedor
- **WHEN** actualiza su celular o sus datos de identidad
- **THEN** la ficha del vendedor refleja los datos personales actualizados
