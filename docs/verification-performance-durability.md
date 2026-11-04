# Verificación y correcciones de RNF-MV-02, RNF-MV-03 y RNF-MV-04

Fecha: 3 de noviembre de 2026. Las pruebas que escriben inventario utilizan copias temporales de PostgreSQL y prefijos Redis independientes.

## Cierre de las pruebas solicitado por el usuario

Se detuvieron las campañas de rendimiento y se conserva la implementación funcional con API, Worker de admisión y Worker general. Las integraciones de reservas, permisos de sesión, subórdenes, liberación por percha y recuperación tras reinicios pasaron. No quedan bases ni contenedores temporales de esas pruebas.

La ejecución instrumentada del 4 de noviembre a las 00:02 UTC pasó los límites estrictos (máximo normal 94.8 ms; p95 de ráfagas 185.9 y 170.6 ms). La repetición ordinaria a las 01:43 UTC no fue estable: máximo normal 197.9 ms; p95 normal 136.5 ms, ráfaga escasa 561.4 ms y ráfaga con stock suficiente 219.2 ms. Ambas conservaron 128 pares físicos y 128 reservados, FIFO y ausencia de subórdenes de los rechazos. Se conservan ambos resultados en `/tmp/rnf-atomic-query-profile.json` y `/tmp/rnf-reservation-acceptance.json`. Por esta variación no se certifica RNF-MV-03; no se seguirán ejecutando pruebas por solicitud del usuario.

## Resultado

| Requisito | Resultado |
|---|---|
| RNF-MV-02: JSONB/GIN y consultas p95 ≤85 ms | Implementado. El benchmark interno obtuvo **18.9 ms** de p95, con GIN elegido por PostgreSQL. El alcance y volumen se detallan abajo; no es una certificación HTTP de producción. |
| RNF-MV-03: reserva ≤150 ms; ráfaga p95 ≤250 ms | **Sin certificación estable.** Una ejecución estricta pasó; la repetición ordinaria obtuvo máximo normal **197.9 ms** y p95 de ráfagas **561.4/219.2 ms**. Se detuvieron las pruebas por solicitud del usuario; la integridad pasa. |
| RNF-MV-04: persistencia de colas y recuperación | Verificado con reinicio real de Redis y un contenedor Vendure Worker: se conserva el vencimiento y hay una sola liberación y un solo asiento compensatorio. |

## Catálogo: cambios y evidencia

- Nueva columna opcional de horma, validada hasta 100 caracteres. No se inventaron hormas para productos existentes.
- Proyección `footwear_catalog_attribute` con un documento JSONB por variante e índice `footwear_catalog_attributes_gin`, `USING gin(attributes jsonb_path_ops)`.
- Los disparadores de la migración sincronizan colores, materiales, horma, opciones, nombres, vínculos y bajas de opciones dentro de la transacción de origen. Un rollback también revierte la proyección.
- Las listas de materiales de Vendure se leen como JSON guardado en texto. La oferta general del modelo no se mezcla para inventar combinaciones de variantes; un material único del modelo sirve como alternativa cuando la variante no especifica otro.
- `SearchInput.footwear` admite talla, color, capellada, suela y horma. Utiliza contención `@>`, pertenencia vigente al canal, habilitación y bajas de producto/variante. Conserva texto, facetas, colecciones, precios y agrupación. Sin atributos se delega a la estrategia nativa.
- Página, total, facetas y colecciones se reúnen en una consulta con CTE. El resultado se reutiliza mediante `RequestContextCacheService` para la misma entrada y petición; no se comparte entre contextos/canales ni entre peticiones.
- El storefront ofrece los filtros en búsqueda y colecciones, conserva sus parámetros y reinicia la página al cambiarlos.

La integración comprueba coincidencia en una misma variante, canales distintos, normalización de acentos, cambios de opciones, baja de producto/opción, retirada de publicación, rollback, paginación, facetas AND/OR, colecciones y una sola consulta para resultados/metadatos de una búsqueda.

La prueba de volumen carga 20000 variantes reales generadas de un mismo producto, con sus opciones y colores, además de las pruebas funcionales. La selección combinada coincide con aproximadamente el 1% de las variantes. El lote calcula una vez la proyección desde las fuentes; los disparadores se verifican antes y se reactivan antes de medir. Se actualizan estadísticas y se ejecuta VACUUM/ANALYZE después de la carga, sin cambiar `enable_seqscan` ni forzar índices.

