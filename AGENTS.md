# vendure-prueba Project Instructions

This project was generated with `@vendure/create`.

## Workspace Layout

- Vendure backend: `apps/server`
- Next.js storefront: `apps/storefront`
- Start both apps: `npm run dev`
- Start only the server: `npm run dev:server`
- Start only the storefront: `npm run dev:storefront`
- Backend custom code belongs in `apps/server/src/plugins`
- Backend runtime configuration is in `apps/server/src/vendure-config.ts`
- Backend static assets and email templates live in `apps/server/static`

## Vendure Development

- Prefer implementing custom functionality as a Vendure plugin.
- Use `npx vendure add` to scaffold plugins, entities, services, API extensions, and job queues.
- Read environment variables in `vendure-config.ts` and pass values into plugins through `Plugin.init()` options.
- Create job queues in `onModuleInit()` or `onApplicationBootstrap()`, then reuse the queue when adding jobs.
- Pass `RequestContext` to Vendure services and `TransactionalConnection` methods when it is available.
- Do not commit `.env` values or generated runtime data.
- Do not use `dbConnectionOptions.synchronize: true` for production data.

## Modular Architecture — RNF-08

- Apply [the architecture guide](docs/architecture.md) and [RNF-08](openspec/specs/modular-architecture/spec.md) across the backend, dashboard, storefront and Worker.
- Keep each change in its owning domain. Resolvers/controllers handle transport and authorization; services own business rules and transactions; entities/migrations define persistence; UI components handle presentation and interaction.
- Keep authoritative pricing, stock, permissions and identifier rules in the backend. Frontend previews do not replace server validation.
- Reuse Vendure services and `TransactionalConnection`; do not add a repository wrapper, interface or new layer solely to mirror an existing call.
- Integrate domains through explicitly exported services, contracts or events. Do not import another module's UI internals or mutate its data while bypassing its invariants. Document channel-scoped reporting queries that join domains.
- Inject plugin options through provider tokens. Services must not import their plugin registration class to read static options or create circular imports.
- Keep code shared by the browser and Worker free of backend services, database access and secrets; isolate platform-specific adapters.
- Before changing a contract, find its callers, jobs, tests and migrations. Update those consumers together and run the affected integration checks.
- Record existing coupling in the architecture guide and reduce it when the related behavior changes. Broad refactors require a concrete need; do not introduce microservices or generic abstractions to satisfy this requirement.

## Commands

- Start development: `npm run dev`
- Build: `npm run build`

## Quality Checks

- Run `npm run build` after changing backend code.
- Run targeted tests for the package or feature you changed.
