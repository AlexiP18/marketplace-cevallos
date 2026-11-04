# Arquitectura modular y mantenibilidad — RNF-08

Esta guía aplica al backend Vendure, al dashboard, al storefront Next.js y al Worker. Define cómo evolucionar el sistema; no certifica que todo el código existente ya cumpla el requisito. El contrato verificable está en [OpenSpec](../openspec/specs/modular-architecture/spec.md).

## Propiedad de los dominios

El proyecto conserva un monorepo y un backend modular. Un módulo independiente tiene una responsabilidad y contratos definidos; no necesita un proceso, contenedor o base de datos propios.

| Módulo actual | Responsabilidad |
|---|---|
| `multivendor` | Vendedores, canales, usuarios y roles del almacén, instituciones financieras y perfiles personales. |
| `footwear-catalog` | Campos y validaciones de calzado, editores del catálogo, SKU y publicación según el estado del vendedor. |
| `labeling` | Plantillas, diseño compartido, identidades de etiquetas y ejecución de PDF en el Worker. |
| `warehouse` | Perchas, movimientos físicos, kardex, alistamiento, comprobantes y despacho. |
| `marketplace` | Coordinación de reservas, subórdenes, vencimientos y cola/descarga privada de archivos. |
| `statistics` | Consultas estadísticas y ejecución de Excel según el alcance autorizado. |
| `security` | Sesiones, JWT y protección del transporte de las API. |
| `payments` | Adaptadores de PayPal, PayPhone y otros proveedores de pago. |
| Storefront | Funcionalidades de compra organizadas en `features`, con transporte e infraestructura en `platform`. |

Las dependencias del negocio son explícitas: bodega consulta las emisiones de etiquetas y marketplace coordina catálogo, pedidos e inventario. Independencia no significa ausencia de integración, sino poder cambiar la implementación interna sin obligar a modificar consumidores que usan el mismo contrato.

## Separación de responsabilidades

| Capa | Responsabilidad | Límite |
|---|---|---|
| API: resolvers/controladores | Interpretar entradas, exigir autorización, invocar casos de uso y representar respuestas. | No implementar cálculos de precio, movimientos de stock ni SQL de negocio. |
| Servicios del dominio | Reglas de negocio, validación autoritativa, coordinación y límites transaccionales. | No depender de React, navegación, componentes o estado del navegador. |
| Entidades y migraciones | Relaciones, tipos persistentes, claves, restricciones y evolución compatible del esquema. | No contener decisiones de presentación. |
| Acceso a datos | Servicios nativos de Vendure y consultas/repositorios mediante `TransactionalConnection`. | Conservar `RequestContext`, aislamiento de canal y transacciones. |
| Dashboard y storefront | Formularios, interacción, validaciones de ayuda y vistas previas. | No decidir el saldo, autorización, precio cobrado o identidad definitiva aceptados por el servidor. |
| Worker | Recibir un trabajo, restaurar su contexto y ejecutar el servicio correspondiente. | No duplicar reglas existentes ni omitir validaciones por tratarse de un proceso interno. |

No es obligatorio crear una clase repositorio por entidad ni interfaces para cada servicio. Una consulta propia puede vivir en el servicio de su dominio; se extrae cuando hay una necesidad real de reutilización, complejidad o sustitución.

## Integración y configuración

- El archivo de registro de un plugin declara entidades, proveedores, API, dependencias y configuración. Las reglas de negocio pertenecen a servicios o funciones del dominio.
- Las variables de entorno se leen en `vendure-config.ts` y se pasan mediante `Plugin.init()`. Los servicios reciben opciones por un token de inyección; no importan su clase de registro para consultar opciones estáticas.
- Entre dominios se usan servicios exportados, contratos pequeños o eventos existentes. No se introduce un evento cuando una llamada transaccional directa es necesaria para mantener la integridad.
- Una operación de escritura usa el servicio propietario de las invariantes. El SQL de reportes que cruza dominios es una excepción explícita de lectura: debe tener alcance por canal, no tomar bloqueos de escritura y contar con validación de aislamiento.
- Los bloqueos compartidos de inventario, estados de pedido y formatos de mensajes son contratos: modificarlos exige revisar todos sus productores y consumidores.
- Las colas tienen datos serializables y estables, contexto de canal validado y comportamiento definido ante reintentos. No se envían instancias de componentes ni conexiones a base de datos.
- El código compartido de representación o cálculo no importa servicios Nest, credenciales ni persistencia. Las funciones específicas de navegador o Node se mantienen en su adaptador y no se ejecutan en la plataforma equivocada.
- El storefront conserva sus [límites ya documentados](../apps/storefront/docs/architecture.md): rutas delgadas, funcionalidades propietarias y acceso a otras funcionalidades mediante módulos públicos, no sus componentes internos.

## Comprobación de cada cambio

1. Identificar el dominio propietario y buscar las llamadas, operaciones GraphQL, trabajos y contratos afectados.
2. Mantener en el servidor las reglas que protegen dinero, permisos, identidad y existencias, aunque la interfaz también valide o calcule una vista previa.
3. Si cambia persistencia, añadir una migración compatible y verificar el efecto sobre datos e historial existentes. Si cambia un contrato, actualizar sus consumidores y documentar la compatibilidad.
4. Probar la regla modificada de forma aislada y las integraciones afectadas. Para canales, stock y pagos, incluir rechazo de operaciones no autorizadas y concurrencia cuando corresponda.
5. Ejecutar los controles del paquete afectado. Un cambio backend requiere el build y pruebas específicas; una modificación del storefront sigue además su guía de contribución. Un cambio solo documental no requiere compilar aplicaciones.
6. Registrar cualquier limitación comprobada, el motivo y cuándo resolverla; no atribuir cumplimiento completo a una reorganización de carpetas o a una compilación exitosa.

