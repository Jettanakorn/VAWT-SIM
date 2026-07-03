# VAWT-SIM

A digital specification sheet for Vertical Axis Wind Turbine (VAWT) design — capturing client requirements and engineering design parameters in one structured document, backed by a Postgres (Supabase) database.

This tool exists to solve a common problem in small wind turbine projects: requirements and design parameters live scattered across emails, spreadsheets, and meeting notes, with no single source of truth and no audit trail as a spec evolves from a client conversation to an approved engineering design. VAWT-SIM consolidates that into one versioned record per project.

## Scope

VAWT-SIM is a **specification and requirements-capture tool**, not a simulation or CFD solver. It records the inputs, targets, and methodology *decisions* for a VAWT design — the aerodynamic model type, the CFD solver selected, the turbulence model chosen — rather than executing the analysis itself. Actual aero/structural simulation is expected to happen in external tools (e.g., QBlade, ANSYS Fluent, OpenFOAM, ANSYS Mechanical); this app is where the resulting numbers and method choices get documented and tracked to a design review gate.

## Specification Fields

### Section 1 — Client & Site Requirements

| Group | Parameters |
|---|---|
| Project identity | Client contact, project name/ID |
| Site | Address, altitude (m ASL), mean wind speed, prevailing wind direction, site obstructions/constraints |
| Power requirement | Target rated power (kW), annual energy target (kWh/yr), grid connection type, voltage, frequency |
| Physical envelope | Max rotor height, max rotor diameter, max total install height, rotor architecture (Darrieus / H-type / Savonius / hybrid) |
| Environmental & regulatory | Noise limit (dBA), applicable certification standard (e.g., IEC 61400-2), survival wind speed (m/s), operating temperature range |
| Wind resource | Weibull shape (*k*) and scale (*c*) parameters, reference/hub height, surface roughness length (*z₀*), full wind speed frequency table (0–30 m/s) |

The Weibull table is the basis for AEP (annual energy production) estimation downstream — it's stored explicitly rather than just the *k*/*c* pair so the underlying distribution can be audited or re-derived without re-running a wind resource assessment.

**Auto-calculated vs. manual entry.** By default the frequency table is derived live from *k*, *c*, and the height/roughness inputs using the standard two-parameter Weibull distribution with log-law wind shear extrapolation to hub height. If you have your own measured or purchased wind resource data (met mast, MERRA-2, a wind atlas) instead of a clean Weibull fit, switch the table to **Manual edit** mode and type the frequency (%) directly per wind-speed bin — hours/yr recalculates automatically, and power density stays physically derived from wind speed. Switching back to Auto-calculated discards manual edits (with a confirmation prompt). An inline **guide panel** ("What is this? / Guide") explains what *k*, *c*, and each height parameter mean, and when to reach for manual mode.

### Section 2 — Engineering Design

| Group | Parameters |
|---|---|
| Blade geometry | Blade count, aerofoil profile, chord length, rotor radius, rotor height, solidity ratio (σ = Nc/2πR), blade pitch angle, rated tip-speed ratio (TSR, λ) |
| Operating envelope | Cut-in / rated / cut-out wind speed, peak power coefficient (Cp) |
| Performance targets | Target Cp, AEP, capacity factor, design life (years), first natural frequency, predicted noise |
| Structural & materials | Blade material, shaft/tower material, mass budget, design safety factor, surface treatment/coating |
| Drivetrain | Generator type (PMSG/induction/etc.), rated RPM, gearbox ratio (direct-drive = 1:1), drivetrain efficiency, braking system |
| Simulation methodology | Aerodynamic method (BEM / double-multiple streamtube / CFD), structural method (beam theory / FEM), CFD solver, FEM package, turbulence model (k-ω SST, etc.) |
| Validation plan | Scale test flag, model scale ratio, instrumentation list, acceptance criteria |
| Design review gate | Status (draft / in review / approved / rejected), lead engineer, review date, notes |

Solidity ratio, TSR, and Cp are the three parameters that most strongly couple blade geometry to aerodynamic performance for a Darrieus-type rotor — they're kept as first-class fields rather than buried in free text so they can be validated or cross-checked against BEM/streamtube output.

## Design Workflow

```
Client intake (Section 1)
        │
        ▼
Engineering design (Section 2) ── external CFD/FEM analysis informs field values
        │
        ▼
status: draft → in_review → approved/rejected   (design review gate)
        │
        ▼
Record persisted in Supabase, retrievable by doc_id for revision history
```

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Single-file HTML/CSS/JS | No build step, no framework dependency |
| Backend | [Supabase](https://supabase.com) | Postgres + auto-generated REST API |
| Storage | PostgreSQL, `jsonb` for the Weibull table and method-selection lists | Row Level Security enabled |

Kept intentionally framework-free — this is a form over a schema, not an application requiring client-side state management.

## Repository Layout

```
VAWT-SIM/
├── index.html                # Spec sheet UI + Supabase client calls (built/bundled single-file app)
├── vawt_supabase_setup.sql   # Table DDL, trigger, RLS policy, indexes
├── LICENSE                   # MIT
└── README.md
```

> **Note on `index.html`:** this file is a bundled build output (React + Supabase client inlined into one `<script>` tag), not hand-authored source. There is currently no separate pre-build project checked into this repo — edits to app behavior are made directly against this file. Keep that in mind if you later introduce a real build step; you'll want to reconcile any direct edits back into source first.

## Setup

### 1. Provision the database

Run [`vawt_supabase_setup.sql`](./vawt_supabase_setup.sql) in the Supabase SQL Editor. It creates:

- `vawt_submissions` — one row per spec, keyed by `id` (UUID), referenced externally by `doc_id`
- `updated_at` trigger — auto-stamps on every row update, so revision timing is auditable
- Row Level Security, currently an **open policy** (`USING (true) WITH CHECK (true)`) — functional out of the box but not scoped to a user; see [Security](#security) before deploying beyond local use
- Indexes on `doc_id`, `status`, `created_at` for lookup and review-queue queries

### 2. Point the app at your project

`index.html` already ships with a Supabase URL and anon key inlined near the bottom of the script. Replace both with your own project's values (Supabase dashboard → **Settings → API**) if you're pointing this at a different backend.

### 3. Serve it

Static file, no build:

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```
or just open `index.html` directly in a browser.

## Security

The anon key is client-visible by design in a Supabase setup — the open RLS policy means anyone with the URL can read/write every row. Before using this for anything beyond a local or single-user prototype:

- Restrict the RLS policy to `auth.uid()`-scoped rows, or add an auth layer
- Move write access behind a server-side function/edge function if multi-tenant use is expected
- Do not commit a service-role key into the HTML file under any circumstances — only the anon key belongs there

## Known Limitations

- No input validation against physically implausible values (e.g., Cp > Betz limit of 0.593) — the tool records what's entered, it doesn't check aerodynamic feasibility
- Manual Weibull entry doesn't validate that per-bin frequencies sum to ~100% — garbage in, garbage out on AEP downstream
- No versioning/diff view between revisions of the same `doc_id` beyond the `updated_at` timestamp
- No unit toggling (all fields assume SI units — confirm this matches your team's convention before bulk data entry)

## License

MIT License — see [`LICENSE`](./LICENSE).

Copyright (c) 2026 Jettanakorn Pengsiri, JFOX Aircraft
