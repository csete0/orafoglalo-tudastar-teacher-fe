import { test, expect } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import {
  acceptConfirmDialog,
  createLoggedInStudent,
  loginAsE2EAdmin,
  loginOnStudentApp,
  onboardApprovedTeacher,
} from '../helpers';

/**
 * Intézményi licenc ("seat"): egy iskola N helyet vásárol egy csomagból, és az
 * intézmény csoportjaihoz tartozó diákok bejelentkezéskor automatikusan
 * megkapják — amíg van szabad hely.
 *
 * Ez a spec a teljes láncot valódi böngészőn viszi végig: admin létrehozza a
 * licencet, a diák a saját bejelentkezésével kapja meg, a tanár a saját
 * csoportjánál látja és kezeli.
 *
 * A kapacitást SZÁNDÉKOSAN 1-re állítjuk: így egyszerre ellenőrizhető, hogy az
 * első diák megkapja, a második pedig nem — és hogy a tanár a "nem fért be"
 * listán ténylegesen látja a kimaradót, ami neki azonnali cselekvési információ.
 */
test('intézményi licenc: diák megkapja, tanár látja és az óra végén felszabadítja', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const principalContext = await browser.newContext();
  const studentAContext = await browser.newContext();
  const studentBContext = await browser.newContext();
  // A hely FOGLALÁSA a bejelentkezéskor történik, ezért a csoporthoz csatlakozás
  // UTÁN újra be kell lépni. Friss kontextusban tesszük, hogy ne kelljen a
  // kijelentkezés UI-jára támaszkodni.
  const studentAReloginContext = await browser.newContext();
  const studentBReloginContext = await browser.newContext();

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    // ── Igazgató + intézmény + intézményhez kötött csoport ──
    const principalPage = await principalContext.newPage();
    await onboardApprovedTeacher(principalPage, adminPage, { prefix: 'seat-principal' });

    const institutionName = `E2E Seat Intézmény ${Date.now()}`;
    await principalPage.goto(`${TEACHER_FE_URL}/intezmenyek`);
    await principalPage.locator('[formcontrolname="name"]').fill(institutionName);
    await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
    await expect(principalPage.getByText(institutionName)).toBeVisible({ timeout: 15000 });

    const groupName = `seat-group-${Date.now()}`;
    await principalPage.goto(`${TEACHER_FE_URL}/csoportok`);
    await principalPage.locator('[formcontrolname="name"]').fill(groupName);
    await principalPage.locator('[formcontrolname="schoolId"]').selectOption({ label: institutionName });
    await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
    await expect(principalPage.getByText(groupName)).toBeVisible({ timeout: 15000 });
    await principalPage.getByText(groupName).click();
    await principalPage.getByRole('tab', { name: 'Meghívó' }).click();
    const inviteCode = (await principalPage.locator('code').first().textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    // ── Admin prémium licencet ad az intézménynek, EGY hellyel ──
    await adminPage.goto(`${TEACHER_FE_URL}/admin/intezmenyek`);
    const schoolRow = adminPage.locator('li', { hasText: institutionName });
    await expect(schoolRow).toBeVisible({ timeout: 15000 });
    await schoolRow.getByRole('button', { name: '+ Új licenc' }).click();

    await schoolRow.locator('[name^="tier-"]').selectOption('premium');
    await schoolRow.locator('[name^="cap-"]').fill('1');
    await schoolRow.locator('[name^="note-"]').fill('E2E teszt-licenc');
    await schoolRow.getByRole('button', { name: 'Létrehozás' }).click();

    await expect(schoolRow.getByText(/Prémium/)).toBeVisible({ timeout: 15000 });
    await expect(schoolRow.getByText(/0\/1 hely használatban/)).toBeVisible({ timeout: 15000 });

    // ── "A" diák csatlakozik, majd újra belép -> megkapja a helyet ──
    const studentAPage = await studentAContext.newPage();
    const studentAEmail = await createLoggedInStudent(studentAPage, 'seat-student-a');
    await joinGroup(studentAPage, inviteCode!);

    const studentARelogin = await studentAReloginContext.newPage();
    await loginOnStudentApp(studentARelogin, studentAEmail);

    // A diák a profilján LÁTJA, honnan van a hozzáférése - enélkül prémium
    // funkciói lennének úgy, hogy a profilja "free"-t mutat.
    await studentARelogin.goto(`${STUDENT_FE_URL}/profile`);
    await expect(studentARelogin.getByText(/Iskolai licenc/)).toBeVisible({ timeout: 15000 });
    await expect(studentARelogin.getByText(institutionName)).toBeVisible({ timeout: 15000 });

    // ── "B" diák ugyanígy, de a hely már elfogyott ──
    const studentBPage = await studentBContext.newPage();
    const studentBEmail = await createLoggedInStudent(studentBPage, 'seat-student-b');
    await joinGroup(studentBPage, inviteCode!);

    const studentBRelogin = await studentBReloginContext.newPage();
    await loginOnStudentApp(studentBRelogin, studentBEmail);
    await studentBRelogin.goto(`${STUDENT_FE_URL}/profile`);
    await expect(studentBRelogin.getByText(/Iskolai licenc/)).toHaveCount(0);

    // ── A tanár a saját csoportjánál látja a helyzetet ──
    await principalPage.goto(`${TEACHER_FE_URL}/csoportok`);
    await principalPage.getByText(groupName).click();
    await principalPage.getByRole('tab', { name: 'Helyek' }).click();

    await expect(principalPage.getByText(/1\/1 hely használatban/)).toBeVisible({ timeout: 15000 });
    await expect(principalPage.getByText('Helyet használó diákok')).toBeVisible({ timeout: 15000 });
    // A kimaradó diák külön, cselekvésre hívó listában jelenik meg.
    await expect(principalPage.getByText(/Nem fért be \(1\)/)).toBeVisible({ timeout: 15000 });

    // ── "Óra vége": a csoport helyei felszabadulnak ──
    await principalPage.getByRole('button', { name: /Óra vége/ }).click();
    await acceptConfirmDialog(principalPage);

    await expect(principalPage.getByText(/1 hely felszabadítva/)).toBeVisible({ timeout: 15000 });
    await expect(principalPage.getByText(/0\/1 hely használatban/)).toBeVisible({ timeout: 15000 });
  } finally {
    await studentBReloginContext.close();
    await studentAReloginContext.close();
    await studentBContext.close();
    await studentAContext.close();
    await principalContext.close();
    await adminContext.close();
  }
});

async function joinGroup(page: import('@playwright/test').Page, inviteCode: string): Promise<void> {
  await page.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${inviteCode}`);
  await page.locator('#consent').check();
  await page.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
  await expect(page.locator('form').getByText('Sikeresen csatlakoztál!').or(page.getByText('Sikeresen csatlakoztál!').first()))
    .toBeVisible({ timeout: 15000 });
}
