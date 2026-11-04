# Reservas, bodega y despacho: implementación y verificación

Fecha: 2 de noviembre de 2026. Esta actualización cierra los pendientes funcionales encontrados en la revisión de RF-MV-04, RNF-MV-04 y RF-05 a RF-10. La comprobación distingue implementación, pruebas automáticas y límites operativos.

## Estado de los requisitos

| Requisito | Implementación y evidencia |
|---|---|
| RF-MV-04: expiración | Vencimiento persistido, delayed job por suborden, retiro al pagar, cancelación transaccional al vencer, liberación y reconciliación de tareas. Las pruebas comprueban un solo asiento de liberación frente a reintentos. |
| RNF-MV-04: durabilidad | AOF explícito con `appendfsync everysec`, volumen persistente y `noeviction`. Una reserva real conservó su temporizador al reiniciar Redis y el contenedor Vendure Worker; después venció y liberó stock una sola vez. API y Worker utilizaron zonas horarias diferentes. |
| RF-05: recepción | Variante, cantidad positiva y percha activa obligatorias, transacción, bloqueos compartidos con reservas y asiento con usuario y referencia. La integración registra una recepción real antes de reservar. |
| RF-06: reserva minorista | Contador en checkout, confirmación/detalle del pedido, detalle administrativo y Pagos y despacho. El estado se consulta con autorización de propietario/canal y hora del servidor. Plazo configurable mediante `RESERVATION_TTL_MINUTES`, con 45 minutos por defecto y rango validado de 1 a 1440. Las reservas existentes no cambian de plazo. |
| RF-07: comprobantes | Archivo privado, referencia, institución, importe exacto y aprobación/rechazo auditados. La mutación nativa de pago manual se bloquea por API, incluso con alias o un nombre de pasarela. Las pasarelas y su distribución contable interna conservan sus operaciones. Aprobar compromete el stock y retira el vencimiento; el descuento físico se registra una sola vez al despachar. |
| RF-08: alistamiento | QR individual emitido, variante, canal, percha y lectura única. El stock público y las reservas nuevas usan solo perchas activas. No hay excepción de fulfillment nativo para stock anterior sin percha. Las líneas anteriores permanecen visibles con advertencia y pueden regularizarse vinculando su ubicación exclusiva a una percha. |
| RF-09: despacho | Exige pago completo, ubicación activa, QR de todos los pares, transportista y guía. Genera la nota PDF y pasa el fulfillment a Shipped. La integración verifica un único SALE y el saldo físico final. |
| RF-10: kardex | Movimientos automáticos, usuario/referencia, saldos y filtros. El trigger `stock_movement_immutable` continúa activo. La regularización de una ubicación conserva cantidades, reservas y movimientos, sin crear entradas ficticias. |

## Decisión sobre el stock al aprobar el pago

La disponibilidad disminuye al reservar. Un pago aprobado convierte esa reserva temporal en un compromiso que ya no expira. El par todavía está físicamente en bodega: el único descuento físico y asiento SALE se producen al despachar. Así se interpretan conjuntamente RF-07 y RF-09 y se evita descontar el mismo par dos veces. Un rechazo o vencimiento libera únicamente la reserva pendiente.

## Regularización del stock anterior

En **Bodega → Recepción y perchas**, el administrador puede crear una percha seleccionando **Ubicación anterior (opcional)**. La ubicación conserva sus existencias, reservas y referencias históricas. El backend rechaza ubicaciones asociadas a otro vendedor, con existencias ajenas o que ya tienen percha.

No se asignaron ubicaciones físicas arbitrariamente en los datos del negocio. Hasta vincularlas, las existencias anteriores sin percha no se ofrecen para nuevas reservas. El traslado entre ubicaciones distintas continúa limitado a pares libres; vincular la misma ubicación permite regularizar también reservas existentes sin moverlas ni cancelarlas.

## Fechas y configuración

