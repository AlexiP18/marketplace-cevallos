# Instituciones financieras de Ecuador

## Purpose
Definir el catálogo administrable de instituciones usado en los datos de cobro del vendedor.

## Requirements

### Requirement: Catálogo administrable
El superadministrador SHALL poder consultar, crear, editar y activar o desactivar instituciones financieras con nombre, tipo y RUC cuando corresponda.

#### Scenario: Desactivación de una institución
- **GIVEN** una institución activa
- **WHEN** el superadministrador la desactiva
- **THEN** permanece en el catálogo administrativo y deja de ofrecerse para nuevas selecciones

### Requirement: Integridad de instituciones
El sistema SHALL impedir nombres repetidos y RUC institucionales repetidos; cuando se informa un RUC, SHALL exigir un formato ecuatoriano de trece dígitos.

#### Scenario: Nombre duplicado
- **GIVEN** una institución ya registrada
- **WHEN** se intenta guardar otra con el mismo nombre
- **THEN** la operación se rechaza con un mensaje de duplicidad

### Requirement: Selección de institución en el alta
El campo «Institución financiera» SHALL permitir buscar y seleccionar instituciones activas por nombre y SHALL mostrar los bancos antes que las cooperativas de segmento 1.

#### Scenario: Búsqueda por nombre
- **GIVEN** el cuarto paso del alta de vendedor
- **WHEN** el administrador escribe parte del nombre de un banco
- **THEN** el listado se filtra por nombre y muestra opciones seleccionables sin sustituir su nombre por el RUC

### Requirement: Datos iniciales de Ecuador
El catálogo SHALL disponer de bancos públicos y privados y cooperativas ecuatorianas cargados como datos iniciales, que el administrador puede corregir posteriormente.

#### Scenario: Primer uso del formulario
- **GIVEN** una instalación con los datos iniciales cargados
- **WHEN** el administrador abre el selector de institución financiera
- **THEN** puede escoger una institución existente sin escribirla manualmente
