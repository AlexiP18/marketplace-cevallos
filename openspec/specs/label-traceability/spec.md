# Integridad de etiquetas, QR y SKU

## Requirements

### Requirement: RNF-06 Identificadores públicos emitidos
Cada par etiquetado SHALL recibir un código público `SBX1:<uuid-v4>`, registrado en `label_code` con restricción UNIQUE y claves foráneas a su variante y canal. El QR no SHALL incluir claves primarias internas. Las dos copias de un mismo par SHALL compartir código; los pares distintos SHALL tener códigos distintos.

#### Scenario: Reintento del Worker
- **WHEN** se procesa de nuevo el mismo lote y posición de par
- **THEN** se conserva el código ya emitido, sin duplicar su identidad

### Requirement: Validar la emisión antes del alistamiento
Una etiqueta SHALL habilitarse únicamente después de terminar correctamente su PDF. El escaneo SHALL exigir que su código esté habilitado, corresponda al canal y variante requeridos, y no haya sido usado. El registro de escaneo SHALL referenciar la emisión mediante clave foránea y restricción única.

#### Scenario: Código inventado o de otro almacén
- **WHEN** se escanea un UUID no emitido, un PDF incompleto o una etiqueta de otro canal
- **THEN** el alistamiento se rechaza sin incrementar pares escaneados

#### Scenario: Etiqueta anterior
- **WHEN** se escanea el formato anterior `PV:<id>:<uuid>`
- **THEN** se solicita regenerar la etiqueta; los escaneos históricos conservan su registro

### Requirement: SKU automático e inmutable
El backend SHALL generar los SKU nuevos con formato `PV-<32 caracteres hexadecimales en mayúsculas>`, independientemente del valor provisional enviado por el cliente. PostgreSQL SHALL imponer formato y unicidad global, incluyendo variantes dadas de baja, e impedir cambios del SKU existente. La migración SHALL conservar los SKU actuales y detenerse si encuentra duplicados o formatos inválidos.

### Requirement: Lectura y representación
El Worker SHALL establecer explícitamente nivel M para QR, fondo blanco y zona silenciosa mínima de cuatro módulos. Lienzo, detalle de variante y PDF SHALL representar Code128 sin texto inferior. El escalado de QR y barras no SHALL recortar sus módulos al exceder el área.

El dashboard SHALL ofrecer cámara con detector nativo cuando esté disponible y un decodificador JavaScript gratuito como alternativa. La cámara SHALL utilizar HTTPS o localhost y detenerse al cerrar el lector. Un lector físico SHALL poder ingresar el código por el mismo formulario.

### Requirement: RF-MV-05 Worker en contenedor
Docker Compose SHALL ofrecer API y Worker como servicios distintos, con Redis y volumen de archivos compartidos. El Worker SHALL esperar a que la API termine migraciones y responda a su comprobación de salud. El contenedor SHALL incluir las bibliotecas nativas y fuentes necesarias para renderizar etiquetas.
