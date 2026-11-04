# Diseño e impresión de etiquetas

## Purpose
Definir plantillas de etiquetas de calzado, su vista previa y la generación de documentos para imprimir.

## Requirements

### Requirement: Plantillas por canal
El administrador con permiso de catálogo SHALL poder consultar las plantillas del canal activo; guardar y eliminar plantillas SHALL requerir permiso de actualización de catálogo.

#### Scenario: Guardado de una plantilla
- **GIVEN** un administrador autorizado, una plantilla con nombre y un diseño válido
- **WHEN** pulsa «Guardar plantilla»
- **THEN** la plantilla queda disponible al volver a seleccionarla en el mismo canal

### Requirement: Propiedades de la etiqueta
La plantilla SHALL permitir configurar nombre, ancho y alto en unidades relativas, margen de etiqueta y cruces de corte.

#### Scenario: Cambio de tamaño
- **GIVEN** una plantilla abierta
- **WHEN** el administrador modifica ancho o alto
- **THEN** el lienzo refleja la nueva proporción y la vista previa de impresión calcula la medida física resultante

### Requirement: Selección de áreas en cuadrícula
El lienzo SHALL permitir seleccionar celdas contiguas con densidad configurable y asignar a cada área una variable, texto fijo o imagen fija; el área definida SHALL ocultar sus líneas internas de cuadrícula.

#### Scenario: Área nueva
- **GIVEN** una plantilla con cuadrícula visible
- **WHEN** el administrador selecciona un rectángulo de celdas y asigna «Talla»
- **THEN** el área resultante muestra una talla de ejemplo sin líneas internas de cuadrícula

### Requirement: Estilo de área y contenido
Cada área SHALL admitir fondo, margen exterior, padding interior y borde configurable; el contenido SHALL admitir tamaño relativo, alineación y rotación, y el texto SHALL admitir fuente, tamaño, color y estilo.

#### Scenario: Inspección de espaciados
- **GIVEN** un área con margen y padding configurados
- **WHEN** el administrador la selecciona
- **THEN** el lienzo distingue visualmente el espacio del margen y del padding

### Requirement: Variables de calzado
La etiqueta SHALL admitir producto, código, SKU, talla, color, capellada, suela, precio, foto, logo del negocio, código de barras y QR de alistamiento como contenido variable.

#### Scenario: Vista con datos de variante
- **GIVEN** un producto con variantes y una plantilla que usa código, talla y foto
- **WHEN** el administrador selecciona ese producto en «Generar etiquetas»
- **THEN** el lienzo sustituye esos campos por datos de una de sus variantes como ejemplo

#### Scenario: Logo del negocio en la etiqueta
- **GIVEN** un producto asociado al canal de un vendedor con logo y una plantilla con la variable «Logo de negocio»
- **WHEN** se selecciona el producto o se genera el PDF
- **THEN** el área muestra el logo del vendedor con el tamaño, alineación y orientación configurados

#### Scenario: Selección de negocio desde el canal general
- **GIVEN** un superadministrador y un producto sin vendedor asociado o vinculado a varios vendedores
- **WHEN** elige el negocio para la etiqueta
- **THEN** se utiliza su logo en la vista previa y en el PDF, sin cambiar la asociación del producto

#### Scenario: Logo no disponible o negocio ambiguo
- **GIVEN** una plantilla que incluye el logo y un producto sin logo o sin negocio elegido
- **WHEN** se intenta abrir la vista previa del PDF
- **THEN** se informa la causa y se evita generar etiquetas con el logo equivocado o ausente

### Requirement: Presentación de color y barras
El color variable SHALL mostrarse mediante una muestra coloreada y su nombre; la imagen del código de barras SHALL mostrarse sin una línea de texto debajo.

#### Scenario: Etiqueta con color y código de barras
- **GIVEN** una plantilla con ambos contenidos
- **WHEN** se renderiza para una variante
- **THEN** se ve la muestra de color con su nombre y el código de barras sin texto inferior

### Requirement: Selección de producto y cantidades
«Generar etiquetas» SHALL ofrecer búsqueda y selección de producto, una tabla de cantidades por variante, una o dos etiquetas por par y la acción de usar el stock físico como cantidades.

#### Scenario: Cantidades desde inventario
- **GIVEN** un producto con varias variantes y stock físico
- **WHEN** el administrador pulsa «Usar stock físico»
- **THEN** cada cantidad de la tabla toma el stock de su variante

### Requirement: Vista previa y salida PDF
La vista previa SHALL abrir un modal con el PDF, elección de tamaño y márgenes de hoja, columnas y filas automáticas o ajustables, medida de etiqueta en mm y cm, total de etiquetas, etiquetas por hoja y acciones de descarga e impresión.

#### Scenario: Distribución en la hoja
- **GIVEN** una plantilla y cantidades seleccionadas
- **WHEN** el administrador abre la vista previa y cambia el número de columnas
- **THEN** se recalculan filas, medidas físicas y etiquetas por hoja y se actualiza el PDF
