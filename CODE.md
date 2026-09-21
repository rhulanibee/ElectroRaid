# CODE.md — every user in ElectroRaid

This file is the user catalogue **as the code defines it**, not a marketing org chart.  
Sources: `src/lib/types.ts`, `src/lib/seed.ts`, `src/lib/session.ts`, `src/lib/store.ts`, `navForRole`, and the four role UIs.

Sign-in password: **`electroraid`**.  
Session key: `electroraid.session` in `localStorage`.  
Brand green: **`#24A148`**. Logo: green house under a leafy arch on every header, modal, and sidebar.

---

## 1. Roles the type system allows

`UserRole` in `src/lib/types.ts`:

| Role | Meaning in code | Has a login card? |
| --- | --- | --- |
| `resident` | Household reporter / tipster | Yes — Sibusiso |
| `dispatcher` | Control-room operator | Yes — Thandiwe |
| `technician` | Maintenance field crew | Yes — Sipho |
| `revenue_inspector` | Tamper / Izinyoka / Repair QA | Yes — Nomsa |
| `executive` | CFO / ROI viewer | Seeded only (`usr_cfo`) — no persona card |
| `system` | Engine that writes seed, merge, anomaly events | Seeded only (`usr_system`) |

There is **no** other role string in the union. Adding a user with a new role would fail TypeScript until `UserRole` and `navForRole` change.

---

## 2. Users seeded in `seedPlatform()` (`src/lib/seed.ts`)

These rows sit in `store.users` after boot.

| `id` | `fullName` | `role` | `employeeNo` | `email` | `phone` | Login? |
| --- | --- | --- | --- | --- | --- | --- |
| `usr_system` | ElectroRaid Engine | `system` | SYS-000 | engine@electroraid.tshwane.gov.za | — | No |
| `usr_sibusiso` | Sibusiso Mabena | `resident` | — | sibusiso@resident.tshwane | +27 82 441 0190 | **Yes** |
| `usr_thandiwe` | Thandiwe Nkosi | `dispatcher` | COT-4412 | t.nkosi@tshwane.gov.za | +27 12 358 4412 | **Yes** |
| `usr_sipho` | Sipho Dlamini | `technician` | COT-2281 | s.dlamini@tshwane.gov.za | +27 82 441 2281 | **Yes** |
| `usr_lebo` | Lebogang Maseko | `technician` | COT-2288 | l.maseko@tshwane.gov.za | +27 83 118 9902 | No card (seed / map only) |
| `usr_nomsa` | Nomsa Khumalo | `revenue_inspector` | RP-1104 | n.khumalo@tshwane.gov.za | +27 72 334 1104 | **Yes** |
| `usr_pieter` | Pieter van Wyk | `revenue_inspector` | RP-1109 | p.vanwyk@tshwane.gov.za | +27 71 220 4488 | No card (closed Atteridgeville case) |
| `usr_cfo` | Office of the CFO | `executive` | EX-009 | cfo.energy@tshwane.gov.za | +27 12 358 9999 | No card |

`isActive` is `true` for all of them.

---

## 3. Sign-in accounts

`PERSONAS` in `src/lib/session.ts` — landing page at `/`, login modal at `/login`, register at `/register`, proof of residence at `/verify`.

### 3.1 Sibusiso Mabena — resident

| Field | Value |
| --- | --- |
| `id` | `usr_sibusiso` |
| `home` | `/resident` |
| `suburb` | Mamelodi |
| `accountNumber` | `3218840441` (meter `mtr_healthy_mam`) |
| Nav | **Dashboard**, **Report Outage**, **Track Reports**, **Notifications**, **Settings** |

**What the code lets him do**

- Pick a fault chip (`OUTAGE_REPORT_OPTIONS`, including **Other**) or **Anonymous tip** (`TIP_REPORT_OPTIONS`).  
- `POST /api/reports` — outage uses his account + phone; tip sets name `"Anonymous tip"` and **null phone / account**.  
- See open tickets in his suburb. Seed includes **TSH-OUT-2026-0194** waiting for dispatch, plus a finished job he can confirm.  
- The moment Thandiwe assigns a crew, `TrackLiveMap` shows the van moving toward his meter (Bolt-style GPS lerp every 1.6 s via `crew.gps` SSE).  
- Notices: `dispatch.assigned`, `crew.arrived`, technician on site, technician finished.  
- `confirm` / `dispute` on `/api/field/action` → `residentConfirm` (ticket `closed`) or `residentDispute` (ticket `open` again).

