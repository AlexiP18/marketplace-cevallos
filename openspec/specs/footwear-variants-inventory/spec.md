# Variantes e inventario de calzado

## Purpose
Definir la creación, consulta y mantenimiento de las variantes por color, talla y materiales.

## Requirements

### Requirement: Dimensiones de una variante
Una variante SHALL corresponder a una combinación de color, talla, capellada y suela permitida por su producto; el administrador SHALL impedir combinaciones duplicadas.

#### Scenario: Alta de una configuración válida
- **GIVEN** un producto con dos combinaciones de color, un rango de tallas y materiales seleccionados
- **WHEN** el administrador elige un color, una talla permitida, una capellada y una suela
- **THEN** puede añadir esa configuración una sola vez

#### Scenario: Talla fuera del rango
- **GIVEN** un producto configurado solo para tallas 27–36
- **WHEN** el administrador abre el selector de talla
- **THEN** ve las tallas permitidas en orden ascendente y no puede escoger la 37

### Requirement: Identificadores de la variante
Al crear una variante, el sistema SHALL generar su SKU y su código de barras y SHALL conservar el código del modelo como dato separado que no se edita en la variante.

#### Scenario: Consulta de una variante creada
- **GIVEN** un producto con código `HN-05`
- **WHEN** se crea y abre una variante
- **THEN** se muestran el código `HN-05`, el SKU generado y la imagen de su código de barras

### Requirement: Preparación local antes de guardar
El administrador SHALL incorporar las variantes nuevas a la tabla como pendientes, sin recargar la página, y SHALL persistirlas en conjunto mediante «Guardar variantes».

#### Scenario: Alta de varias variantes
- **GIVEN** una gestión de variantes abierta
- **WHEN** el administrador agrega dos configuraciones y después pulsa «Guardar variantes»
- **THEN** ambas se crean en el servidor y aparecen como variantes guardadas

### Requirement: Matriz de existencias por variante
La gestión de variantes SHALL mostrar filas por combinación de color y materiales y columnas por talla, con una celda de stock total por variante. Las variantes nuevas SHALL iniciarse con stock cero; los ingresos y ajustes SHALL registrarse en Bodega con percha y asiento de kardex.

#### Scenario: Consulta y gestión de stock existente
- **GIVEN** una variante guardada visible en la matriz
- **WHEN** el administrador consulta su celda de stock
- **THEN** ve el total y puede abrir la gestión de stock por percha para registrar un movimiento

#### Scenario: Variante nueva
- **GIVEN** una configuración de color, talla y materiales pendiente
- **WHEN** el administrador guarda las variantes
- **THEN** se crean con stock cero hasta confirmar una recepción física con percha

### Requirement: Eliminación de filas seleccionadas
La gestión de variantes SHALL permitir seleccionar una o varias filas y confirmar la eliminación de todas las variantes comprendidas en ellas.

#### Scenario: Eliminación confirmada
- **GIVEN** una fila con variantes de varias tallas seleccionada
- **WHEN** el administrador confirma «Eliminar seleccionadas»
- **THEN** se eliminan las variantes de esa fila y se actualiza la matriz

### Requirement: Consulta de inventario del catálogo
El listado de variantes del administrador SHALL presentar una matriz de inventario por producto, color y talla con código, foto, materiales, precio y existencias; cada celda de variante SHALL permitir abrir su detalle.

#### Scenario: Revisión de un producto
- **GIVEN** un producto con variantes en varios colores y tallas
- **WHEN** el administrador abre el listado de variantes
- **THEN** compara en una misma tabla las existencias por talla y color y puede abrir una variante concreta
