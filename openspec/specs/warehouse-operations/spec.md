# Operación de bodega, perchas y kardex

## Purpose
Registrar recepción física, localizar pares y validar el alistamiento de pedidos en el canal de cada vendedor.

## Requirements

### Requirement: Perchas propias del almacén
El administrador del vendedor SHALL crear códigos de percha únicos dentro de su almacén. Cada percha SHALL ser una `StockLocation` asociada al canal del vendedor y SHALL mostrar los pares físicos que contiene.
La operación de perchas en el dashboard SHALL corresponder al personal del almacén del canal vendedor.

#### Scenario: Creación de una percha
- **GIVEN** un administrador en el canal de su almacén
- **WHEN** crea la percha `P-A01`
- **THEN** esta queda disponible para registrar ingresos y no se admite otra percha con el mismo código en ese almacén

### Requirement: Recepción física RF-05
Un administrador o bodeguero SHALL recibir pares seleccionando una variante exacta, cantidad entera positiva y percha activa. La confirmación SHALL incrementar el stock físico de Vendure en esa ubicación y crear un movimiento con usuario y referencia de recepción en una transacción.

#### Scenario: Recepción del taller
- **GIVEN** una variante sin stock en la percha `P-A01`
- **WHEN** el bodeguero confirma cinco pares recibidos
- **THEN** la ubicación muestra cinco pares y el kardex registra un ajuste de entrada asociado al usuario

### Requirement: Ubicación del stock anterior
El administrador SHALL poder trasladar pares libres desde una ubicación anterior sin percha a una percha propia, sin aumentar el stock total y sin mover unidades reservadas.
Una vez exista una percha en algún canal de la variante, los ajustes directos por la mutación nativa de variantes SHALL rechazarse; los movimientos físicos SHALL pasar por Bodega.

#### Scenario: Traslado de existencias
- **GIVEN** tres pares libres en una ubicación anterior
- **WHEN** se ubican dos en `P-A01`
- **THEN** se descuentan dos del origen, se añaden dos al destino y ambos asientos quedan en el kardex

### Requirement: Traslado entre perchas
El bodeguero o administrador SHALL poder mover pares libres entre dos perchas de su canal con un motivo; el total del inventario SHALL permanecer igual y ambas ubicaciones SHALL quedar asentadas en el kardex.

#### Scenario: Reorganización de bodega
- **GIVEN** cuatro pares libres en `P-A01`
- **WHEN** el bodeguero traslada dos a `P-B02`
- **THEN** la primera percha queda con dos pares, la segunda recibe dos y el kardex registra la salida y la entrada

### Requirement: Alistamiento asistido RF-08
El sistema SHALL listar pedidos en estado de pago confirmado con variante, cantidad y percha asignada. El bodeguero SHALL escanear un QR individual emitido `SBX1:<uuid>` por cada caja; el servidor SHALL resolver su variante internamente y verificar canal, pedido, percha y cantidad asignada. Una lectura discrepante o no emitida SHALL mostrar un error.
Al reservar stock para un pedido nuevo y publicar disponibilidad, Vendure SHALL utilizar exclusivamente perchas activas del canal propietario. El stock anterior sin percha SHALL conservarse, pero no ofrecerse como disponible para una nueva reserva hasta regularizar su ubicación.

#### Scenario: QR equivocado
- **GIVEN** un pedido que requiere la variante 123 desde `P-A01`
- **WHEN** el bodeguero escanea una etiqueta individual de la variante 456
- **THEN** se rechaza la lectura y el par sigue pendiente

### Requirement: Bloqueo de despacho incompleto
Vendure SHALL rechazar la transición inicial y el envío de un fulfillment si faltan pares escaneados, no existen asignaciones a perchas activas del almacén o el pedido no está en un estado de pago válido. No SHALL existir una excepción que permita despachar stock anterior sin percha desde la API nativa.

#### Scenario: Cierre prematuro
- **GIVEN** una línea de dos pares con un solo QR validado
- **WHEN** un usuario intenta crear su fulfillment
- **THEN** se impide la transición a `Pending` y no se descuenta el segundo par del inventario

