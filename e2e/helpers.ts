import { Page, APIRequestContext, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  BACKEND_URL,
  DB_CONTAINER_NAME,
  DB_NAME,
  DB_SA_PASSWORD,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  STUDENT_FE_URL,
  TEACHER_FE_URL,
} from './constants';

export const TEST_PASSWORD = 'TestPassw0rd!1';

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

// ── Direkt DB-hozzáférés (csak az email-megerősítés áthidalására — nincs
//    email-kliens a tesztkörnyezetben, minden más UI-n át történik) ──
function runSql(sql: string): void {
  execFileSync(
    'docker',
    [
      'exec', DB_CONTAINER_NAME,
      '/opt/mssql-tools18/bin/sqlcmd',
      // -I: SET QUOTED_IDENTIFIER ON. A `dbo.Users` táblán SZŰRT indexek vannak
      // (UQ_Users_DiscordId, UQ_Users_Nickname), és SQL Server minden ilyen táblán
      // végzett DML-hez megköveteli ezt a beállítást - a sqlcmd viszont alapból
      // OFF-fal csatlakozik. A `confirmEmail` UPDATE-je emiatt csendben elhasalt
      // ("Msg 1934 ... QUOTED_IDENTIFIER"), a diák e-mailje sosem lett megerősítve,
      // és a rákövetkező bejelentkezés "Email cím nincs megerősítve"-vel bukott.
      //
      // -b: SQL-hiba esetén NEM nulla kilépési kód. Enélkül a sqlcmd sikert jelez
      // hibás utasításra is, az execFileSync nem dob, és a hiba láthatatlan marad -
      // pontosan ezért maradt ez a hiba észrevétlen (a `stdio: 'ignore'` pedig az
      // üzenetet is elrejtette).
      '-I', '-b',
      '-S', 'localhost', '-U', 'sa', '-P', DB_SA_PASSWORD, '-C', '-d', DB_NAME,
      '-Q', sql,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}


export function confirmEmail(email: string): void {
  runSql(`UPDATE dbo.Users SET EmailConfirmed = 1 WHERE Email = N'${email.replace(/'/g, "''")}';`);
}

/**
 * A `ConfirmService` dialógusának elfogadása.
 *
 * A suite megírása (2026-07-10) óta több, következményekkel járó művelet mögé
 * került megerősítő dialógus (intézményhez csatlakozás, tag eltávolítása, tanár
 * felfüggesztése, publikálás visszavonása). A specek ezekről nem tudtak: a
 * kattintás után azonnal az eredményt várták, a dialógus viszont nyitva maradt,
 * és a teszt 60 mp-es timeouttal halt el.
 *
 * A `data-testid` horgonyokat használjuk, nem a gombfeliratot: a felirat
 * műveletenként más ("Csatlakozás", "Eltávolítás", "Felfüggesztés"), a testid
 * viszont stabil.
 */
export async function acceptConfirmDialog(page: Page): Promise<void> {
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await page.getByTestId('confirm-accept').click();
  await expect(dialog).toHaveCount(0, { timeout: 15000 });
}

// ── Diák oldal ──────────────────────────────────────────────────────────

export async function registerStudent(
  page: Page,
  opts: { email: string; firstName?: string; lastName?: string },
): Promise<void> {
  await page.goto(`${STUDENT_FE_URL}/registration`);
  await page.locator('#firstName').fill(opts.firstName ?? 'Teszt');
  await page.locator('#lastName').fill(opts.lastName ?? 'Diák');
  await page.locator('#email').fill(opts.email);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.locator('#confirmPassword').fill(TEST_PASSWORD);
  await page.locator('#terms').check();

  // UI-TS-374 (2026-08-17) óta a regisztrációs form Cloudflare Turnstile mögött van, és
  // a `signUp()` token nélkül csak egy toastot dob ("Kérjük, igazold, hogy nem vagy
  // robot!") - navigáció nélkül. Ez a suite régebbi (2026-07-10), ezért azonnal
  // kattintott, jellemzően MIELŐTT a widget kiadta volna a tokent: emiatt mind a 8
  // UI-teszt pontosan itt, a `waitForURL`-en bukott el, holott a hibaképernyőn a
  // Turnstile már "Success!"-t mutatott.
  //
  // A dev/E2E environment Cloudflare mindig-átengedő teszt-kulcsát használja
  // (`1x00000000000000000000AA`), tehát nincs mit "megoldani" - csak meg kell várni,
  // amíg a widget beírja a válasz-tokent a rejtett mezőjébe.
  await expect(page.locator('input[name="cf-turnstile-response"]'))
    .not.toHaveValue('', { timeout: 30000 });

  await page.getByRole('button', { name: 'Felhasználói fiók létrehozása' }).click();
  await page.waitForURL(/confirm-email/, { timeout: 15000 });
  confirmEmail(opts.email);
}

export async function loginOnStudentApp(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto(`${STUDENT_FE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Bejelentkezés' }).click();
  await page.waitForURL(/\/home$/, { timeout: 15000 });
}

/** Regisztrál + megerősíti az email-t + bejelentkezik a diák appban. Visszaadja az email-t. */
export async function createLoggedInStudent(page: Page, prefix = 'student'): Promise<string> {
  const email = uniqueEmail(prefix);
  await registerStudent(page, { email });
  await loginOnStudentApp(page, email);
  return email;
}

// ── Tanári oldal ────────────────────────────────────────────────────────

export async function loginOnTeacherApp(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto(`${TEACHER_FE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Belépés', exact: true }).click();
  await page.waitForURL(/\/(dashboard|jelentkezes)/, { timeout: 15000 });
}

export async function loginAsE2EAdmin(page: Page): Promise<void> {
  await loginOnTeacherApp(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
}

/**
 * Teljes tanári onboarding: diák regisztráció -> jelentkezés a tanári appban
 * -> platform-admin (külön lapon) elfogadja -> "Belépés tanárként".
 * A híváskor átadott `adminPage`-nek MÁR be kell lépnie admin-ként (ld.
 * loginAsE2EAdmin) — ezt a hívó tartja fenn, hogy több tanár onboardingja
 * ugyanazt az admin-lapot újrahasználhassa.
 */
export async function onboardApprovedTeacher(
  teacherPage: Page,
  adminPage: Page,
  opts: { prefix?: string; motivation?: string } = {},
): Promise<string> {
  const email = uniqueEmail(opts.prefix ?? 'teacher');

  await registerStudent(teacherPage, { email });
  await loginOnTeacherApp(teacherPage, email);
  await teacherPage.waitForURL(/\/jelentkezes/, { timeout: 15000 });

  await teacherPage.locator('#motivation').fill(
    opts.motivation ?? 'E2E teszt jelentkezés — szeretnék feladatsorokat feltölteni a diákjaimnak.',
  );
  await teacherPage.getByRole('button', { name: 'Jelentkezés beküldése' }).click();
  await expect(teacherPage.getByText('Jelentkezésed elbírálás alatt.')).toBeVisible({ timeout: 15000 });

  await adminPage.goto(`${TEACHER_FE_URL}/admin/jelentkezesek`);
  const row = adminPage.locator('li', { hasText: email });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: 'Elfogadás' }).click();
  await expect(row).toHaveCount(0, { timeout: 15000 });

  // A jelentkezés-oldal 5mp-enként pollozza a státuszt — várjuk meg az elfogadást.
  await expect(teacherPage.getByText('Tanári jelentkezésed elfogadva!')).toBeVisible({ timeout: 15000 });
  await teacherPage.getByRole('button', { name: 'Belépés tanárként' }).click();
  await teacherPage.waitForURL(/\/dashboard/, { timeout: 15000 });

  return email;
}

// ── API-szintű segédletek (láthatóság-tesztekhez) ──────────────────────

export async function getAccessTokenFromStorage(page: Page, key: 'access_token' | 'teacher_access_token'): Promise<string> {
  const token = await page.evaluate((k) => localStorage.getItem(k), key);
  if (!token) throw new Error(`Nincs access token localStorage-ban (kulcs: ${key})`);
  return token;
}

export async function apiGet(request: APIRequestContext, token: string, path: string) {
  return request.get(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function minimalPdfBuffer(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n' +
    '%%EOF',
    'utf-8',
  );
}
