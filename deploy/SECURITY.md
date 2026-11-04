# RNF-01 y RNF-02

El backend emite JWT HS256 con `sub`, `role`, `jti`, `iat`, `exp`, `iss` y `aud`. Valida firma, algoritmo, emisor, audiencia, caducidad y sesión vigente antes de consultar un recurso. El identificador interno de sesión no se acepta como bearer público. Vendure conserva la autorización por canal y la revocación inmediata al cerrar sesión o desactivar la cuenta; los permisos actuales del servidor prevalecen sobre un rol firmado anteriormente. Esta integración usa JWT con sesiones revocables, por lo que no constituye una autorización totalmente stateless.

Las contraseñas se almacenan con bcrypt coste 12. Las contraseñas nuevas requieren 8 a 72 caracteres; no es necesario restablecer las existentes. El storefront conserva el JWT en una cookie HttpOnly/SameSite=Lax/Secure en producción. El dashboard utiliza el almacenamiento bearer nativo de Vendure. El HTML de catálogo y descripciones de pago se sanea antes de renderizarlo.

## Producción

1. Configurar `APP_ENV=production`, `JWT_SECRET` aleatorio de al menos 32 bytes, `PUBLIC_API_ORIGIN=https://api.dominio`, `CORS_ORIGINS=https://tienda.dominio,https://api.dominio` y credenciales propias de superadministrador. La aplicación rechaza configuraciones de producción incompletas.
2. Generar el secreto fuera del repositorio: `openssl rand -hex 48`. Guardarlo en el gestor de secretos del despliegue. Compartir la misma clave entre servidor, worker y réplicas. Rotarla invalida los JWT existentes.
3. Instalar certificados para ambos dominios y adaptar `nginx-tls.conf.example`. Ejecutar `nginx -t` antes de recargar Nginx. El backend escucha en 127.0.0.1 fuera de desarrollo y confía en un único proxy.
4. Iniciar Next con `next start --hostname 127.0.0.1 --port 3001`. Configurar `VENDURE_SHOP_API_URL=https://api.dominio/shop-api` y `NEXT_PUBLIC_SITE_URL=https://tienda.dominio`.
5. Exponer solamente 80/443. Mantener PostgreSQL en red privada y proteger los volúmenes y copias de seguridad mediante cifrado de disco del proveedor. Esta configuración no cifra automáticamente un volumen PostgreSQL existente.
6. Verificar que HTTP devuelve 308, que TLS 1.2 se rechaza y TLS 1.3 funciona. Después probar registro, login, logout, permisos del canal y cargas de archivos. Usar `Apollo-Require-Preflight: true` para clientes GraphQL, incluidas cargas multipart.

## Desarrollo

HTTP local sigue habilitado. Se generó una clave JWT local en el `.env` ignorado por Git; no se publica en el código. Las sesiones anteriores deben iniciar sesión otra vez. Cada etiqueta de sesión vence como máximo a las ocho horas, aunque Vendure prolongue internamente su sesión. Para iniciar un nuevo entorno, copiar `.env.example` y generar `JWT_SECRET` antes de arrancar.

## Comprobación

Desde `apps/server`: `node --test test/jwt-token.test.cjs` y `npx ts-node -T test/security-session.integration.ts` (esta última usa las credenciales locales para crear y cerrar una sesión de prueba).

El ejemplo de Nginx requiere dominio y certificado reales para activar TLS públicamente. No acredita por sí solo cumplimiento de la LOPDP ni sustituye la configuración de seguridad y conservación de datos del entorno desplegado.