### Requirement: Kardex operativo RF-10
El administrador SHALL consultar los movimientos de stock de Vendure en orden cronológico descendente, con fecha, variante, percha o ubicación, tipo, cantidad, usuario cuando exista y saldo físico y reservado resultante. SHALL poder filtrar por fechas, SKU o código de modelo, tipo y usuario. Los movimientos no SHALL tener opciones de edición o borrado; las correcciones SHALL generar un nuevo ajuste justificado por un administrador.

#### Scenario: Corrección de merma
- **GIVEN** una percha con diez pares físicos y sin reservas
- **WHEN** un administrador registra una merma de un par con motivo
- **THEN** el stock queda en nueve y aparece un nuevo asiento con su identidad y motivo

### Requirement: Aislamiento por canal
Las consultas y mutaciones de bodega SHALL exigir sesión y SHALL limitar perchas, variantes y pedidos al canal activo del vendedor, salvo la consulta del superadministrador dentro de un canal seleccionado.

#### Scenario: Percha de otro negocio
- **GIVEN** un bodeguero del vendedor A
- **WHEN** intenta registrar una recepción en una percha del vendedor B
- **THEN** la operación se rechaza sin cambiar ninguna existencia

### Requirement: Validación de comprobantes RF-07
El despachador o administrador del almacén SHALL adjuntar un comprobante JPG, PNG o PDF de hasta 512 KB, referencia, institución e importe exacto del pedido pendiente. El archivo SHALL conservarse en la base de datos con acceso autorizado por canal, sin URL pública. La aprobación SHALL registrar un pago manual confirmado en Vendure y comprometer la reserva para que deje de expirar. La mutación nativa addManualPaymentToOrder SHALL rechazarse por API para impedir omitir el comprobante, incluso si se utiliza un alias o el nombre de una pasarela. Las llamadas internas que distribuyen un pago verificado entre subórdenes SHALL conservarse. Aprobar el pago no SHALL descontar físicamente el mismo par antes del fulfillment; la salida física única se registra al despachar conforme RF-09. El rechazo SHALL exigir motivo y cancelar el pedido para liberar sus reservas. El registro SHALL conservar usuario y fecha de la decisión.

#### Scenario: Rechazo de comprobante
- **GIVEN** un comprobante pendiente en el canal del almacén
- **WHEN** el despachador lo rechaza indicando un motivo
- **THEN** el pedido se cancela, se libera la reserva mediante Vendure y se conserva el comprobante y la decisión

### Requirement: Despacho y nota de entrega RF-09
El despachador SHALL registrar transportista y guía. El servidor SHALL exigir pago confirmado completo y todos los pares escaneados antes de crear el fulfillment y pasarlo a Shipped. Vendure SHALL registrar la salida de existencias en el kardex. El dashboard SHALL generar una nota PDF con cliente, dirección, pedido, variantes, cantidades, transportista y guía.

#### Scenario: Despacho incompleto
- **GIVEN** un pedido pagado con pares sin validar
- **WHEN** se intenta confirmar el despacho
- **THEN** se rechaza la operación sin crear un fulfillment

### Requirement: Etiquetas individuales
Cada etiqueta QR generada SHALL tener un identificador individual. Una etiqueta ya escaneada SHALL rechazarse en lecturas posteriores, incluso para otro pedido. Las etiquetas antiguas sin identificador individual SHALL requerir reimpresión para nuevas validaciones.

### Requirement: Regularización de ubicaciones anteriores con reservas
El administrador SHALL poder vincular una ubicación anterior exclusiva del almacén a un código de percha sin cambiar sus cantidades, asignaciones ni movimientos históricos. El servidor SHALL rechazar ubicaciones compartidas con otro vendedor o con existencias ajenas. Las líneas antiguas sin percha SHALL permanecer visibles en Alistamiento con un aviso y bloqueo de despacho hasta su regularización.

#### Scenario: Reserva anterior en ubicación exclusiva
- **GIVEN** una ubicación del almacén con pares físicos y reservados, sin percha
- **WHEN** el administrador la vincula a una nueva percha
- **THEN** conserva stock, reserva y referencias de ubicación, y el pedido puede alistarse con las mismas asignaciones y controles QR
