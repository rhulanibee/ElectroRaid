# ElectroRaid — City of Tshwane

**ElectroRaid** is the municipal outage and revenue-protection platform for the City of Tshwane.

It sits between residents, municipal dispatchers, field technicians, and revenue-protection inspectors. Duplicate outage reports cluster in real time, prepaid meters that stop buying electricity while the feeder is still live are flagged (Izinyoka / meter bypass), the right crew is dispatched, and every action is written to an append-only audit chain. Residents track the assigned technician live on the map.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43147](http://localhost:43147). The landing page follows the household flow: **Report → Login / Register → proof of residence → dashboard → live tracking**.

Sign-in password for seeded accounts: `electroraid`.

| Person | How to sign in | Lands on |
| --- | --- | --- |
| Sibusiso Mabena | Account `3218840441` or **Sign in with Google** | `/resident` — dashboard, report, live-track, confirm restore |
| Thandiwe Nkosi | Login → Municipal staff, or email `t.nkosi@tshwane.gov.za` | `/ops` — assign a named technician |
| Sipho Dlamini | Login → Municipal staff, or email `s.dlamini@tshwane.gov.za` | `/tech` — assigned jobs appear immediately |
| Nomsa Khumalo | Login → Municipal staff, or email `n.khumalo@tshwane.gov.za` | `/inspect` — zero-kWh audits and repair QA |

New residents can **Register**, upload proof of residence, then use the green sidebar (Dashboard, Report Outage, Track Reports, Notifications, Settings).

## What is running

Next.js with TypeScript engines that mirror a production PostgreSQL + PostGIS design. The live floor can persist to Supabase.

| Layer | Where |
| --- | --- |
| PostGIS schema, indexes, SQL functions | `db/schema.sql` |
| Supabase / app tables | `db/supabase.sql` (run once in the Supabase SQL editor) |
| Spatial dedup, priority, anomaly, dispatch, audit, ROI | `src/lib/engines/` |
| In-memory store + Supabase save | `src/lib/store.ts`, `src/lib/sql-floor.ts` |
| REST + SSE | `src/app/api/` |
| Command map, field PWA, audit, analytics | `src/app/` and `src/components/` |

### Supabase on Vercel / local

Set either naming style (both work):

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

or

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Redeploy after adding env vars on Vercel.

## Priority score

```
Priority = (affected households × 12)
         + (critical infrastructure × 280)
         + (elapsed minutes × 1.8)
```

## Anomaly rule

Flag an **active** prepaid meter when it has purchased **0 kWh for ≥ 60 days** and the linked feeder status is **ENERGIZED**. Risk score is 0–100 (duration past the floor + feeder confirmation).

## Roles

| User | Interface | Responsibility |
| --- | --- | --- |
| Resident | `/resident` | Report a fault or anonymous tip, track the van live, confirm restore |
| Dispatcher | `/ops` | Live map, clustered tickets, assign crews |
| Field technician | `/tech` | Physical repairs, live GPS, closure proof |
| Revenue investigator | `/inspect` | Zero-consumption audits, Izinyoka evidence, repair QA |

## Field PWA

`/field` is the technician / inspector kit. It installs as a PWA (`manifest.json`) and queues actions in IndexedDB when offline, then flushes them to `/api/field/action`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/state` | Full snapshot + ROI + hash-chain status |
| GET | `/api/events` | Server-sent events (live map / dashboard) |
| POST | `/api/reports` | Ingest a resident report or anonymous tip |
| POST | `/api/anomalies/scan` | Run the zero-consumption worker |
| POST | `/api/dispatch` | Assign a matching crew |
| GET | `/api/audit` | Immutable ledger |
| GET | `/api/analytics` | Municipal ROI |
| POST | `/api/field/action` | On-site, evidence, fine, sign-off, resident confirm/dispute, inspector QA |

Seeded geography uses real Tshwane suburbs (Mamelodi, Atteridgeville, Soshanguve, Hatfield, Pretoria CBD); account numbers are representative, not live CIS records.

## Users in the code

Every seeded person, login, crew van, and role guard is listed in **[CODE.md](CODE.md)**.

## Legal

| Document | File |
| --- | --- |
| Privacy & Cookie Policy | [PRIVACY_POLICY.md](PRIVACY_POLICY.md) |
| Terms of Use | [TERMS_OF_USE.md](TERMS_OF_USE.md) |
| Acceptable Use | [legal/ACCEPTABLE_USE.md](legal/ACCEPTABLE_USE.md) |
| Event Privacy | [legal/EVENT_PRIVACY.md](legal/EVENT_PRIVACY.md) |
| Visitor Privacy | [legal/VISITOR_PRIVACY.md](legal/VISITOR_PRIVACY.md) |
| Dispute Policy | [legal/DISPUTE_POLICY.md](legal/DISPUTE_POLICY.md) |
| Generative AI | [legal/GENERATIVE_AI.md](legal/GENERATIVE_AI.md) |
| Merchant Services | [legal/MERCHANT_SERVICES.md](legal/MERCHANT_SERVICES.md) |
| Data Processing Agreement | [legal/DATA_PROCESSING_AGREEMENT.md](legal/DATA_PROCESSING_AGREEMENT.md) |
| Service Providers, Sub-processors, and Affiliates | [legal/SERVICE_PROVIDERS.md](legal/SERVICE_PROVIDERS.md) |
| Index | [legal/README.md](legal/README.md) |
