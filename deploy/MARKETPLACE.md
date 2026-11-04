# Redis/BullMQ y operaciones multivendedor

## Inicio local

1. `docker compose -f apps/server/docker-compose.yml up -d postgres_db redis`
2. `npm run dev` inicia API, Worker, dashboard y storefront. Para iniciar solo el backend completo: `npm run dev:server`.
3. Redis local escucha solo en `127.0.0.1:6479`, con AOF y `noeviction`. Configurar `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` y `REDIS_PREFIX` en el `.env` del servidor. Producción exige contraseña. API, Worker y réplicas de un entorno deben compartir el mismo prefijo; entornos distintos deben usar prefijos distintos.

La cola SQL de Vendure se sustituyó por BullMQ. Antes del cambio se verificó que los registros SQL existentes estaban COMPLETED, sin trabajos pendientes que migrar. El Worker sigue procesando correo, indexación y mantenimiento de Vendure, además de las colas de marketplace.

## Contenedores de aplicación

Desde la raíz, `docker compose -f apps/server/docker-compose.yml --profile application up -d --build api worker reservation_worker` inicia API, Worker general y Worker de admisión separados. Este perfil es opcional: sin `--profile application` se mantienen los servicios de apoyo del desarrollo local. Antes de usarlo, detener la API local que utilice el puerto 3000 y el Worker local, configurar `apps/server/.env` y crear `apps/server/static/assets` y `apps/server/static/private-jobs` con permisos para UID 1000 (usuario Node del contenedor).

Los servicios comparten activos y archivos privados. Los Workers esperan a que la API aplique las migraciones y responda al healthcheck. La imagen se construye desde la raíz del monorepo e incluye Canvas, sus bibliotecas nativas y fuentes DejaVu/Liberation. El override de Canvas mantiene Fabric/jsdom en la misma versión 3 del workspace. En producción se mantienen los requisitos de HTTPS, JWT, CORS y contraseña Redis; el Compose de desarrollo no sustituye esa configuración.

`MARKETPLACE_WORKER_ROLE` admite `all` (desarrollo, valor por defecto), `admission` (solo reserva de inventario) y `general` (preparación, vencimientos, archivos y trabajos nativos). Sin contenedores, ejecutar `npm run start:reservation-worker -w server` y `npm run start:general-worker -w server`, además de la API. No iniciar otro Worker con `all` junto a esos dos: también consumiría ambas colas y perdería el aislamiento de procesos. La admisión conserva concurrencia global uno incluso si se inician varias réplicas. Compartir prefijo Redis, base PostgreSQL y `PRIVATE_JOB_FILES_PATH`; esta última es opcional y conserva la ruta anterior por defecto.

## Flujos

- El storefront confirma el carrito mediante `reserveMarketplaceCheckout` y consulta `marketplaceCheckoutJob`. Una cola global de concurrencia uno admite lotes FIFO de hasta 100 carritos: valida propiedad y disponibilidad, asigna pares y registra retención y kardex dentro de una transacción. `stockConfirmed` se comunica después del commit, sin esperar precios y subórdenes. Los rechazos no consumen stock parcial.
- Las reservas, recepciones, traslados, ajustes y salidas de bodega comparten un bloqueo transaccional por variante. Después, la reserva bloquea las filas de `stock_level` con `FOR UPDATE`; así una lectura de bodega anterior a la reserva no puede aprobar un ajuste que deje menos pares físicos que reservados.
- La cola de preparación utiliza la transición de pago y el `OrderSplitter` nativos de Vendure 3.7.3. Revalida precios/promociones y mueve las asignaciones del carrito a sus subórdenes conservando perchas y saldos, mediante RELEASE y ALLOCATION inmutables. Esa integración depende de una API interna de la versión instalada; una actualización de Vendure debe ejecutar las pruebas de integración antes de desplegarse.
- Cada variante tiene un propietario. Su precio se refleja en el canal público; no se sincronizan precios entre variantes distintas. El envío compartido se registra una sola vez en la primera suborden, conservando el importe y los descuentos de envío confirmados en el carrito. La suma de importes se valida durante la preparación, antes de habilitar el pago. Un fallo compensa exactamente los pares retenidos.
- Cada suborden tiene su vencimiento en PostgreSQL y un trabajo BullMQ diferido. RESERVATION_TTL_MINUTES permite configurar de 1 a 1440 minutos, con 45 por defecto; las reservas existentes conservan su plazo original. Un pago global habilita las subórdenes mediante apuntes de pago manual que representan distribución contable, sin invocar otra vez la pasarela. Un pago individual no paga ni cancela los demás talleres.
- Si Redis o el Worker están detenidos, la fecha de vencimiento sigue protegiendo la aprobación de pagos. La liberación automática se ejecutará cuando el Worker se recupere; el reconciliador revisa pendientes cada minuto y recupera trabajos fallidos o ausentes. No existe garantía de ejecución en el segundo exacto si el Worker está fuera de servicio.
- Antes de invocar una pasarela se valida el plazo manteniendo bloqueadas las órdenes en la transacción. Esa validación se conserva durante la captura y su reparto contable, para no rechazar localmente un cobro cuya respuesta llegó después del límite. Una nueva transacción fuera del plazo se rechaza.
- El estado `preparing` impide editar el carrito y pagar. La huella persistida detecta cambios de consumidores internos y cancela la retención si las líneas difieren. `completed` habilita el siguiente paso; el servidor verifica que el trabajo corresponde al carrito del comprador. Un carrito preparado tampoco puede volver a edición. Al finalizar o expirar las subórdenes deja de bloquear el carrito activo.
- Los 45 minutos comienzan al comprometer la retención y no se reinician al preparar las subórdenes ni recuperar trabajos. El reconciliador reconstruye los trabajos perdidos entre el commit y Redis. El contexto serializado se elimina de la retención al terminar; no se modifica el historial inmutable de inventario.

