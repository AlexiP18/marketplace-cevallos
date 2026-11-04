# Mantenibilidad y arquitectura modular

## Purpose

Establecer RNF-08 como requisito transversal de evolución del backend, administrador, storefront y procesamiento en segundo plano. Estos requisitos son criterios de aceptación; su documentación no acredita por sí sola el cumplimiento de implementaciones existentes.

## Requirements

### Requirement: RNF-08 Responsabilidad por dominio
El sistema SHALL organizar sus capacidades en módulos de dominio con responsabilidad, dependencias y contratos identificables. Una nueva funcionalidad SHALL incorporarse al dominio propietario o justificar la creación de uno independiente.

#### Scenario: Ampliación de una capacidad
- **GIVEN** una capacidad que ya tiene un módulo propietario
- **WHEN** se incorpora una regla o un flujo adicional
- **THEN** el cambio se localiza en ese dominio y sus integraciones explícitas, sin distribuir reglas equivalentes entre módulos ajenos

### Requirement: Separación entre presentación, negocio y persistencia
El sistema SHALL separar transporte y presentación de las reglas de negocio y de la definición persistente de datos. El servidor SHALL validar las reglas autoritativas de autorización, precio cobrado, identidad y existencias, aunque las interfaces ofrezcan validaciones o vistas previas.

#### Scenario: Cambio de interfaz
- **WHEN** se sustituye una pantalla o un cliente de la API conservando su contrato
- **THEN** las mismas reglas de negocio siguen aplicándose sin copiar su implementación a la nueva presentación

#### Scenario: Entrada directa por API
- **WHEN** un cliente envía datos que el formulario normalmente impediría
- **THEN** el dominio vuelve a validar las invariantes antes de persistir cambios

### Requirement: Dependencias explícitas y bajo acoplamiento
Los módulos SHALL integrarse mediante servicios, contratos o eventos declarados, sin depender de detalles internos de presentación ni crear dependencias circulares nuevas. La configuración SHALL suministrarse de forma explícita a sus consumidores.

#### Scenario: Sustitución interna
- **GIVEN** un módulo que conserva el contrato utilizado por otros dominios
- **WHEN** se modifica su implementación interna
- **THEN** sus consumidores pueden mantener su implementación y sus pruebas de integración continúan verificando el mismo comportamiento

### Requirement: Evolución compatible de contratos y datos
Los cambios de contratos, mensajes de cola, esquema o reglas compartidas SHALL identificar y actualizar sus consumidores afectados. La evolución persistente SHALL realizarse con migraciones y conservar la integridad, el aislamiento por canal y la trazabilidad exigidos por las capacidades implicadas.

#### Scenario: Contrato con consumidores existentes
- **WHEN** un cambio altera una entrada, respuesta o mensaje utilizado por otro módulo
- **THEN** se actualizan los consumidores y pruebas afectados o se proporciona una transición compatible antes de desplegarlo

### Requirement: Verificación y deuda arquitectónica
Los cambios de reglas SHALL disponer de pruebas específicas y de las comprobaciones de integración que correspondan a sus dependencias. Los acoplamientos existentes SHALL documentarse con su impacto y condición de resolución; una compilación exitosa no SHALL sustituir esa verificación.

#### Scenario: Acoplamiento heredado
- **GIVEN** una capacidad existente que incumple un límite arquitectónico
- **WHEN** se planifica su modificación
- **THEN** se identifica la deuda, se delimita la corrección necesaria y se verifica que no cambie accidentalmente el comportamiento de los otros dominios


#### Scenario: Comprobación de límites durante el build
- **WHEN** se compila el backend
- **THEN** se ejecutan comprobaciones de ciclos de importación, acceso estático a opciones, persistencia directa en resolvers y dependencias entre backend y presentación
- **AND** una infracción detectada impide continuar el build

#### Scenario: Opciones aisladas de una instancia
- **GIVEN** un servicio construido con sus opciones inyectadas
- **WHEN** se registra otra configuración para un arranque posterior
- **THEN** el servicio existente conserva sus opciones y no consulta estado estático del registro durante las peticiones