`EXPLAIN (ANALYZE, BUFFERS)` eligió **Bitmap Index Scan sobre footwear_catalog_attributes_gin**. Se realizaron 10 calentamientos y 100 búsquedas con objetos de entrada nuevos: p50 **13.9 ms**, p95 **18.9 ms**, máximo **24.0 ms**. Se midieron resultados, total, facetas y colecciones de la estrategia real; se excluyen HTTP y resolución posterior de entidades de facetas/colecciones. La distribución de un solo producto no representa todos los catálogos ni una carga sostenida de producción. En la base pequeña actual PostgreSQL puede preferir un recorrido secuencial; la evidencia GIN corresponde al volumen de prueba indicado.

La migración `FootwearCatalogIndex1791776600000` está aplicada en la base local. La Shop API se comprobó con atributos combinados y devolvió un producto publicado del catálogo actual. La persistencia de las hormas nuevas depende de los datos que introduzca cada almacén.

## Reservas: admisión y preparación

Se separaron dos fases con estado persistido. La admisión FIFO procesa lotes de hasta 100 carritos, valida sesión, canal, publicación y propietario único de las variantes, y bloquea las variantes y filas de `stock_level` antes de comprobar saldos. Cada carrito se acepta completo o se rechaza sin consumir saldo parcial. Las asignaciones nativas, los contadores, el actor del kardex y la retención `marketplace_checkout_hold` se escriben en la misma transacción. El saldo sigue siendo PostgreSQL.

Las asignaciones, notas de auditoría y actualización de contadores del lote se reúnen en una sentencia SQL con CTE. Se comprueba el número de saldos actualizados y cualquier inconsistencia revierte toda la transacción. Se conservan las restricciones y los disparadores de la base. Después se publican los eventos nativos por canal, con el contexto transaccional. Redis utiliza el agrupamiento automático de comandos de ioredis; los scripts atómicos de BullMQ se conservan.

La respuesta `stockConfirmed` se comunica después del commit, antes de iniciar la preparación. `preparing` indica que los pares están retenidos, pero el pago sigue bloqueado. La preparación usa `OrderService` y `OrderSplitter` nativos para validar precios, promociones, envío y suma de subórdenes. Transfiere las asignaciones a las líneas de cada vendedor mediante RELEASE y ALLOCATION inmutables con las mismas perchas y cantidades. Los contadores permanecen reservados durante ese cambio de pertenencia. Esta fase conserva el bloqueo de la orden y no toma un bloqueo de stock que no modifica.

La huella persistida detecta cambios del carrito de consumidores internos; las mutaciones públicas de edición y pago se bloquean mientras se prepara. Un fallo o vencimiento cancela la retención y libera exactamente las unidades de cada percha. El contexto serializado se elimina de la retención al terminar. La tabla de retenciones no sustituye ni permite editar el kardex.

El Worker `admission` procesa únicamente stock. El Worker `general` prepara subórdenes, vence reservas, genera archivos y ejecuta trabajos nativos. Preparación y trabajos nativos usan concurrencia uno para contener la competencia por recursos; las colas siguen siendo independientes. Compose define ambos perfiles; el modo `all` mantiene el inicio de desarrollo. La migración `AddCheckoutStockHolds1791776700000` se aplicó localmente y la API y ambos Workers quedaron activos. Se comprobó un consumidor de cada cola personalizada y la respuesta de la Shop API pública.

La espera de stock usa eventos por trabajo y un timeout acotado; retira sus suscripciones al recibir una decisión, fallo o timeout. `marketplaceCheckoutJob(wait: true)` valida primero la sesión y permite esperar a la preparación. El storefront distingue reserva confirmada y preparación, y comprueba que el trabajo corresponde al carrito activo antes del pago. El backend conserva la validación final de propiedad y vencimiento.

