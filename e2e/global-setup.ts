import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as http from 'node:http';
import {
  BACKEND_LOG_FILE,
  BACKEND_PID_FILE,
  BACKEND_REPO_PATH,
  BACKEND_URL,
  DB_CONNECTION_STRING,
  DB_CONTAINER_NAME,
  DB_HOST_PORT,
  DB_SA_PASSWORD,
  DB_SERVER_CONNECTION_STRING,
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

  console.log(`[global-setup] SQL Server 2022 konténer indítása (port ${DB_HOST_PORT})...`);
  runDocker([
    'run', '-d',
    '--name', DB_CONTAINER_NAME,
    '-p', `${DB_HOST_PORT}:1433`,
    '-e', 'ACCEPT_EULA=Y',
    '-e', `MSSQL_SA_PASSWORD=${DB_SA_PASSWORD}`,
    'mcr.microsoft.com/mssql/server:2022-latest',
  ]);

  await waitForSqlServerReady();

  console.log('[global-setup] Séma deploy + seed (DigitalCulture.E2ESeed)...');
  execFileSync(
    'dotnet',
    ['run', '--project', 'DigitalCulture.E2ESeed', '--', DB_SERVER_CONNECTION_STRING],
    { cwd: BACKEND_REPO_PATH, stdio: 'inherit' },
  );

  fs.mkdirSync(TEACHER_FILES_ROOT, { recursive: true });

  console.log('[global-setup] Backend indítása (a séma+seed már kész)...');
  await startBackend();

  console.log('[global-setup] Kész — a webServer-ek (diák-fe/tanári-fe) indulhatnak, a backend már fut.');
}

async function startBackend(): Promise<void> {
  const logStream = fs.createWriteStream(BACKEND_LOG_FILE, { flags: 'w' });
  const child = spawn('dotnet', ['run', '--project', 'DigitalCulture.API'], {
    cwd: BACKEND_REPO_PATH,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ConnectionStrings__DefaultConnection: DB_CONNECTION_STRING,
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
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  if (!child.pid) {
    throw new Error('[global-setup] Nem sikerült elindítani a backend folyamatot.');
  }
  fs.writeFileSync(BACKEND_PID_FILE, String(child.pid));

  let exited: { code: number | null } | null = null;
  child.once('exit', (code) => {
    exited = { code };
  });

  const maxAttempts = 90;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (exited) {
      throw new Error(
        `[global-setup] A backend folyamat idő előtt kilépett (kód: ${exited.code}). Log: ${BACKEND_LOG_FILE}`,
      );
    }
    if (await isHttpAvailable(`${BACKEND_URL}/api/roles`)) {
      console.log(`[global-setup] Backend elérhető (${attempt}. próbálkozásra, log: ${BACKEND_LOG_FILE}).`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `[global-setup] A backend nem állt készen a megadott időn belül. Log: ${BACKEND_LOG_FILE}`,
  );
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

async function waitForSqlServerReady(): Promise<void> {
  const maxAttempts = 45;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execFileSync(
        'docker',
        [
          'exec', DB_CONTAINER_NAME,
          '/opt/mssql-tools18/bin/sqlcmd',
          '-S', 'localhost', '-U', 'sa', '-P', DB_SA_PASSWORD, '-C',
          '-Q', 'SELECT 1',
        ],
        { stdio: 'ignore' },
      );
      console.log(`[global-setup] SQL Server (konténeren belül) kész (${attempt}. próbálkozásra).`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (attempt === maxAttempts) {
        throw new Error('[global-setup] SQL Server nem állt készen a megadott időn belül (konténeren belüli teszt).');
      }
    }
  }

  // A konténeren BELÜLI készenlét nem garantálja, hogy a HOST felől (a
  // backend nézőpontjából) a portmappelés is azonnal elérhető — ezt egy
  // valódi host-oldali TCP-kapcsolattal ellenőrizzük külön.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reachable = await canConnectTcp('127.0.0.1', DB_HOST_PORT);
    if (reachable) {
      console.log(`[global-setup] SQL Server host-oldalról (127.0.0.1:${DB_HOST_PORT}) is elérhető (${attempt}. próbálkozásra).`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`[global-setup] SQL Server host-oldalról nem érhető el 127.0.0.1:${DB_HOST_PORT} címen a megadott időn belül.`);
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
