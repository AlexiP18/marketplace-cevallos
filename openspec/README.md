# Especificaciones del sistema

Las capacidades funcionales del administrador y las API se describen en `specs/<capacidad>/spec.md`.

[RNF-08: mantenibilidad y arquitectura modular](specs/modular-architecture/spec.md) es transversal: aplica a todas las capacidades actuales y futuras, al dashboard, al storefront y al Worker. La [guía de arquitectura](../docs/architecture.md) identifica responsabilidades, límites de capas y acoplamientos existentes pendientes.

Al modificar una capacidad, actualizar su especificación cuando cambie el comportamiento y comprobar también los requisitos transversales aplicables, incluidos arquitectura, seguridad, canales e integridad de datos. Las especificaciones expresan criterios verificables; no sustituyen las pruebas ni acreditan por sí solas el cumplimiento del código existente.
