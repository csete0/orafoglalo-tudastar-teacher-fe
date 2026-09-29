import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as http from 'node:http';
import {
  ADMIN_API_LOG_FILE,
  ADMIN_API_PID_FILE,
  ADMIN_API_PORT,
  ADMIN_API_URL,
  BACKEND_LOG_FILE,
  BACKEND_PORT,
  BACKEND_PID_FILE,
  BACKEND_REPO_PATH,
  BACKEND_URL,
  DB_CONNECTION_STRING,
  DB_CONTAINER_NAME,
  DB_HOST_PORT,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
  TEACHER_FILES_ROOT,
} from './constants';

/**
 * Playwright globalSetup.
 *
 * FONTOS SORREND-GOTCHA: a Playwright `webServer` config-opció NEM globalSetup
 * UTÁN indul, hanem ELŐTTE — a `webServer` belsőleg egy "plugin", és a
 * plugin-setup taskok a globalSetup fájl előtt futnak le (ld. Playwright
 * runner forrás: createGlobalSetupTasks = [...pluginSetupTasks, ...globalSetupFileTasks]).
 * Emiatt a backendet NEM lehet a playwright.config.ts webServer tömbjén át
 * indítani — az a DB-seedelés befejezése ELŐTT próbálná elindítani, és a
 * dinamikus policy-provider (Roles tábla still üres) + Hangfire (nincs séma)
 * azonnal elhasalna. A backendet ezért ITT, manuálisan indítjuk, a
 * seedelés UTÁN — a playwright.config.ts webServer tömbje csak a két
 * Angular dev szervert tartalmazza, azoknak nincs ilyen függősége.
 */
export default async function globalSetup(): Promise<void> {
  console.log('[global-setup] Régi E2E DB-konténer eltávolítása (ha volt)...');
  runDocker(['rm', '-f', DB_CONTAINER_NAME], { allowFailure: true });

  console.log(`[global-setup] PostgreSQL 17 konténer indítása (port ${DB_HOST_PORT})...`);
  runDocker([
    'run', '-d',
    '--name', DB_CONTAINER_NAME,
    '--memory', '1g',
    '-p', `127.0.0.1:${DB_HOST_PORT}:5432`,
    '-e', `POSTGRES_USER=${DB_USER}`,
    '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`,
    '-e', `POSTGRES_DB=${DB_NAME}`,
    // UTF-8 + C.UTF-8: a magyar ékezetek és az ICU-collationök (ci_ai, hu-HU-x-icu) így viselkednek, mint élesben.
    '-e', 'POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C.UTF-8',
    'postgres:17',
  ]);

  await waitForPostgresReady();

  console.log('[global-setup] Séma (EF-alapmigrációk + sql-postgres scriptek) + seed (DigitalCulture.E2ESeed)...');
  execFileSync(
    'dotnet',
    ['run', '--project', 'DigitalCulture.E2ESeed', '--', DB_CONNECTION_STRING],
    { cwd: BACKEND_REPO_PATH, stdio: 'inherit' },
  );

  fs.mkdirSync(TEACHER_FILES_ROOT, { recursive: true });

  console.log('[global-setup] Backend + Admin API indítása (a séma+seed már kész)...');
  assertPortFree(BACKEND_PORT);
  assertPortFree(ADMIN_API_PORT);
  // Egymás után: két párhuzamos `dotnet run` ugyanazokat a közös projekteket fordítaná egyszerre (obj/-zár ütközés).
  await startDotnetService({
    name: 'Backend',
    project: 'DigitalCulture.API',
    readyUrl: `${BACKEND_URL}/api/roles`,
    pidFile: BACKEND_PID_FILE,
    logFile: BACKEND_LOG_FILE,
    env: {
      ContactForm__RecipientEmail: 'e2e-contact@example.com',
      TeacherFiles__RootPath: TEACHER_FILES_ROOT,
      // A Hangfire worker-szerver (12+ worker, hosszú-pollozó SQL kapcsolatokkal)
      // versenyezne a teszt-forgalommal az eldobható E2E DB-konténerért —
      // háttérjobokra itt nincs szükség (ld. Program.cs Hangfire:DisableServer).
      Hangfire__DisableServer: 'true',
      // A teljes suite sok tucat bejelentkezést indít percek alatt, mind
      // localhost-ról — a produkciós login/IP rate-limiter (5/15perc) ezt
      // 429-cel (és hiányzó CORS header miatt a böngészőben "status 0"
      // hálózati hibaként megjelenő) elutasítaná (ld. Program.cs RateLimiting:Disabled).
      RateLimiting__Disabled: 'true',
    },
  });
  // A platform-admin felület (jelentkezések elbírálása, tanár-felfüggesztés, intézményi licencek) 2026-09-23 óta
  // az admin-fe + Admin API párosé - a tanári app /admin/* útvonalai megszűntek.
  await startDotnetService({
    name: 'Admin API',
    project: 'DigitalCulture.Admin.API',
    readyUrl: `${ADMIN_API_URL}/api/admin/health`,
    pidFile: ADMIN_API_PID_FILE,
    logFile: ADMIN_API_LOG_FILE,
    env: { Kestrel__Port: String(ADMIN_API_PORT) },
  });

  console.log('[global-setup] Kész — a webServer-ek (diák-fe/tanári-fe/admin-fe) indulhatnak, a backendek már futnak.');
}

