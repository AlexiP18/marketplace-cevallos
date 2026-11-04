# Precios de calzado

## Purpose
Definir la configuración y el cálculo de precios por características del modelo y su variante.

## Requirements

### Requirement: Precio base y ajustes
El producto SHALL admitir precio base, ajustes por rango de talla, capellada y suela, varios extras y un margen de ganancia.

#### Scenario: Configuración de una familia de precios
- **GIVEN** un producto con rangos y materiales seleccionados
- **WHEN** el administrador establece precio base, ajustes y extras
- **THEN** las opciones elegidas participan en las estimaciones y en el precio de cada variante creada

### Requirement: Cálculo por configuración
El precio de una variante SHALL ser el precio base más el ajuste de su rango, su capellada, su suela y la suma de todos los extras, con el margen de ganancia aplicado al resultado y redondeo a la unidad menor de moneda.

#### Scenario: Variante con ajustes
- **GIVEN** un precio base de 1000 centavos, ajustes de 100, 200 y 300 centavos, extras por 100 centavos y margen del 10 %
- **WHEN** se calcula el precio de esa configuración
- **THEN** el precio resultante es 1870 centavos

### Requirement: Variaciones por material y talla
Un ajuste SHALL corresponder a una opción seleccionada en el producto; los extras SHALL sumarse una sola vez por configuración.

#### Scenario: Comparación de dos suelas
- **GIVEN** dos suelas con ajustes distintos y el mismo resto de características
- **WHEN** se consultan sus precios estimados
- **THEN** cada configuración refleja únicamente el ajuste de la suela que le corresponde

### Requirement: Vista general de estimaciones
La vista general SHALL ofrecer tablas de precios con capellada o suela como columnas y los demás factores como dimensiones de cálculo.

#### Scenario: Cambio de columnas
- **GIVEN** un producto con varias capelladas y suelas
- **WHEN** el administrador alterna entre «Columnas: capellada» y «Columnas: suela»
- **THEN** la tabla reorganiza los precios estimados sin cambiar los importes de cada configuración

### Requirement: Vista específica de estimaciones
La vista específica SHALL permitir consultar los precios por pestañas de rango de talla, capellada y suela.

#### Scenario: Consulta de una configuración
- **GIVEN** un producto con varias opciones seleccionadas
- **WHEN** el administrador elige un rango, una capellada y una suela
- **THEN** ve el precio estimado para esa combinación
