# Playwright E2E — tanári platform

Teljes, valós stacken futó E2E suite: eldobható Docker SQL Server konténer + a
séma tényleges DACPAC-deploya + a backend (`orafoglalo-tudastar-be`) és mindkét
frontend (`orafoglalo-tudastar-fe`, ez a repó) valódi `dotnet run` / `ng serve`
folyamatai. Nincs mockolás — a flow JWT role-claimeken, multipart uploadon és
szerver-oldali gatingen ível át, amit egy mock nem tudna hitelesen leképezni.

## Előfeltételek

- Docker Desktop fut (a teszt egy eldobható SQL Server 2022 konténert indít a
  `14330`-as hoszt-porton).
- A `.NET 10` SDK telepítve (a backend és az `E2ESeed` konzol-eszköz ezt
  igényli).
- Testvér-mappa elrendezés: mindhárom repó ugyanazon szülő könyvtár alatt van:
  ```
  E:\Repos\orafoglalo-tudastar-be
  E:\Repos\orafoglalo-tudastar-fe
  E:\Repos\orafoglalo-tudastar-teacher-fe   <- ez a repó, innen futtatunk
  ```
  Ha máshol vannak, ld. alább az env var felülbírálást.
- A `7083` (backend), `4200` (diák-fe) és `4300` (tanár-fe) portok szabadok —
  a suite a NORMÁL dev portokat használja, ezért **E2E közben ne fusson
  párhuzamosan egy normál dev session** (állítsd le előtte, ha fut).

## Futtatás

```bash
npm install
npx playwright install chromium   # csak első alkalommal
npx playwright test               # teljes suite, fejnélküli
npx playwright test --ui          # interaktív UI mód
npx playwright test teacher-onboarding.spec.ts   # egy fájl
```

A teljes kör (Docker indítás → séma deploy → seed → backend indítás → 2
frontend indítás → 8 teszt → teardown) kb. **3.5–4 perc**.

Hiba esetén a Playwright HTML-riport és a trace.zip a `test-results/`-ban
landol; `npx playwright show-trace test-results/<mappa>/trace.zip` a vizuális
visszajátszáshoz.

## Környezeti változók (elszigetelt/eltérő elrendezéshez)

| Változó                    | Alapértelmezés                              | Mire való |
|-----------------------------|----------------------------------------------|-----------|
| `E2E_BACKEND_REPO_PATH`     | `../orafoglalo-tudastar-be`                   | Backend repó útja |
| `E2E_STUDENT_FE_REPO_PATH`  | `../orafoglalo-tudastar-fe`                   | Diák-fe repó útja |
| `E2E_TEACHER_FILES_ROOT`    | OS temp / `tudastar-e2e-teacher-files`        | Tanári feltöltött fájlok fizikai gyökere |

A DB-konténer neve/portja (`tudastar-e2e-db` / `14330`) és az admin teszt-fiók
(`e2e-admin@example.com` / `E2eAdmin123!`) az `e2e/constants.ts`-ben van
fixen — ezek nem ütköznek semmilyen valódi/dev erőforrással, mert saját,
dedikált konténerben/DB-ben élnek.

## Végrehajtási sorrend (fontos, ha a harnesst bővíted)

A Playwright `webServer` plugin-jai **KORÁBBAN** indulnak, mint a user
`globalSetup` fájl (ellentétes a naiv elvárással!) — ezért a backendet NEM a
`playwright.config.ts` `webServer` tömbjén át indítjuk (az a DB-seedelés
ELŐTT próbálná felhúzni, és összeomlana). Helyette:

1. `e2e/global-setup.ts` maga indítja/állítja le a Docker konténert,
   deployolja a sémát + seedeli az adatokat (`DigitalCulture.E2ESeed`
   konzol-eszköz — az `xUnit` teszt-harness DACPAC-deploy mintáját
   újrahasznosítja, önállóan futtatható).
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
