# Métodos de pago del administrador

## Purpose
Delimitar los métodos de pago personalizados disponibles al configurar Vendure.

## Requirements

### Requirement: Métodos disponibles
La configuración de métodos de pago de Vendure SHALL ofrecer los controladores de Payphone y PayPal junto al método de prueba de Vendure.

#### Scenario: Configuración de una pasarela
- **GIVEN** un administrador autorizado en la configuración de métodos de pago
- **WHEN** crea un método de pago
- **THEN** puede elegir el controlador Payphone o PayPal

### Requirement: Credenciales y entorno
El controlador Payphone SHALL admitir token y entorno; el controlador PayPal SHALL admitir Client ID, Client Secret y entorno.

#### Scenario: Edición de argumentos
- **GIVEN** un método de pago basado en PayPal
- **WHEN** el administrador configura sus argumentos
- **THEN** puede introducir las credenciales e indicar el entorno del controlador

### Requirement: Confirmación con proveedor
Cuando se aportan credenciales y un identificador de transacción real, el controlador SHALL consultar al proveedor y SHALL informar el pago como aprobado o rechazado según su respuesta.

#### Scenario: Proveedor rechaza la transacción
- **GIVEN** credenciales e identificador reales para Payphone
- **WHEN** Payphone rechaza la confirmación
- **THEN** Vendure registra el intento como rechazado y conserva el motivo recibido

## Known limitations

Actualmente ambos controladores también devuelven un pago liquidado simulado cuando faltan credenciales o el identificador real de transacción. Este comportamiento exige una revisión antes de usarlos para cobros reales.
