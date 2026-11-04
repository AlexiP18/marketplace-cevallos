# Estadísticas de calzado

## Purpose
Definir los informes de ventas, demanda, existencias, reposición y rotación del administrador.

## Requirements

### Requirement: Detalle de estadísticas por perfil
El superadministrador SHALL consultar todas las secciones del informe con cifras agregadas, evolución por período y distribuciones generales; la respuesta del informe SHALL omitir las filas de variantes. Los usuarios autorizados de cada almacén SHALL poder consultar el detalle del canal activo, incluidos modelos, códigos y variantes.

#### Scenario: Informe general del superadministrador
- **GIVEN** una sesión de superadministrador
- **WHEN** consulta las estadísticas
- **THEN** puede abrir ventas, tallas y colores, inventario y catálogo con cifras agregadas, sin recibir modelos, códigos, SKU ni filas de variantes

#### Scenario: Informe de un almacén
- **GIVEN** un usuario autorizado de un almacén
- **WHEN** consulta las estadísticas de su canal
- **THEN** puede consultar los modelos y variantes de ese canal

### Requirement: Acceso y período
La consulta de estadísticas SHALL exigir lectura de pedidos y catálogo, limitar los datos al canal activo y aceptar un período válido de hasta 366 días según la fecha de Ecuador.

#### Scenario: Rango excesivo
- **GIVEN** un administrador con permisos
- **WHEN** solicita más de 366 días
- **THEN** la consulta se rechaza antes de generar el informe

#### Scenario: Cambio de canal
- **GIVEN** ventas en dos canales
- **WHEN** el administrador cambia el canal activo
- **THEN** el informe contiene solo los pedidos y variantes del canal seleccionado

### Requirement: Base de ventas
Las ventas del informe SHALL basarse en pedidos pagados del canal, excluir pedidos cancelados y activos, e informar ventas de artículos con descuentos e impuestos, sin envío y antes de restar reembolsos.

#### Scenario: Pedido cancelado
- **GIVEN** un pedido pagado y otro cancelado dentro del período
- **WHEN** se calcula el resumen
- **THEN** solo el pedido elegible contribuye a ventas, pedidos y pares vendidos

### Requirement: Resumen y comparación
El administrador SHALL ver pedidos, pares, venta de artículos, promedio por pedido y reembolsos, con comparación frente al período anterior de igual duración.

#### Scenario: Resumen mensual
- **GIVEN** ventas en el período seleccionado y en el anterior
- **WHEN** se abre «Resumen»
- **THEN** se muestran los indicadores actuales y su variación frente al período anterior

### Requirement: Análisis de productos y variantes
El informe SHALL permitir filtrar por género, tipo, estilo, capellada y suela y consultar ventas por producto y variante.

#### Scenario: Filtro de material
- **GIVEN** variantes con distintas suelas
- **WHEN** se selecciona una suela
- **THEN** la tabla de productos y variantes se limita a las variantes que usan esa suela

### Requirement: Matriz de tallas y colores
El administrador SHALL poder alternar una matriz por color y talla entre pares netos vendidos y stock disponible de un producto.

#### Scenario: Cambio de métrica
- **GIVEN** un producto con ventas y existencias por talla
- **WHEN** se cambia de ventas a stock
- **THEN** las celdas conservan su color y talla y muestran las existencias disponibles

### Requirement: Inventario y reposición
El informe SHALL calcular stock disponible como stock físico menos reservado, mostrar variantes sin stock y estimar unidades a reponer según ventas netas, plazo de reposición y stock de seguridad configurados en la vista.

#### Scenario: Ajuste del plazo de reposición
- **GIVEN** una variante con ventas netas y stock controlado
- **WHEN** el administrador cambia el plazo de reposición
- **THEN** la sugerencia de unidades a reponer se recalcula

### Requirement: Catálogo y rotación
El informe SHALL identificar productos sin ventas, con stock inmóvil, sin stock o con rotación lenta en el período elegido.

#### Scenario: Producto sin ventas con existencias
- **GIVEN** un producto con stock disponible y sin pares vendidos
- **WHEN** se abre «Catálogo y rotación»
- **THEN** figura como producto sin ventas y con stock inmóvil

### Requirement: Exportación de informes
El administrador SHALL poder descargar CSV de las vistas de ventas, inventario y catálogo con las columnas mostradas y el período del informe cuando corresponda.

El administrador SHALL poder generar una vista previa en PDF de la pestaña y los filtros actuales, descargarla e imprimirla. El informe SHALL indicar el canal y período consultados. Para el superadministrador SHALL contener únicamente datos agregados, sin modelos, códigos ni SKU.

#### Scenario: Informe PDF de un almacén
- **GIVEN** un almacenista con un período y filtros seleccionados
- **WHEN** genera el informe de inventario
- **THEN** puede revisar el PDF, descargarlo e imprimirlo con las existencias y sugerencias de reposición visibles en la vista

#### Scenario: Informe PDF del superadministrador
- **GIVEN** una sesión de superadministrador
- **WHEN** genera un informe de cualquier pestaña
- **THEN** el PDF contiene únicamente las cifras generales autorizadas para ese perfil

#### Scenario: Exportación de ventas
- **GIVEN** un informe cargado con filtros aplicados
- **WHEN** se descarga el CSV de ventas
- **THEN** el archivo incluye los registros correspondientes al filtro y al período seleccionado
