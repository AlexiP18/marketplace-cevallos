# Flujo de trabajo del marketplace

El trabajo se organiza en el [proyecto de Linear](https://linear.app/joel-penaloza/project/marketplace-de-calzado-cevallos-vendure-0f7ee730b5f8), equipo **ECOMM**. El código y sus revisiones se conservan en [GitHub](https://github.com/AlexiP18/marketplace-cevallos).

## De una tarea a un cambio

1. Consulta Linear y reutiliza una tarea existente antes de crear otra. Especifica el problema, el resultado esperado y los criterios de aceptación. Usa las etiquetas de dominio del equipo.
2. Crea una rama desde `main` actualizada: `feat/ecomm-123-descripcion`, `fix/ecomm-123-descripcion` o `chore/ecomm-123-descripcion`. Sustituye el número por el ID real. También puedes copiar el nombre de rama que ofrece Linear.
3. Realiza el cambio en su dominio y actualiza las especificaciones afectadas. Sigue [AGENTS.md](AGENTS.md), la [arquitectura](docs/architecture.md) y [OpenSpec](openspec/README.md).
4. Registra commits con un mensaje concreto, por ejemplo `fix(warehouse): validar percha (ECOMM-123)`.
5. Publica la rama y abre un pull request hacia `main`. Explica el resultado, la validación y cualquier migración o requisito de despliegue. Usa `Fixes ECOMM-123` cuando el cambio complete la tarea, o `Related to ECOMM-123` para una contribución parcial.
6. Revisa el diff y las comprobaciones, resuelve las conversaciones y combina mediante squash. Comprueba en Linear el estado resultante; las automatizaciones dependen de la configuración de la integración.

## Estados y evidencias

- **Backlog**: trabajo identificado que aún no se ha planificado.
- **Todo**: tarea lista para iniciar.
- **In Progress**: trabajo en curso.
- **In Review**: cambio publicado y pendiente de revisión.
- **Done**: alcance de la tarea completado con evidencia enlazada.
- **Canceled**: trabajo retirado del alcance, conservando el motivo.

Los registros históricos de implementación documentan código incorporado en Git. No certifican el cumplimiento integral de los requisitos ni el rendimiento en producción. Mantén visibles las limitaciones y las revisiones pendientes.

## Comprobaciones y datos

GitHub Actions comprueba tipos del backend y storefront con Node.js 22, sin conectar a PostgreSQL o Redis. Esto no valida el dashboard, la compilación de producción ni los flujos de negocio. Las validaciones adicionales deben corresponder al cambio y a las instrucciones del proyecto; documenta cualquier validación omitida.

No publiques archivos `.env`, credenciales, datos personales de clientes ni archivos generados. Describe las variables requeridas sin sus valores. Para producción consulta [MARKETPLACE.md](deploy/MARKETPLACE.md) y [SECURITY.md](deploy/SECURITY.md).

## Integración

La [integración nativa de Linear con GitHub](https://linear.app/docs/github-integration) enlaza ramas, commits y pull requests. No requiere añadir un token de Linear al repositorio para este flujo. Los permisos de la integración y sus automatizaciones se administran en Linear y GitHub; enlazar una tarea manualmente no demuestra que la sincronización automática funcione.
