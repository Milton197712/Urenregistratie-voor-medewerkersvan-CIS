# Tijdvast

Een urenregistratie-app waarin medewerkers hun werkdag registreren en beheerders correcties en doorwerktoestemming beheren.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/urenregistratie/src/App.tsx` — medewerker-, beheerder- en instellingenervaring.
- `artifacts/api-server/src/routes/time.ts` — registratie-, dashboard- en overwerklogica, inclusief automatische uitklok.
- `lib/api-spec/openapi.yaml` — bron voor de urenregistratie-API.
- `lib/db/src/schema/attendance.ts` — medewerkers, tijdregistraties en doorwerkverzoeken.
- `lib/db/src/schema/projects.ts` — actieve projecten die medewerkers bij het inklokken kiezen.

## Architecture decisions

- De werkdag is 07:30–12:00 en 13:00–16:30; doorwerken na een cutoff vraagt vooraf goedkeuring.
- Automatische uitklok wordt periodiek door de API toegepast en gemarkeerd met `autoClocked`, zodat een beheerder het verschil met een handmatige registratie ziet.
- De eerste versie gebruikt een demo-profielwissel voor medewerker/beheerder; echte accountbeveiliging kan later via Clerk worden toegevoegd.

## Product

Medewerkers kunnen een project kiezen en inklokken, pauze starten/eindigen, uitklokken en een doorwerkverzoek indienen. Beheerders zien de bezetting, het project per registratie, open registraties en verzoeken, kunnen verzoeken goedkeuren of afwijzen en tijdregistraties corrigeren.

## User preferences

- De vaste werktijden zijn 07:30–12:00 en 13:00–16:30.

## Gotchas

- Na wijzigingen aan `lib/api-spec/openapi.yaml` eerst `pnpm --filter @workspace/api-spec run codegen` uitvoeren.
- De demo-seed is concurrency-safe; bij een nieuwe lege database worden alleen vier voorbeeldmedewerkers en enkele voorbeeldregistraties aangemaakt.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
