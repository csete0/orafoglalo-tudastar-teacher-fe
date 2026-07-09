import path from 'node:path';
import os from 'node:os';

/**
 * Az E2E-futtatás a NORMÁL dev portokat használja (backend 7083, diák-fe 4200,
 * tanári-fe 4300) — ugyanazokat, amiket a diák-fe environment.ts fixen
 * hardcode-ol (apiUrl: http://localhost:7083/api). Emiatt E2E közben nem
 * futtatható párhuzamosan egy normál dev session (állítsd le előtte).
 *
 * A backend portja ténylegesen konfigurálható (Kestrel:Port env var, ld.
 * Program.cs) elszigetelt futtatáshoz, de ehhez a diák-fe/tanári-fe
 * environment.ts fájljainak is külön E2E-buildkonfigurációt kellene kapniuk —
 * ez jelenleg nincs bekötve, ld. README "Elszigetelt portok" szakasz.
 */
export const BACKEND_PORT = 7083;
export const STUDENT_FE_PORT = 4200;
export const TEACHER_FE_PORT = 4300;

export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
export const STUDENT_FE_URL = `http://localhost:${STUDENT_FE_PORT}`;
export const TEACHER_FE_URL = `http://localhost:${TEACHER_FE_PORT}`;

export const DB_CONTAINER_NAME = 'tudastar-e2e-db';
export const DB_HOST_PORT = 14330;
export const DB_NAME = 'tudastar_e2e';
export const DB_SA_PASSWORD = 'E2eSaPassw0rd!';

export const DB_SERVER_CONNECTION_STRING =
  `Server=localhost,${DB_HOST_PORT};User Id=sa;Password=${DB_SA_PASSWORD};` +
  `TrustServerCertificate=True;Connection Timeout=60;`;

export const DB_CONNECTION_STRING = `${DB_SERVER_CONNECTION_STRING}Initial Catalog=${DB_NAME};`;

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