/**
 * Megszakítja a futást, ha a backend portján MÁR figyel valami.
 *
 * Enélkül a suite csendben egy KORÁBBI futásból ottmaradt backend-példányhoz
 * beszél: a `dotnet run` nem tud bindolni, a health-check viszont zöld (a régi
 * példány válaszol), és a tesztek egy elavult binárist ellenőriznek. Ez pontosan
 * úgy néz ki, mintha az új kód nem működne - órákat lehet vele elmenni.
 *
 * A jelenség valós: egy elárvult (PPID=1) `dotnet run` gyerekfolyamat órákon át
 * kiszolgálta a suite-ot, mert a teardown csak a wrappert ölte meg.
 */
function assertPortFree(port: number): void {
  try {
    execFileSync('ss', ['-tlnp'], { encoding: 'utf-8' })
      .split('\n')
      .filter((line) => line.includes(`:${port} `))
      .forEach((line) => {
        throw new Error(
          `[global-setup] A ${port}-as porton MÁR figyel egy folyamat:\n  ${line.trim()}\n` +
          'Ez jellemzően egy korábbi futásból ottmaradt backend. Állítsd le, mielőtt újra futtatnád — ' +
          'különben a tesztek egy elavult binárist ellenőriznének.',
        );
      });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[global-setup]')) throw err;
    // Az `ss` hiánya nem ok a futás megszakítására - ilyenkor a `dotnet run`
    // bind-hibája fog szólni.
  }
}

interface DotnetService {
  name: string;
  project: string;
  readyUrl: string;
  pidFile: string;
  logFile: string;
  env: Record<string, string>;
}

async function startDotnetService(svc: DotnetService): Promise<void> {
  const logStream = fs.createWriteStream(svc.logFile, { flags: 'w' });
  const child = spawn('dotnet', ['run', '--project', svc.project], {
    cwd: BACKEND_REPO_PATH,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ConnectionStrings__PostgresConnection: DB_CONNECTION_STRING,
      // Csak az E2E-hez: a JWT-kulcs Development módban sincs a repóban (SEC-fix), User Secrets pedig a CT-n nincs -
      // enélkül minden bejelentkezés 500-at adott („JWT SecretKey nincs konfigurálva”).
      Authentication__SecretKey: 'e2e-only-jwt-secret-key-not-for-any-real-environment-0123456789',
      Authentication__RefreshSecretKey: 'e2e-only-jwt-refresh-secret-not-for-any-real-env-9876543210',
      ...svc.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  if (!child.pid) {
    throw new Error(`[global-setup] Nem sikerült elindítani: ${svc.name}.`);
  }
  fs.writeFileSync(svc.pidFile, String(child.pid));

  let exited: { code: number | null } | null = null;
  child.once('exit', (code) => {
    exited = { code };
  });

  const maxAttempts = 90;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (exited) {
      throw new Error(
        `[global-setup] ${svc.name}: a folyamat idő előtt kilépett (kód: ${exited.code}). Log: ${svc.logFile}`,
      );
    }
    if (await isHttpAvailable(svc.readyUrl)) {
      console.log(`[global-setup] ${svc.name} elérhető (${attempt}. próbálkozásra, log: ${svc.logFile}).`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`[global-setup] ${svc.name} nem állt készen a megadott időn belül. Log: ${svc.logFile}`);
}

function isHttpAvailable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function runDocker(args: string[], opts: { allowFailure?: boolean } = {}): void {
  try {
    execFileSync('docker', args, { stdio: 'inherit' });
  } catch (err) {
    if (!opts.allowFailure) throw err;
  }
}

async function waitForPostgresReady(): Promise<void> {
  const maxAttempts = 45;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // A pg_isready a TCP-socketen kérdez (-h 127.0.0.1): az initdb alatti ideiglenes, csak unix-socketes szerver
      // még nem számít késznek - különben a seed épp az újraindulás pillanatában kapcsolódna.
      execFileSync('docker', ['exec', DB_CONTAINER_NAME, 'pg_isready', '-h', '127.0.0.1', '-U', DB_USER, '-d', DB_NAME], { stdio: 'ignore' });
      console.log(`[global-setup] PostgreSQL (konténeren belül) kész (${attempt}. próbálkozásra).`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (attempt === maxAttempts) {
        throw new Error('[global-setup] A PostgreSQL nem állt készen a megadott időn belül (konténeren belüli teszt).');
      }
    }
  }

  // A konténeren BELÜLI készenlét nem garantálja, hogy a HOST felől (a backend nézőpontjából) a portmappelés is
  // azonnal elérhető — ezt egy valódi host-oldali TCP-kapcsolattal ellenőrizzük külön.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reachable = await canConnectTcp('127.0.0.1', DB_HOST_PORT);
    if (reachable) {
      console.log(`[global-setup] PostgreSQL host-oldalról (127.0.0.1:${DB_HOST_PORT}) is elérhető (${attempt}. próbálkozásra).`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`[global-setup] A PostgreSQL host-oldalról nem érhető el 127.0.0.1:${DB_HOST_PORT} címen a megadott időn belül.`);
}

function canConnectTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(2000);
    socket.once('connect', () => onDone(true));
    socket.once('timeout', () => onDone(false));
    socket.once('error', () => onDone(false));
    socket.connect(port, host);
  });
}
