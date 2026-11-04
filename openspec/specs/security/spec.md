# Seguridad de autenticación y transporte

## Requirements

### Requirement: RNF-01 Contraseñas y transporte
Las contraseñas SHALL almacenarse mediante bcrypt con coste mínimo 10 (configurado en 12). Las nuevas contraseñas SHALL tener de 8 a 72 caracteres. Producción SHALL aceptar exclusivamente tráfico externo HTTPS con TLS 1.3 mediante el proxy de despliegue y redirigir HTTP con 308. La clave JWT SHALL residir fuera del repositorio.

#### Scenario: Producción incompleta
- **WHEN** falta clave JWT, origen público HTTPS o lista de orígenes permitidos
- **THEN** el servidor rechaza el arranque en producción

### Requirement: RNF-01 API y contenido
Las credenciales y filtros SHALL pasarse como valores parametrizados a la base de datos. El frontend SHALL sanear HTML de productos y descripciones de pago antes de insertarlo en el documento. La API SHALL usar lista explícita de orígenes CORS y prevención CSRF. Las cookies del storefront SHALL ser HttpOnly, SameSite=Lax y Secure en producción.

### Requirement: RNF-02 JWT y permisos
Cada token SHALL contener identidad (`sub`), rol (`role`), sesión (`jti`), emisión y caducidad, emisor y audiencia. Solo se SHALL aceptar HS256 con la clave configurada. Un identificador interno de sesión sin JWT SHALL rechazarse. La autorización por canal SHALL consultar los permisos actuales de Vendure; una firma válida no SHALL permitir eludir una revocación o elevar privilegios.

#### Scenario: Token alterado, caducado o revocado
- **WHEN** se solicita un recurso con un JWT alterado, caducado o con sesión revocada
- **THEN** la API devuelve HTTP 401

#### Scenario: Permisos insuficientes
- **WHEN** un usuario solicita un recurso protegido sin el permiso requerido
- **THEN** la API devuelve HTTP 403

### Requirement: Cierre de sesión
Cerrar sesión SHALL revocar la sesión de Vendure y eliminar el JWT del almacenamiento del cliente. Se SHALL conservar la comprobación de revocación en el servidor, por lo que la autorización combina JWT con sesiones revocables.