La API agrupa las solicitudes recibidas en el mismo turno mediante `FlowProducer.addBulk`, con un máximo de 100 nodos sin dependencias en la misma cola. Su MULTI/EXEC evita que el Worker vea una parte del lote mientras termina de entrar el resto; se conservan opciones de retención y orden de envío. El productor comparte la conexión del cliente de checkout. Usa el identificador de carrito de la sesión autenticada y deja la validación completa al Worker bajo bloqueo. Se suscribe antes del envío con un UUID; al recibir la decisión comprometida responde sin repetir lecturas de Redis/PostgreSQL. Los fallos de envío rechazan el lote y permiten otro intento. El contexto de la cola y la retención excluye las cabeceras HTTP. Los identificadores de checkout y su argumento GraphQL son `String`, para evitar la conversión de UUID mediante el codificador numérico de entidades de Vendure; API y consultas del storefront deben desplegarse juntas.

La decisión se guarda y publica con una sola actualización de progreso de BullMQ. Se eliminó la copia duplicada del contexto y la decisión en `job.data`; el lector mantiene compatibilidad con los trabajos anteriores. La programación de preparación y TTL ya no retiene el turno FIFO: se espera al cerrar el Worker y, si se interrumpe, se reconstruye desde la retención. Las pruebas de recuperación esperan la programación asíncrona antes de simular su pérdida.

El benchmark usa la operación real `ReservationService.enqueue`, con API productora y dos Workers compilados en tres procesos distintos, como el despliegue configurado. Usa sesiones anónimas nativas: 5 calentamientos, 20 reservas normales, una ráfaga de 100 carritos sobre los últimos 3 pares y otra de 100 con stock suficiente. Los carritos se preparan antes de medir. El intervalo incluye la espera del lote en la API, Redis, espera FIFO y transacción PostgreSQL, hasta recibir la decisión persistida y comprometida. Excluye HTTP, autenticación, preparación del carrito y preparación posterior de subórdenes, cuya terminación y precios se verifican por separado. Por tanto, es un límite inferior de la latencia HTTP y no una certificación del tiempo hasta pagar.

Las mediciones anteriores con la preparación dentro de la transacción de confirmación obtuvieron p95 normal 573.6 ms y de ráfaga 1951.6 ms. No constituyen una comparación controlada: cambiaron el actor de prueba, la ruta crítica y la carga compartida del equipo. La medición estricta conserva los fallos; no toma el acuse Redis como confirmación.

### Medición intermedia: 3 de noviembre, 23:23 UTC

| Medida p95 | Normal, 20 | Ráfaga 100, últimos 3 pares | Ráfaga 100, stock suficiente |
|---|---:|---:|---:|
| Encolado | 28.8 ms | 121.2 ms | 122.1 ms |
| Espera FIFO | 41.0 ms | 175.0 ms | 105.0 ms |
| Admisión y commit | 96.0 ms | 106.0 ms | 200.0 ms |
| Total interno | **170.3 ms** | **395.0 ms** | **535.0 ms** |

Los percentiles de componentes se calculan por separado y no deben sumarse. El máximo normal fue **243.8 ms**, frente al límite de 150 ms. Las 20 reservas normales y las 100 de la ráfaga con existencias se confirmaron. La ráfaga escasa confirmó 3 y rechazó 97 con `INSUFFICIENT_STOCK`. Después de verificar también la preparación de las subórdenes, el saldo final fue **128 físicos y 128 asignados**, sin reservas ni subórdenes de los rechazos. Se usa percentil por rango más próximo.

El equipo tiene 4 CPU; la carga media al terminar fue **[9.51, 7.48, 8.67]**. La prueba no tuvo otra compilación ni suite de pruebas ejecutándose, pero comparte máquina con las aplicaciones y servicios del usuario. Este resultado no demuestra que la infraestructura sea la única causa ni permite atribuir una mejora controlada. El usuario eligió continuar la optimización en este mismo equipo. Se mantiene la prueba estricta y el perfilado por fases; para acreditar el objetivo de despliegue también falta una campaña reproducible que incluya HTTP.

Las ejecuciones previas con productor y admisión compartiendo proceso también fallaron y se conservan en `/tmp/rnf-hold-optimized.json` y `/tmp/rnf-hold-verified.json`. Esa distribución interfería con el proceso que se pretendía aislar. La primera ejecución con tres procesos (`/tmp/rnf-reservation-three-processes.json`) y la ejecución inicial con ingreso por lotes (`/tmp/rnf-batched-performance.json`) también fallaron. No se certifica el objetivo mediante la mejor muestra de esas ejecuciones. La cola revisa también las solicitudes pendientes situadas detrás de trabajos ya decididos, conservando FIFO de decisiones sin esperar al cierre administrativo de cada trabajo en Redis.