## Separación aplicada

- `FootwearCatalogPlugin` registra los campos personalizados y sus validaciones sin concentrarlos en `vendure-config.ts`. Sus editores y suscriptores de SKU pertenecen al mismo dominio. Se conservan nombres de campos, componentes, tablas y restricciones existentes; esta separación no requiere una migración.
- Los filtros del catálogo usan `CatalogAttribute` y un adaptador de `SearchStrategy`. La migración de `footwear_catalog_attribute` administra su proyección de lectura y sus disparadores SQL, sin convertirla en otra fuente editable de atributos. Los disparadores conservan sincronización y rollback con las entidades nativas; el GIN cubre contención JSONB. Las consultas cruzan índice de búsqueda, producto, variante y pertenencia al canal únicamente en lectura. El adaptador depende de los auxiliares de la versión instalada de DefaultSearchPlugin: una actualización de Vendure requiere repetir la integración de filtros y planes.
- Una búsqueda filtrada reúne página, total, facetas y colecciones en una consulta con CTE. `RequestContextCacheService` conserva ese resultado para el mismo objeto de entrada y contexto de petición; no existe caché de catálogo entre peticiones ni entre canales. Las entradas diferentes o modificadas utilizan claves diferentes. Esto evita repetir cuatro veces el mismo recorrido GIN y sus uniones.
- `SellerProfileService` publica `SellerProfileStatusChangedEvent`. El catálogo lo procesa con un manejador bloqueante y conserva el contexto transaccional al suspender o restaurar la publicación. Multivendedor no importa marketplace ni el servicio de publicación.
- `MarketplaceFileService` conserva cola, reintentos, propiedad del trabajo y descarga privada. Delega PDF a `LabelPdfService` exportado por etiquetas y Excel a `StatisticsExportService` exportado por estadísticas. Se conservan mensajes de BullMQ, rutas y formato de archivos existentes.
- Reservas, archivos, etiquetas, estadísticas y JWT reciben opciones mediante tokens de inyección. Las clases de registro solo suministran esas opciones; los servicios pueden importarse y probarse sin depender de ellas. JWT separa firma/sesión de middleware HTTP y adaptación GraphQL, con estado de ejecución por instancia.
- Los resolvers delegan acceso persistente y reglas a servicios. La auditoría de movimientos se registra en `WarehouseStockSubscriber`, dejando el plugin de bodega a cargo del registro y configuración.
- `CheckoutStockService` valida sesión, canal y carrito y persiste retenciones de checkout. Usa `WarehouseReservation`, exportado por Bodega, para asignar, transferir y liberar pares bajo los bloqueos compartidos del inventario. Las consultas por lote cruzan órdenes, variantes, canales y vendedores para validar su propiedad; solo Bodega modifica saldos y asientos. El lote conserva el actor de cada solicitud aunque comparta transacción.
- `ReservationService` coordina admisión FIFO y preparación nativa en colas distintas. Confirma únicamente stock ya comprometido, mantiene bloqueado el carrito mientras se preparan precios/subórdenes y conserva el vencimiento original. La retención PostgreSQL permite reconstruir trabajos interrumpidos. Los perfiles `admission` y `general` aíslan sus procesos sin duplicar reglas de negocio; el modo `all` conserva el inicio de desarrollo.
- La API agrupa el ingreso por turno con `FlowProducer.addBulk`: son nodos sin dependencias que se publican con MULTI/EXEC en la misma cola. Se evita que el consumidor vea solo una parte del lote; se conserva el orden y se suscribe antes de encolar. El contexto del trabajo excluye HTTP y sus identificadores son cadenas opacas, ajenas al codificador de entidades. La decisión comprometida se almacena y comunica con el progreso JSON nativo de BullMQ; el lector admite también el formato anterior en `data.stockDecision`. La programación posterior de preparación y TTL tiene una cadena independiente, esperada al cerrar el Worker y recuperable mediante la retención PostgreSQL.

Las lecturas entre dominios son deliberadas: publicación consulta el estado del vendedor; etiquetas resuelve su logo mediante un producto autorizado en el canal; estadísticas cruza pedidos, canales y stock dentro de una transacción de solo lectura con cursor. Estas consultas no escriben las entidades ajenas ni reemplazan sus servicios de negocio.

## Controles automáticos y límites

`npm run test:architecture --workspace=apps/server` verifica importaciones relativas sin ciclos, ausencia de lecturas de estado estático del registro desde servicios, resolvers sin repositorios/SQL y separación entre backend, código compartido y componentes privados del dashboard. El build del backend ejecuta ese control antes de compilar dashboard, servidor y Worker.

Las pruebas de servicios y las integraciones `marketplace.integration.ts` y `security-session.integration.ts` verifican además reservas concurrentes, vencimiento, subórdenes, archivos, publicación del catálogo y sesiones JWT. Las pruebas que modifican inventario se ejecutan en una copia temporal de PostgreSQL y con un prefijo Redis aislado.

Los controles estáticos cubren importaciones explícitas de los plugins personalizados; no demuestran ausencia de todo acoplamiento semántico ni sustituyen las pruebas de integración. Se mantienen los límites operativos existentes documentados en [MARKETPLACE.md](../deploy/MARKETPLACE.md), incluido el máximo de filas de Excel y la integración con el divisor de pedidos de la versión instalada de Vendure. Una nueva actualización de esos contratos exige revisar sus consumidores.