## PDF y Excel

La vista previa de Etiquetas solicita el trabajo al Worker y descarga el PDF terminado. Se conserva el lienzo, incluyendo imágenes y bordes. PDFKit arma las hojas en milímetros y bwip-js genera Code128 y QR sin texto inferior. Node Canvas requiere sus binarios y las fuentes del diseño instaladas en el entorno Worker. Canvas se declara también en la raíz del workspace para que Fabric/jsdom lo resuelvan correctamente en Node.

El storefront declara `isomorphic-dompurify` en [`serverExternalPackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages), para que Next cargue sus dependencias nativas desde Node y no intente empaquetar el binario de Canvas.

Cada par recibe ahora un QR `SBX1:<uuid>` registrado en PostgreSQL y vinculado internamente a variante y canal, sin publicar sus IDs. Las dos copias de un par comparten código. El lote solo se habilita para escaneo al terminar el PDF y los reintentos conservan los códigos del lote. Las etiquetas antiguas `PV:...` deben regenerarse; no se borran los escaneos históricos. El lienzo muestra un QR de ejemplo no válido para alistamiento.

La migración de trazabilidad conserva los SKU actuales y agrega restricciones de formato, unicidad global e inmutabilidad. Los SKU nuevos se generan en el backend. No se reutilizan los SKU de variantes dadas de baja. El QR usa nivel M explícito y zona silenciosa blanca de cuatro módulos. El lector móvil incorpora jsQR como alternativa gratuita a BarcodeDetector y requiere HTTPS o localhost.

Estadísticas incorpora «Descargar Excel del período», con hojas Ventas, Inventario y Rotacion. El Excel usa el período completo, sin los filtros locales de una pestaña. El superadministrador conserva exclusivamente datos agregados. SheetJS ensambla bloques de 500 filas en el Worker: el archivo no se escribe progresivamente desde la API ni utiliza memoria constante; se limita a 100000 filas por hoja para acotar su consumo.

Los archivos se conservan 24 horas en `apps/server/static/private-jobs`, ignorado por Git y fuera de `/assets`. En contenedores separados, montar el mismo volumen privado en API y Worker. La descarga `/admin-api/marketplace-files/:id` exige JWT, canal y usuario creador, y transmite el archivo como stream.

## Organización de los ejecutores

`MarketplaceFileService` administra la cola y la descarga privada; `LabelPdfService` en etiquetas genera los PDF y `StatisticsExportService` en estadísticas genera los Excel. Las opciones de los tres plugins comparten la misma ruta privada desde `vendure-config.ts`, mediante sus tokens de inyección. Se conservan las colas y mensajes existentes.

El catálogo de calzado pertenece a `FootwearCatalogPlugin`. Multivendedor publica un evento bloqueante de cambio de estado del vendedor para que el catálogo ajuste su publicación dentro del contexto correspondiente. Los límites y controles están en [la guía de arquitectura](../docs/architecture.md).

## Comprobación

El build backend ejecuta `test:architecture` antes de compilar. También puede ejecutarse desde la raíz con `npm run test:architecture --workspace=apps/server`.

La prueba `apps/server/test/marketplace.integration.ts` exige una copia temporal de la base cuyo nombre cumpla `vendure_mq_test_<número>` y un `REDIS_PREFIX` que empiece por `mq-test-`. Nunca debe ejecutarse sobre la base principal. Con esas variables, desde `apps/server`: `npx ts-node -T test/marketplace.integration.ts`.

Comprueba FIFO sobre el último par, rechazo por insuficiencia, liberación al vencer, pago fuera de plazo, división de un carrito, independencia de pago, pago global y generación de PDF/Excel en la cola. El entorno de prueba debe contar con variantes activas de dos vendedores y un método de envío, como la copia del entorno local.

Después de compilar (`npm run build:worker -w server`), `npm run test:checkout-stock -w server` usa la Shop API HTTP con sesiones anónimas reales y otro proceso Worker. Comprueba stock confirmado, aislamiento de sesiones, bloqueo de edición/pago, huella cambiada, liberación exacta en dos perchas, preparación nativa y recuperación de trabajos sin extender TTL. `npm run test:reservation-performance -w server` usa API y dos Workers compilados en procesos separados y mide admisión real, con 20 solicitudes normales y dos ráfagas de 100 (stock escaso y suficiente). Falla si una reserva normal supera 150 ms o un p95 de ráfaga supera 250 ms. El alcance y las mediciones están en [el informe de verificación](../docs/verification-performance-durability.md).

También comprueba 24 etiquetas para 12 pares, decodifica los QR generados por el Worker con jsQR, verifica emisiones únicas y habilitadas, reintentos idempotentes, rechazo de códigos anteriores/no emitidos/de otro canal y dos escaneos concurrentes del mismo par. Crea variantes concurrentemente con SKU provisional o vacío y comprueba el SKU final, su inmutabilidad y la restricción única de PostgreSQL.

Las pruebas unitarias específicas se ejecutan desde `apps/server` con `node --test test/label-traceability.test.cjs test/warehouse-dispatch.test.cjs test/warehouse-operations.test.cjs test/label-business-logo.test.cjs`. Las pruebas de cámara física, legibilidad sobre etiquetas dañadas e impresora térmica requieren dispositivos reales.

## Reservas y regularización de bodega

El contador de checkout, pedidos y Bodega usa Order.marketplaceReservations con propiedad/canal verificados en el servidor. El pago validado compromete los pares y retira el temporizador; la salida física y el asiento SALE se registran una sola vez al despachar. La mutación nativa de pago manual se bloquea por API; los comprobantes se revisan desde Bodega. Las pasarelas conservan su flujo y su distribución contable interna.

Solo el stock en perchas activas se publica y reserva. Para stock anterior, el administrador puede crear una percha seleccionando su ubicación existente: conserva también las reservas de esa ubicación. Se rechazan ubicaciones con otros canales vendedores o existencias ajenas. Una línea antigua sin percha aparece con aviso y no puede despacharse por una vía nativa.

Después de compilar el backend, ejecutar desde apps/server `npx ts-node -T test/reservation-recovery.integration.ts`. Requiere Docker, la base local y la imagen vendure-prueba-server (WORKER_TEST_IMAGE permite elegir otra imagen compatible). Monta el dist recién compilado en un contenedor Worker aislado y crea una copia de PostgreSQL, Redis, red y volumen temporales. No reinicia servicios del entorno en uso. Verifica recuperación de una reserva real, liberación/kardex únicos y pago, QR y despacho sin doble descuento; adelanta únicamente el vencimiento de prueba después de comprobar el plazo de 45 minutos.

La migración ReservationDeadlineTimezone convierte los vencimientos antiguos sin zona horaria desde America/Guayaquil, correspondiente al despliegue local anterior, a timestamptz. API y Worker pueden utilizar zonas distintas después de esa conversión. Para actualizar una instalación antigua cuyos vencimientos se escribieron en otra zona, revisar esa conversión antes de aplicar la migración.
