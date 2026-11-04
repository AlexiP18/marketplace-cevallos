# Preferencia de envío conjunto

## Purpose

Registrar la disponibilidad de cada almacén para una futura coordinación de envíos conjuntos.

## Requirements

### Requirement: Preferencia por almacén
El sistema SHALL permitir registrar si un almacén acepta participar en la coordinación de envíos conjuntos. La preferencia SHALL estar desactivada por defecto y SHALL pertenecer al vendedor del canal activo.

#### Scenario: El vendedor cambia su preferencia
- **WHEN** un administrador autorizado del canal de un vendedor cambia la preferencia
- **THEN** el sistema guarda el valor únicamente para ese vendedor

#### Scenario: Canal sin vendedor
- **WHEN** el canal activo no tiene un perfil de vendedor
- **THEN** el sistema no permite modificar la preferencia

#### Scenario: Funcionalidad pendiente
- **WHEN** se muestra la preferencia
- **THEN** la interfaz indica que todavía no activa envíos conjuntos ni modifica los precios del checkout