He cannot open `/ops`, `/audit`, `/tech`, or `/inspect` — `AppShell` bounces him home.

### 3.2 Thandiwe Nkosi — dispatcher

| Field | Value |
| --- | --- |
| `id` | `usr_thandiwe` |
| `home` | `/ops` |
| Nav | Command `/ops`, Audit `/audit`, ROI `/analytics` |

**What the code lets her do**

- See the live map (outage circles, gold diamonds, Tech / Inspector vans, 500 m ring). Map key starts **minimized**.  
- Queue: needs a crew / in the field / waiting for resident confirm / revenue jobs.  
- Ticket detail lists **named crews** (`Assign MT-12 Mamelodi · 8 min`). `POST /api/dispatch` with `crewId` puts that job on the technician **immediately**; the household tracks the van.  
- Nearest-crew shortcut still uses `recommend_crew()` (`src/lib/engines/dispatch.ts`).  
- Read the plain-language audit diary and ZAR ROI.

Audit actor for assignments is `usr_thandiwe` (`DISPATCHER_ASSIGNED_CREW`).

### 3.3 Sipho Dlamini — technician

| Field | Value |
| --- | --- |
| `id` | `usr_sipho` |
| `home` | `/tech` |
| `crewId` | `crew_mt_mamelodi` (callsign **MT-12 Mamelodi**, specialisation `maintenance`) |
| Nav | **Jobs** only |

**What the code lets him do**

- The moment a dispatcher (or he himself) assigns `crew_mt_mamelodi`, the job is his — no extra accept step.  
- Banner: control room assigned the job; the resident is tracking the van live.  
- `onsite` → `field.onsite` (resident is notified).  
- `complete` → ticket `resolved`, crew `available`, event `incident.resolved` (resident must still confirm).  
- Notes, serial, signature hashed as `TECHNICIAN_WORK_COMPLETED`.

He does not issue tamper fines.

### 3.4 Nomsa Khumalo — revenue inspector

| Field | Value |
| --- | --- |
| `id` | `usr_nomsa` |
| `home` | `/inspect` |
| `crewId` | `crew_rp_east` (callsign **RP-03 East**, specialisation `revenue_protection`) |
| Nav | **Audits & QA** |

**What the code lets her do**

- **Tamper audits:** claim flagged investigations, on-site, GPS photo, `fine` + `close` recovered.  
- **Repair QA:** score technician jobs that are `resolved` or `closed` (1–5 + notes) → `submitQa` / `INSPECTOR_QA_ON_REPAIR`.  
- Offline queue via IndexedDB (`src/lib/offline.ts`) then `/api/field/action`.

---

## 4. Users who exist in the store but have no login card

### 4.1 ElectroRaid Engine — `usr_system`

Writes `PLATFORM_SEEDED`, `MASTER_INCIDENT_OPENED`, `REPORT_MERGED_INTO_MASTER`, `ANOMALY_ZERO_CONSUMPTION_FLAGGED`.  
`role: "system"`. Never shown on `/login`.

### 4.2 Lebogang Maseko — `usr_lebo`

Technician on `crew_mt_west` (**MT-07 Atteridgeville**). Seed starts him **en route** to the Kalafong / Maunde cable fault (`inc_att_cable`). You see the van on the dispatcher map. There is no persona card; to drive that job in the UI you would still log in as Sipho or dispatch via Thandiwe.

### 4.3 Pieter van Wyk — `usr_pieter`

Inspector on `crew_rp_west` (**RP-01 West**). Owner of the **already closed** Atteridgeville recovery `TSH-RP-2026-0044` (fine + back-bill + penalty in the ROI number). No login card.

### 4.4 Office of the CFO — `usr_cfo`

`role: "executive"`. `navForRole("executive")` would show ROI + Command, but nothing in `PERSONAS` logs in as this user. The dispatcher card already reaches `/analytics`.

---

## 5. Field crews (vehicles), not people

`FieldCrew` links a `userId` to a van. The map draws these, not raw `User` rows.

| `id` | Callsign | `userId` | Specialisation | Seed status |
| --- | --- | --- | --- | --- |
| `crew_mt_mamelodi` | MT-12 Mamelodi | `usr_sipho` | `maintenance` | available |
| `crew_mt_west` | MT-07 Atteridgeville | `usr_lebo` | `maintenance` | en_route (Kalafong) |
| `crew_rp_east` | RP-03 East | `usr_nomsa` | `revenue_protection` | available |
| `crew_rp_west` | RP-01 West | `usr_pieter` | `revenue_protection` | available (closed case still referenced) |