`MarketplaceReservation.expiresAt` utiliza `timestamptz`. La prueba real detectó que el tipo anterior sin zona podía interpretarse como vencido al pasar de API en Ecuador a Worker en UTC. La migración `ReservationDeadlineTimezone1791776500000` convierte los valores del despliegue anterior de America/Guayaquil y fue aplicada al entorno local.

Para actualizar otra instalación antigua con fechas escritas en otra zona, revisar la conversión antes de aplicar esa migración. El nuevo formato admite API y Worker en zonas distintas. El plazo configurado se utiliza solo al crear reservas nuevas; la fecha persistida sigue siendo la autoridad para las existentes.

## Validaciones ejecutadas

- 67 pruebas de backend aprobadas, incluyendo autorización del contador, recibos de invitado según la política de Vendure, plazo válido, bloqueo del pago manual nativo, stock solo en perchas y vinculación de ubicaciones exclusivas.
- `marketplace.integration.ts` aprobada en copia temporal: FIFO, no sobreventa, TTL, pago tardío, liberación, independencia de subórdenes, pago global, QR concurrente y generación PDF/Excel.
- `reservation-recovery.integration.ts` aprobada con Redis y contenedor Vendure Worker reales y aislados: recepción, reserva de 2700000 ms, reinicio, conservación del temporizador, liberación y kardex únicos, bloqueo de pago manual por API, aprobación del comprobante, exposición autorizada del estado, bloqueo de stock antiguo sin percha, regularización, QR y despacho sin doble descuento.
- Compilación del servidor, Worker y dashboard aprobada. Storefront compilado con Webpack, incluyendo TypeScript y 60 páginas.
- `upgrade:validate` aprobada. Lint del storefront sin errores y con advertencias anteriores. Las pruebas generales del storefront tuvieron 23 aprobadas y dos fallos anteriores: ruta de registro de vendedores con comportamiento en `src/app` y registro de la funcionalidad `seller` incompleto en la configuración de arquitectura. Las pruebas nuevas del contador pasaron.

Las bases, prefijos Redis, contenedores, redes, volúmenes y archivos de credenciales de prueba se retiraron al finalizar. No se reinició el Redis del entorno en uso para probar durabilidad. Los registros temporales de esta ejecución están bajo `/tmp/stock-pending-*.log`.

## Límites

- No se esperaron 45 minutos reales: se verificó el retardo y su conservación, y se adelantó solo el vencimiento de prueba para comprobar la compensación.
- AOF `everysec` puede perder aproximadamente el último segundo de escrituras ante un fallo abrupto. Se probó un reinicio controlado de Redis y una detención abrupta del contenedor Worker; no se simuló pérdida eléctrica del host.
- No se probó cámara física ni impresión. Tampoco se recorrieron visualmente todas las pantallas.
- El build predeterminado de Turbopack sigue bloqueado por permisos del entorno al abrir un puerto; la compilación de producción con Webpack terminó correctamente.
- El trigger protege los movimientos base. Los metadatos de `warehouse_movement_note` se completan dentro de la transacción y no disponen de una API de edición posterior, pero no tienen un trigger equivalente.

## Referencias

- [Reservas y reconciliación](../apps/server/src/plugins/marketplace/reservation.service.ts)
- [Plazo y esquema de la orden](../apps/server/src/plugins/marketplace/marketplace.plugin.ts)
- [Bodega y regularización](../apps/server/src/plugins/warehouse/services/warehouse.service.ts)
- [Bloqueo del pago manual nativo](../apps/server/src/plugins/warehouse/api/warehouse-manual-payment.guard.ts)
- [Guard de fulfillment](../apps/server/src/plugins/warehouse/warehouse-fulfillment-process.ts)
- [Prueba con contenedor Worker](../apps/server/test/reservation-recovery.integration.ts)
- [Migración de vencimientos](../apps/server/src/migrations/1791776500000-reservation-deadline-timezone.ts)
