# Procesamiento multivendedor con Redis/BullMQ

## Requirements

### Requirement: RF-MV-01 Propiedad y publicación
Cada variante SHALL pertenecer a un solo canal vendedor además del canal público predeterminado. Las operaciones SHALL exigir permisos del canal. Un vendedor inactivo SHALL tener su catálogo despublicado; reactivarlo SHALL restaurar únicamente los productos ocultados por esa suspensión. Los precios de cada variante SHALL mantenerse sincronizados entre su propietario y la oferta pública en la misma moneda.

#### Scenario: Dos propietarios
- **WHEN** se intenta asignar una variante a un segundo vendedor
- **THEN** la transacción se rechaza sin compartir sus existencias

### Requirement: RF-MV-02 Reserva FIFO
El checkout SHALL enviar su solicitud a una cola BullMQ compartida con concurrencia global uno. El Worker de admisión SHALL comprobar en FIFO lotes de hasta 100 solicitudes, bloquear las variantes y filas de `stock_level` en orden estable con `FOR UPDATE` y reservar todos los pares de cada carrito de forma atómica. SHALL persistir asignaciones, actor del kardex, huella del carrito y vencimiento antes de comunicar `stockConfirmed`. Un rechazo no SHALL consumir parte de las existencias de un carrito. La operación SHALL ser idempotente y no SHALL depender de contadores Redis como saldo de inventario.

La preparación nativa de precios, promociones y subórdenes SHALL ejecutarse en otra cola después de confirmar el stock. Sus Workers SHALL poder aislarse del proceso de admisión. Las asignaciones SHALL transferirse a las subórdenes mediante asientos compensatorios inmutables conservando las cantidades y perchas, sin liberar temporalmente los contadores. Un fallo de preparación SHALL cancelar la retención y liberar exactamente sus pares. El estado `preparing` SHALL bloquear cambios del carrito y pagos; una huella cambiada por un consumidor interno SHALL provocar compensación.

La API SHALL poder agrupar las solicitudes de un turno del bucle de eventos en lotes Redis de hasta 100, manteniendo su orden y publicándolos con MULTI/EXEC mediante el productor transaccional nativo de BullMQ. El Worker no SHALL observar un lote parcialmente publicado. La API SHALL suscribirse antes del envío, usar identificadores opacos de trabajo como `String` y excluir las cabeceras HTTP del contexto persistido. La respuesta inicial SHALL representar la decisión comprometida; una consulta posterior SHALL devolver el estado vigente. Un fallo de envío SHALL rechazar las solicitudes afectadas y permitir reintentos idempotentes, sin comunicar stock confirmado.

La decisión de cada trabajo SHALL persistirse y notificarse mediante el progreso JSON de BullMQ después del commit. Los consumidores SHALL poder leer también la ubicación anterior en `data.stockDecision` para trabajos existentes. La programación de preparación y TTL SHALL ejecutarse sin retener el turno FIFO; SHALL completarse durante el cierre ordenado o recuperarse desde la retención persistida al reiniciar.

#### Scenario: Último par
- **GIVEN** un par disponible y dos solicitudes consecutivas
- **WHEN** el Worker las procesa
- **THEN** la primera reserva el par y la segunda devuelve `INSUFFICIENT_STOCK`, conservando reservado igual o menor que físico

#### Scenario: Movimiento físico concurrente
- **GIVEN** una recepción, traslado, ajuste o despacho que está modificando la misma variante
- **WHEN** llega una reserva
- **THEN** ambas operaciones se coordinan mediante un bloqueo transaccional por variante antes de leer y modificar saldos

#### Scenario: Stock confirmado con preparación pendiente
- **WHEN** PostgreSQL confirma la asignación y la retención del carrito
- **THEN** el cliente recibe `stockConfirmed: true` y estado `preparing`, sin confundirlos con autorización de pago
- **AND** el backend conserva las validaciones nativas de precios y verifica el pedido propietario antes de aceptar el pago

### Requirement: RF-MV-03 Subórdenes
Al confirmar el carrito SHALL existir una orden Aggregate y una orden Seller por almacén, con reservas, pagos y despacho independientes. El pago global SHALL registrarse contablemente en las subórdenes sin volver a cobrar al comprador ni duplicar reservas. Las sumas de las subórdenes SHALL coincidir con el total principal. El importe compartido de envío SHALL cargarse una sola vez.

#### Scenario: Pago individual
- **WHEN** un despachador confirma el pago de su suborden
- **THEN** las subórdenes de los otros almacenes conservan sus estados y reservas

### Requirement: RNF-MV-03 Latencia verificable de reservas
La confirmación real de inventario SHALL tener una latencia objetivo de 150 ms en operación normal y p95 de 250 ms ante ráfagas de 100 solicitudes. El acuse de encolado no SHALL contarse como confirmación de reserva. El benchmark SHALL incluir envío a Redis, espera FIFO y transacción PostgreSQL; documentará por separado transporte HTTP, autenticación y preparación del carrito cuando estén excluidos. SHALL existir una ejecución estricta que falle al exceder los objetivos.

Un saldo comprometido insuficiente SHALL poder rechazar una solicitud antes de crear subórdenes, sin sustituir la comprobación bajo bloqueos de las solicitudes aceptadas. Un rechazo no SHALL dejar reservas ni subórdenes parciales. La optimización SHALL conservar atomicidad, precios, permisos y kardex.

