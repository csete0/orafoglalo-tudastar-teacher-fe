import path from 'node:path';
import os from 'node:os';

/**
 * Elszigetelt E2E-portok (2026-10-24): a staging CT-n a 7083 (backend) és a 4300 (tanári-fe) a staging példányoké -
 * a suite azokkal ütközött, és futtatáshoz le kellett állítani a stagingot. A backend a Kestrel__Port env varral, a két
 * frontend a saját `e2e` build-konfigurációjával (environment.e2e.ts: apiUrl → localhost:17083) indul ezeken a portokon;
 * a backend Development CORS-a a 4210/4310 origint engedi. Egy normál dev session (7083/4200/4300) mellette futhat.
 */
export const BACKEND_PORT = 17083;
export const STUDENT_FE_PORT = 4210;
export const TEACHER_FE_PORT = 4310;

// 2026-09-23 óta a platform-admin oldalak a külön admin-fe-ben vannak, ami a külön Admin API-t hívja.
// Az Admin API-n nincs CORS: az admin-fe relatív `/api/admin` címet használ (production env), a dev-szerver
// proxyja (e2e/admin-proxy.json - a portot ott is módosítsd) továbbítja, mint stagingen/élesen az nginx.
// Saját portok (nem 4400/7090), mert a staging CT-n azokon a staging admin-fe/Admin API fut.
export const ADMIN_API_PORT = 17090;
export const ADMIN_FE_PORT = 14400;

export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
export const ADMIN_API_URL = `http://localhost:${ADMIN_API_PORT}`;
export const STUDENT_FE_URL = `http://localhost:${STUDENT_FE_PORT}`;
export const TEACHER_FE_URL = `http://localhost:${TEACHER_FE_PORT}`;
export const ADMIN_FE_URL = `http://localhost:${ADMIN_FE_PORT}`;

// Eldobható PostgreSQL 17 (a Patricks 2026-09 óta csak Postgresen fut; az SQL Server-út megszűnt).
export const DB_CONTAINER_NAME = 'tudastar-e2e-db';
export const DB_HOST_PORT = 15433;
export const DB_NAME = 'tudastar_e2e';
export const DB_USER = 'postgres';
export const DB_PASSWORD = 'E2ePgPassw0rd!';

export const DB_CONNECTION_STRING =
  `Host=127.0.0.1;Port=${DB_HOST_PORT};Database=${DB_NAME};Username=${DB_USER};Password=${DB_PASSWORD};Timeout=60;`;

export const E2E_ADMIN_EMAIL = 'e2e-admin@example.com';
export const E2E_ADMIN_PASSWORD = 'E2eAdmin123!';

/**
 * A backend repó elérési útja — alapértelmezésben testvér-mappa (mindkét repó
 * E:\Repos alatt), a projekt teljes multi-repo elrendezésének megfelelően.
 * Felülírható E2E_BACKEND_REPO_PATH env var-ral, ha valakinél máshol van.
 */
export const BACKEND_REPO_PATH =
  process.env['E2E_BACKEND_REPO_PATH'] ?? path.resolve(__dirname, '..', '..', 'orafoglalo-tudastar-be');

export const STUDENT_FE_REPO_PATH =
  process.env['E2E_STUDENT_FE_REPO_PATH'] ?? path.resolve(__dirname, '..', '..', 'orafoglalo-tudastar-fe');

export const ADMIN_FE_REPO_PATH =
  process.env['E2E_ADMIN_FE_REPO_PATH'] ?? path.resolve(__dirname, '..', '..', 'orafoglalo-tudastar-admin-fe');

export const TEACHER_FILES_ROOT =
  process.env['E2E_TEACHER_FILES_ROOT'] ?? path.resolve(os.tmpdir(), 'tudastar-e2e-teacher-files');

/**
 * A backend folyamat PID-jét ide írjuk ki global-setup-ban, hogy a
 * global-teardown (más Node-folyamat-példányban is futhat) meg tudja
 * találni és le tudja állítani. Lásd README "Playwright végrehajtási
 * sorrend" szakaszát: a webServer-plugin ELŐBB indul, mint a globalSetup
 * fájl, ezért a backendet NEM a webServer configon át indítjuk (az korán,
 * a DB-seedelés előtt próbálná elindítani), hanem itt, manuálisan.
 */
export const BACKEND_PID_FILE = path.resolve(os.tmpdir(), 'tudastar-e2e-backend.pid');
export const BACKEND_LOG_FILE = path.resolve(os.tmpdir(), 'tudastar-e2e-backend.log');
export const ADMIN_API_PID_FILE = path.resolve(os.tmpdir(), 'tudastar-e2e-admin-api.pid');
export const ADMIN_API_LOG_FILE = path.resolve(os.tmpdir(), 'tudastar-e2e-admin-api.log');