## Durabilidad

Redis respondió `appendonly=yes`, `appendfsync=everysec` y `maxmemory-policy=noeviction`, con volumen persistente. La prueba aislada registra 2700000 ms, detiene abruptamente el Worker, reinicia Redis y vuelve a iniciar el mismo contenedor. El temporizador conserva su vencimiento; al adelantar únicamente el vencimiento de prueba, se libera la reserva y se registra una sola compensación, incluso ante reintento. API en America/Guayaquil y Worker en UTC conservan el mismo instante mediante `timestamptz`.

La prueba cubre ahora tanto una suborden preparada como una retención cuya preparación está pausada. Ambas sobreviven al reinicio con el vencimiento original; cada una libera stock una sola vez. El reconciliador también reconstruye trabajos de preparación y TTL ausentes entre el commit PostgreSQL y el encolado, sin reiniciar el plazo. Un cambio de carrito detectado durante la preparación, una expiración y un rechazo de comprobante se verificaron con pares distribuidos entre dos perchas.

La repetición pasó también el bloqueo del pago manual nativo, la aprobación del comprobante y el descuento físico único al despachar. Los contenedores, red, volumen, base y credenciales de prueba se retiraron. AOF cada segundo no garantiza cero pérdida ante corte eléctrico; no se probó fallo físico de disco y no se esperaron 45 minutos reales.

## Validación y reproducción

- 75 pruebas del backend aprobadas en la suite completa anterior y 12 pruebas específicas aprobadas después del cambio de progreso y programación asíncrona (77 casos en conjunto). Integración HTTP, marketplace y recuperación de Redis/Worker repetidas y aprobadas.
- Integración del catálogo y 2 nuevas pruebas de parámetros de búsqueda aprobadas. Control de actualización del storefront aprobado.
- Tipos de backend y storefront comprobados. Compilación backend/dashboard/Worker y compilación de producción Webpack del storefront aprobadas.
- El build raíz con Turbopack sigue fallando por `Operation not permitted` al crear un proceso/enlazar un puerto en este entorno. Webpack genera las 60 páginas correctamente con la API en ejecución.
- La suite completa del storefront conserva 2 fallos de arquitectura anteriores y pasa 25 pruebas: la ruta seller-registration tiene comportamiento y el registro ESLint omite la funcionalidad seller. Lint: 0 errores y 9 advertencias previas.

Desde la raíz, con PostgreSQL/Redis locales en ejecución:

```sh
npm run build:worker -w server
npm run test:catalog-search -w server
CATALOG_FUNCTIONAL_ONLY=1 node apps/server/test/run-isolated.cjs catalog-search.integration.ts
npm run test:reservation-performance -w server
npm run test:checkout-stock -w server
```

El comando de rendimiento exige ≤150 ms en todas las muestras normales y p95 ≤250 ms en ambas ráfagas; **actualmente falla por latencia**, aunque la integridad pasa. Requiere el Worker recién compilado. El ejecutor exige entorno dev, crea una copia temporal y limpia su base y claves Redis al terminar, incluso si falla la prueba. Los resultados brutos están en `/tmp/rnf-catalog-combined.json` (catálogo, verificación anterior) y `/tmp/rnf-worker-cap-performance.json` (última ejecución estricta de reservas). `PROFILE_RESERVATIONS=1` añade fases de escaneo, transacción, notificación y programación mediante `node:diagnostics_channel`, sin registrar identificadores ni credenciales.

Los flujos de rechazo, vencimiento y cancelación del agregado liberan explícitamente las cantidades de cada percha antes de la cancelación nativa. Esta validación no certifica las cancelaciones parciales de la API nativa fuera de los flujos de Bodega, ni sustituye la integración requerida antes de actualizar Vendure.

Código y contratos: [catálogo](../apps/server/src/plugins/footwear-catalog/services/catalog-attribute.ts), [migración](../apps/server/src/migrations/1791776600000-footwear-catalog-index.ts), [reservas](../apps/server/src/plugins/marketplace/reservation.service.ts), [OpenSpec catálogo](../openspec/specs/footwear-catalog/spec.md), [OpenSpec marketplace](../openspec/specs/marketplace-jobs/spec.md).
