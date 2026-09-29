# Playwright E2E — tanári platform

Teljes, valós stacken futó E2E suite: eldobható Docker PostgreSQL 17 konténer + a
séma tényleges felépítése (EF-alapmigrációk + `sql-postgres/*.sql`, pontosan mint élesben) + a backend és az
Admin API (`orafoglalo-tudastar-be`), valamint a három frontend (diák: `orafoglalo-tudastar-fe`, tanári: ez a repó,
admin: `orafoglalo-tudastar-admin-fe`) valódi `dotnet run` / `ng serve` folyamatai. Nincs mockolás — a flow JWT role-claimeken, multipart uploadon és
szerver-oldali gatingen ível át, amit egy mock nem tudna hitelesen leképezni.

## Előfeltételek

- Docker fut (a teszt egy eldobható PostgreSQL 17 konténert indít a
  `127.0.0.1:15433`-as hoszt-porton, 1 GB memórialimittel).
- A `.NET 10` SDK telepítve (a backend és az `E2ESeed` konzol-eszköz ezt
  igényli).
- Testvér-mappa elrendezés: mindhárom repó ugyanazon szülő könyvtár alatt van:
  ```
  E:\Repos\orafoglalo-tudastar-be
  E:\Repos\orafoglalo-tudastar-fe
  E:\Repos\orafoglalo-tudastar-teacher-fe   <- ez a repó, innen futtatunk
  E:\Repos\orafoglalo-tudastar-admin-fe     <- platform-admin felület (2026-09-23 óta)
  ```
  Ha máshol vannak, ld. alább az env var felülbírálást.
- A `7083` (backend), `4200` (diák-fe) és `4300` (tanár-fe) portok szabadok —
  a suite a NORMÁL dev portokat használja, ezért **E2E közben ne fusson
  párhuzamosan egy normál dev session** (állítsd le előtte, ha fut).
  Az Admin API (`17090`) és az admin-fe (`14400`) saját portot kap, mert a staging CT-n a 7090/4400-on a
  staging példányok futnak. Az admin-fe production-konfiggal (relatív `/api/admin`) és az `e2e/admin-proxy.json`
  proxyval indul - az Admin API-n nincs CORS, stagingen/élesen is az nginx teszi egy originre.
- **Memória:** 3 Angular dev szerver + 2 .NET API + Postgres + Chromium együtt ~6 GB-ot is elér. 5 GB-os
  keret alatt a Chromium futás közben meghal („Target page, context or browser has been closed”) - a staging
  CT-n `MEMRUN_MAX=8G memrun npx playwright test`, ehhez a CT memóriáját ideiglenesen emelni kell.

## Futtatás

```bash
npm install
npx playwright install chromium   # csak első alkalommal
npx playwright test               # teljes suite, fejnélküli
npx playwright test --ui          # interaktív UI mód
npx playwright test teacher-onboarding.spec.ts   # egy fájl
```

A teljes kör (Docker indítás → séma deploy → seed → backend + Admin API indítás → 3
frontend indítás → 12 teszt → teardown) kb. **4 perc**.

Hiba esetén a Playwright HTML-riport és a trace.zip a `test-results/`-ban
landol; `npx playwright show-trace test-results/<mappa>/trace.zip` a vizuális
visszajátszáshoz.

## Környezeti változók (elszigetelt/eltérő elrendezéshez)

| Változó                    | Alapértelmezés                              | Mire való |
|-----------------------------|----------------------------------------------|-----------|
| `E2E_BACKEND_REPO_PATH`     | `../orafoglalo-tudastar-be`                   | Backend repó útja |
| `E2E_STUDENT_FE_REPO_PATH`  | `../orafoglalo-tudastar-fe`                   | Diák-fe repó útja |
| `E2E_ADMIN_FE_REPO_PATH`    | `../orafoglalo-tudastar-admin-fe`             | Admin-fe repó útja |
| `E2E_TEACHER_FILES_ROOT`    | OS temp / `tudastar-e2e-teacher-files`        | Tanári feltöltött fájlok fizikai gyökere |

A DB-konténer neve/portja (`tudastar-e2e-db` / `15433`) és az admin teszt-fiók
(`e2e-admin@example.com` / `E2eAdmin123!`) az `e2e/constants.ts`-ben van
fixen — ezek nem ütköznek semmilyen valódi/dev erőforrással, mert saját,
dedikált konténerben/DB-ben élnek.

## Végrehajtási sorrend (fontos, ha a harnesst bővíted)

A Playwright `webServer` plugin-jai **KORÁBBAN** indulnak, mint a user
`globalSetup` fájl (ellentétes a naiv elvárással!) — ezért a backendet NEM a
`playwright.config.ts` `webServer` tömbjén át indítjuk (az a DB-seedelés
ELŐTT próbálná felhúzni, és összeomlana). Helyette:

1. `e2e/global-setup.ts` maga indítja/állítja le a Docker konténert,
   felépíti a sémát + seedeli az adatokat (`DigitalCulture.E2ESeed`
   konzol-eszköz — ugyanazt a sémaépítést futtatja, mint az `xUnit`
   teszt-harness, önállóan futtatható).
2. Ezután a `global-setup.ts` maga `spawn()`-olja a backendet (`dotnet run`),
   és pollozza az `/api/roles` végpontot, amíg fel nem áll.
3. Csak EZUTÁN futnak a `playwright.config.ts` `webServer` bejegyzései (a két
   Angular dev szerver) — ezek sorrend-függetlenek, biztonságosan mehetnek a
   `webServer` mechanizmuson.
4. `e2e/global-teardown.ts` állítja le a backendet (PID-fájlból) és távolítja
   el a Docker konténert.

## Ismert, E2E-specifikus backend-kapcsolók

A tesztkörnyezet a normál `appsettings.Development.json`-t használja, de két
env var-ral felülbírál viselkedést, amit csak a suite fut le olyan gyorsan
egymás után, hogy valódi prodban sosem jönne elő:

- `Hangfire__DisableServer=true` — a Hangfire worker-szerver (12+ worker,
  hosszú-pollozó SQL kapcsolatokkal) versenyezne a teszt-forgalommal az
  eldobható DB-konténerért; háttérjobokra a suite-nak nincs szüksége.
- `RateLimiting__Disabled=true` — a suite percek alatt tucatnyi
  bejelentkezést indít, mind `localhost`-ról; a produkciós login/IP
  rate-limiter (5/15perc) ezt éles környezetben helyesen 429-cel utasítaná
  el, de itt szándékosan kikapcsolt.

Mindkét kapcsoló `Program.cs`-ben van implementálva (config-vezérelt, nem
külön build), és csak akkor aktiválódik, ha a `global-setup.ts` explicit
beállítja őket a backend-folyamat környezetében.