#### Scenario: Espera de una reserva
- **WHEN** el storefront consulta `marketplaceCheckoutJob` con `wait: true`
- **THEN** el servidor valida primero la sesión propietaria y espera de forma acotada mediante eventos, despertándose al confirmar el stock o terminar la preparación
- **AND** el cliente no añade otro segundo fijo de espera ni acepta un trabajo pendiente como confirmado

#### Scenario: Objetivo no alcanzado
- **WHEN** una medición real supera los límites
- **THEN** el informe conserva el resultado fallido y el requisito pendiente; no se sustituyen las mediciones por tiempos de encolado

### Requirement: RF-MV-04 Vencimiento
Cada reserva SHALL tener una fecha de vencimiento persistida y un trabajo diferido Redis. El plazo SHALL ser de 2700 segundos por defecto, configurable mediante RESERVATION_TTL_MINUTES con un entero entre 1 y 1440 minutos. Un cambio de configuración SHALL afectar únicamente a reservas nuevas. El pago SHALL comprobar el vencimiento bajo bloqueo antes de aceptarse. Confirmar un pago SHALL retirar el trabajo; expirar o rechazar una suborden SHALL cancelar mediante Vendure para liberar stock y asentar el kardex. Un reconciliador SHALL recuperar tareas vencidas ausentes o fallidas, sin liberar reservas pagadas. Un checkout terminado SHALL dejar de bloquear el carrito activo del comprador.

La retención previa a las subórdenes SHALL persistir el mismo vencimiento, que no SHALL reiniciarse al preparar ni recuperar el trabajo. El reconciliador SHALL reconstruir preparación y expiración interrumpidas entre el commit PostgreSQL y el encolado. Al terminar la retención SHALL eliminarse su contexto serializado de la base. Las liberaciones de pares repartidos entre perchas SHALL conservar el saldo y los asientos correctos de cada ubicación, incluso ante reintentos.

#### Scenario: Respuesta de pasarela al cruzar el vencimiento
- **GIVEN** un pago validado dentro del plazo que conserva los bloqueos en su transacción
- **WHEN** la pasarela responde después del límite
- **THEN** la transacción conserva la validación previa para registrar el cobro y distribuirlo entre subórdenes; una nueva operación fuera del plazo se rechaza

### Requirement: RF-06 Cuenta regresiva autorizada
La orden SHALL exponer estado, vencimiento y hora del servidor únicamente al comprador propietario o a un administrador autorizado en su canal. El carrito invitado SHALL usar su sesión activa; el recibo invitado SHALL conservar la política de acceso por código configurada en Vendure. Checkout, detalle/confirmación de pedido y dashboard del almacén SHALL mostrar una cuenta regresiva calculada desde esa hora, actualizando el estado periódicamente. Llegar a cero en el navegador no SHALL extender, aprobar ni liberar reservas por sí mismo.

#### Scenario: Reloj local incorrecto
- **GIVEN** una reserva pendiente y un reloj del navegador adelantado
- **WHEN** se muestra el contador
- **THEN** se utiliza el tiempo del servidor y el tiempo transcurrido monotónico, conservando la decisión de vencimiento en el backend

### Requirement: RNF-MV-04 Persistencia y recuperación
Redis SHALL utilizar AOF con appendfsync everysec y un volumen persistente. Los temporizadores SHALL conservar su vencimiento al reiniciar el Worker. Los vencimientos SHALL persistirse como timestamptz para conservar el mismo instante aunque API y Worker utilicen zonas horarias diferentes. Una prueba aislada SHALL reiniciar Redis y un contenedor Vendure Worker con una reserva real y verificar una sola liberación de stock y un solo asiento compensatorio.

#### Scenario: Recuperación de un vencimiento
- **GIVEN** una reserva pendiente persistida y su trabajo diferido
- **WHEN** se reinician Redis y el contenedor Worker
- **THEN** el trabajo conserva su vencimiento y al expirar cancela la suborden, libera sus pares y conserva idempotencia frente a reintentos

### Requirement: RF-MV-05 Etiquetas
Los lotes de etiquetas SHALL enviarse a BullMQ y renderizarse en el Worker, incluidos los lotes superiores a diez cajas. SHALL utilizarse el mismo diseño del lienzo, PDFKit para el documento y bwip-js para Code128 y QR. Las copias de un mismo par SHALL compartir QR individual y los pares distintos SHALL tener identificadores distintos. La vista previa SHALL mostrar el PDF terminado con sus medidas físicas calculadas desde la disposición de hoja.

### Requirement: RF-MV-06 Reportes
La exportación Excel SHALL procesarse en el Worker mediante cursores PostgreSQL de solo lectura y bloques de 500 filas con SheetJS. SHALL incluir ventas, inventario y rotación. El superadministrador SHALL recibir agregados sin modelos ni SKU; cada taller SHALL recibir únicamente sus datos. La consulta no SHALL adquirir bloqueos de escritura sobre stock_level. Cada hoja SHALL admitir hasta 100000 filas; superado ese límite SHALL pedirse un período menor.

### Requirement: Archivos privados
Los PDF y Excel SHALL conservarse fuera del directorio público de activos, con descarga autenticada por creador, canal y permisos vigentes. Los archivos temporales SHALL eliminarse después de 24 horas. API y Worker SHALL compartir el volumen de archivos privados.