Dispatch will not send a `maintenance` van to an investigation, or an RP van to a cable joint — `pickBestCrew` filters on `specialization`.

Live technician GPS: `startChase` in `src/lib/store.ts` lerps the van toward the ticket every 1.6 s and emits quiet `crew.gps` events. The resident map (`TrackLiveMap`) and dispatcher map both subscribe via SSE.

---

## 6. Route guards (who can open which URL)

`navForRole` + `AppShell`:

| Path | Resident | Technician | Inspector | Dispatcher (default) | Executive |
| --- | --- | --- | --- | --- | --- |
| `/resident` | ✓ |  |  |  |  |
| `/tech` |  | ✓ |  |  |  |
| `/inspect` |  |  | ✓ |  |  |
| `/ops` Command |  |  |  | ✓ | ✓ |
| `/audit` |  |  |  | ✓ |  |
| `/analytics` ROI |  |  |  | ✓ | ✓ |
| `/login` | all (no shell) |  |  |  |  |
| `/field` | shared PWA kit (legacy combined field) |  |  |  |  |

Wrong role → `goReplace(persona.home)` (full page load, not an RSC download).

---

## 7. What each role writes on the audit chain

| `actionType` | Typical `actorRole` | Typical `actorId` |
| --- | --- | --- |
| `PLATFORM_SEEDED` | system | `usr_system` |
| `MASTER_INCIDENT_OPENED` / `REPORT_MERGED_INTO_MASTER` | system | `usr_system` |
| `ANONYMOUS_IZINYOKA_TIP` | resident | system user on ingest; UI sends `usr_sibusiso` on evidence |
| `ANOMALY_ZERO_CONSUMPTION_FLAGGED` | system | `usr_system` |
| `DISPATCHER_ASSIGNED_CREW` | dispatcher | `usr_thandiwe` |
| `FIELD_UNIT_ON_SITE` | technician or inspector | `usr_sipho` / `usr_nomsa` / seed `usr_pieter` |
| `TECHNICIAN_WORK_COMPLETED` | technician | `usr_sipho` |
| `RESIDENT_CONFIRMED_RESTORE` / `RESIDENT_STILL_NO_POWER` | resident | `usr_sibusiso` |
| `INSPECTOR_EVIDENCE_UPLOADED` / `TAMPER_FINE_ISSUED` / `INVESTIGATION_CLOSED` | revenue_inspector | `usr_nomsa` or `usr_pieter` |
| `INSPECTOR_QA_ON_REPAIR` | revenue_inspector | `usr_nomsa` |

The diary on `/audit` turns these into sentences (`src/lib/audit-copy.ts`).

---

## 8. Households and meters (not login users)

These are **accounts on the grid**, not `User` rows:

| Meter id | Account | Household name | Notes |
| --- | --- | --- |
| `mtr_healthy_mam` | 3218840441 | S. Mabena | Sibusiso’s prepaid — buys units (not an Izinyoka flag) |
| `mtr_silent_mam` | 3218841907 | M. Radebe | 0 kWh for 87 days, feeder ENERGIZED — anomaly scan target |
| `mtr_dark_hat` | 3081120091 | A. Naidoo | Hatfield, feeder DEENERGIZED — should **not** flag |
| `mtr_att_closed` | 3172208811 | K. Mokoena | Confirmed tamper, case already recovered |
| `mtr_sos_ok` | 3290014472 | F. Baloyi | Healthy Soshanguve prepaid |

Reporters on tickets (Lindiwe Sithole, J. Kekana, clinic staff, etc.) are `OutageReport.reporterName` only. They have no `users` row and cannot sign in.

---

## 9. How to add another human later

1. Add a `User` in `seedPlatform()`.  
2. If they drive a van, add a `FieldCrew` with that `userId`.  
3. If they need a login card, add a `DemoPersona` in `PERSONAS` with `home` + `navForRole` already covering their `role`.  
4. Do **not** invent a role string until you extend `UserRole`.

---

## 10. Legal

How these users’ data is treated: [Privacy & Cookie Policy](PRIVACY_POLICY.md), [Visitor Privacy](legal/VISITOR_PRIVACY.md), [legal pack index](legal/README.md).
