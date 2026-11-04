# Catálogo de calzado

## Purpose
Especificar los datos del modelo de calzado que se administran en la ficha del producto.

## Requirements

### Requirement: RNF-MV-02 Filtros JSONB indexados
La búsqueda SHALL aceptar `SearchInput.footwear` con talla, color, capellada, suela y horma. Todos los atributos seleccionados SHALL coincidir en una misma variante activa y publicada en el canal actual. Los atributos SHALL persistirse en una proyección JSONB por variante, consultada mediante contención `@>` e índice GIN `jsonb_path_ops`. La horma SHALL ser un dato opcional del modelo, con máximo de 100 caracteres.

La proyección SHALL actualizarse en la misma transacción que los colores, materiales, opciones, nombres y vínculos de variante, incluidas bajas de opciones. Los materiales del modelo solo SHALL servir como alternativa cuando existe un único material y la variante no especifica otro. Los rangos de tallas y materiales ofrecidos por el modelo no SHALL inventar combinaciones inexistentes.

Los filtros SHALL conservar texto, facetas, colecciones, agrupación y precios de la búsqueda. El storefront SHALL ofrecer los filtros en búsqueda y colecciones y reiniciar la paginación al cambiarlos. Sin atributos seleccionados SHALL conservarse la estrategia nativa.

#### Scenario: Atributos de variantes diferentes
- **GIVEN** un modelo con talla 38 de cuero y talla 39 sintética
- **WHEN** el comprador filtra talla 39 y cuero
- **THEN** ese modelo no se devuelve por combinar atributos de variantes distintas

#### Scenario: Retirada de publicación
- **WHEN** una variante se deshabilita, se da de baja o se retira del canal
- **THEN** el filtro deja de mostrarla aunque la actualización del índice de texto aún esté pendiente

#### Scenario: Plan y latencia
- **GIVEN** un conjunto de variantes de volumen y selectividad documentados
- **WHEN** se ejecuta una consulta combinada
- **THEN** se verifica mediante EXPLAIN ANALYZE el uso efectivo de GIN, sin forzar el planificador, y se mide un p95 objetivo de 85 ms
- **AND** el informe identifica muestras, calentamiento, infraestructura y exclusiones; una medición SQL o interna no se presenta como latencia HTTP de producción

### Requirement: Código del modelo
El producto SHALL admitir un código de modelo independiente del SKU de sus variantes.

#### Scenario: Identificación de un modelo
- **GIVEN** un producto con código `HN-05`
- **WHEN** el administrador consulta su ficha y sus variantes
- **THEN** el código del modelo se conserva separado de los SKU de las variantes

### Requirement: Clasificación de calzado
El producto SHALL permitir elegir género, tipo y estilo; el tipo SHALL ofrecer Adulto, Teen, Niño e Infantil.

#### Scenario: Edición de la clasificación
- **GIVEN** un producto abierto en el administrador
- **WHEN** el administrador elige género, tipo y estilo
- **THEN** la ficha conserva esas elecciones para el producto

### Requirement: Materiales y rangos disponibles
El producto SHALL permitir seleccionar materiales de capellada y suela, y los rangos de tallas 21–26, 27–36 y 37–45 que se ofrecen para ese modelo.

#### Scenario: Restricción de oferta
- **GIVEN** un producto con un único rango y materiales seleccionados
- **WHEN** se preparan sus opciones de variante
- **THEN** se ofrecen solo las tallas y materiales seleccionados en ese producto

### Requirement: Combinaciones de color del producto
El producto SHALL permitir varias combinaciones de uno a tres colores; cada combinación requiere nombre y código del color primario, y los colores adicionales requieren nombre y código.

#### Scenario: Combinación de tres colores
- **GIVEN** una combinación con color primario y secundario completos
- **WHEN** el administrador añade un color terciario con nombre y código
- **THEN** la combinación queda disponible para variantes de ese producto

#### Scenario: Combinación incompleta
- **GIVEN** una combinación sin código primario o con un color adicional incompleto
- **WHEN** el administrador intenta guardar el producto
- **THEN** se rechaza la combinación y se indica qué dato falta

### Requirement: Opciones derivadas del producto
Los grupos de opciones de color, talla, capellada y suela SHALL derivarse de la configuración de cada producto y sincronizarse al gestionar sus variantes.

#### Scenario: Producto nuevo con opciones propias
- **GIVEN** un producto con combinaciones, rangos y materiales configurados
- **WHEN** el administrador abre la gestión de variantes
- **THEN** dispone de opciones específicas de ese producto sin administrarlas desde el menú global de grupos de opciones
