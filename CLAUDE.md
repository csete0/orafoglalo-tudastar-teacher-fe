# PaTricks Teacher Frontend (patricks-teacher)

## Overview
Angular 22 standalone frontend (no SSR, **zoneless** change detection — no zone.js), dev port 4300, for teachers/external instructors using the
PaTricks platform: creating private task sets, managing groups/schools, viewing student results,
group/school leaderboards. Shares the same backend (`patricks-api`) and database as the
student app. Part of "Patricks alkalmazás" / "PaTricks alkalmazás" (see the backend repo's CLAUDE.md
for full platform context).

Auth infrastructure is ported from the student repo but simplified (no OAuth/theme-switcher/etc.).
There are **two distinct "admin" concepts — don't conflate them:**
- Platform-admin: a JWT role claim, gates entire routes/features via a guard (`roleGuard('admin')`).
- Institution-admin/igazgató ("director"): per-institution data (`SchoolDto.myRole`), never a route
  guard — the UI shows/hides admin tabs based on this data field, because the same user can be a
  plain teacher in one institution and an admin in another simultaneously.

## Hard conventions / gotchas
- **Tailwind v4 uses CSS-first config (`@theme` in `styles.css`), not `tailwind.config.js`.** A
  leftover Tailwind-v3-style `theme.extend.colors` block in `tailwind.config.js` is silently ignored
  under v4 — this caused the entire app to render colorless (every custom color utility class
  generated no CSS at all) for an extended period before anyone noticed, because a colorless UI
  still visually "worked". If custom colors/utilities aren't applying, check `styles.css`'s
  `@theme` block first, not the config file (which should not exist / should be treated as dead).
- **Tailwind v4's preflight does not add `cursor: pointer` to buttons/links** the way v3's did —
  there's a global override for this (`button, a, [role="button"] { cursor: pointer }`) in
  `styles.css`; keep it if refactoring global styles.
- Same `[attr.name]` + `[ngModelOptions]="{standalone: true}"` gotcha documented in the student
  frontend's CLAUDE.md applies here too — this is actually where it was first found, in
  `feladatsor-szerkeszto.component.ts`'s dynamic per-section "new task" forms.
- File download/preview links to `/api/teacher-files/{guid}` must go through the injectable
  `authorized-file.service.ts` (blob-fetch → object URL), never a plain
  `<a href target="_blank">` — the JWT lives in localStorage, not a cookie, so a raw navigation
  won't carry it and a teacher gets a 401 on their own uploaded file.

## Terminológia (UI-UX-K1 - a feliratok EZEKET a szavakat használják, mindkét appban)

| Fogalom | Tanári app | Diák app | NE használd |
|---|---|---|---|
| Tanár → csoport tartalom-hozzárendelés | „Kiadás” (kiadva, kiadás visszavonása) | „Tanárod adta ki” | hozzárendelés, megosztás |
| Élő, tanár-vezérelt kvízjáték | „Élő játék” | „Élő játék” | Kahoot (védjegy - csak kódban/kommentben) |
| Önálló tempójú kitöltés | „önálló” | „önálló” | solo (csak kódban) |
| Vizsga-szimulátor gyakorlósorai | „Feladatsor” | „Feladatsor” (a kategória-oldal feladatsorokat listáz) | teszt |
| Diák statisztika-oldalai | „Statisztikák” | „Statisztikáim” (vizsga + kvíz) | riport (az a tanári oldal szava) |
| Csoportba lépés kódja | „Meghívó kód” | „Meghívó kód” | invite, belépőkód |
| Ajánlóprogram kódja (diák → diák) | – | „Ajánlókód” | meghívó kód (az a csoporté) |


## Lint
ESLint flat config (`eslint.config.js`, angular-eslint + typescript-eslint), run with `npm run lint`
(= `ng lint`, under `memrun` on the CT). Deliberately narrow rule set (refactor guard rails, not a style
rewrite), all errors: `prefer-control-flow`, `use-lifecycle-interface`, `no-input-rename`,
`no-explicit-any`, `template/no-any`, `prefer-signals`, `prefer-on-push-component-change-detection`.
No `any` / `$any` in new code.

## Change detection
Zoneless (`provideZonelessChangeDetection()`, no zone.js polyfill, FE refactor Z package 2026-10-23).
The UI only re-renders on signal writes, template events, `markForCheck`/`async` pipe — a plain field
written from a timer, promise, SignalR/DOM listener is NOT picked up. Keep template-visible state in
signals; don't reintroduce `NgZone`.

## Test infra
Vitest, same pattern as the student frontend (no Karma). Playwright E2E lives in this repo's own
`e2e/` directory, with a throwaway Docker PostgreSQL 17 (schema = frozen EF base migrations + `sql-postgres/*.sql`,
like prod) seeded by the standalone `Patricks.E2ESeed` console tool. SQL Server support was removed 2026-09-29.

## Infra / staging deploy — this app is NOT dockerized on staging
On the `.77` staging CT, unlike the student frontend and backend (which run in docker-compose at
`/opt/patricks`), **this app runs as a bare `ng serve --port 4300 --host 0.0.0.0` process**, started
from the bug-hunt clone `/opt/bug-hunt/repos/patricks-teacher` by the systemd unit
`patricks-teacher-fe.service` (script `/opt/bug-hunt/services/patricks-teacher-fe-start.sh`) —
`systemctl restart patricks-teacher-fe` after an update (the staging `deploy.sh` does this). nginx site `patricks-teacher-staging` on
port 9443 proxies to it. **Do not create a second/parallel instance of this app on staging** (docker
or otherwise) without first checking `ss -tlnp` / `docker ps -a` / `ps aux` for an existing one —
this has happened before and was explicitly rejected by the project owner ("miért kell még egy, ha
már fut egy példány") — update/restart the existing process instead.
- If serving from `ng serve` for any externally-reachable test, you must build with
  `--configuration staging` (not the default `development`) — the dev config's `environment.ts`
  hardcodes `apiUrl: 'http://localhost:7083/api'`, which silently breaks every API call when
  accessed from any machine other than the one running the server.
- Backend CORS (`StagingCorsPolicy` in `Program.cs`, `patricks-api`) must include this
  app's origin (`https://192.168.1.77:9443`) — if a new staging frontend origin/port is ever added,
  it needs adding there too, or API calls fail with a silent CORS error (Network tab can even show
  200 on the OPTIONS preflight while the actual policy still rejects the real request — check the
  `Access-Control-Allow-Origin` response header directly, not just the status code).

## Known open items
- None currently known and explicitly unresolved as a deferred product decision — the previously
  missing notification bell UI (teacher-facing equivalent of the student app's notifications) was
  implemented in full.
