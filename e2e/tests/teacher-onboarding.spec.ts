import { test, expect } from '@playwright/test';
import { TEACHER_FE_URL } from '../constants';
import { loginAsE2EAdmin, loginOnTeacherApp, onboardApprovedTeacher, registerStudent, uniqueEmail } from '../helpers';

/**
 * A teljes tanárrá válási folyamat: diák regisztrál, jelentkezik tanárnak,
 * a platform-admin elbírálja, a jelöltnek frissül a szerepköre és belép
 * tanárként a dashboardra.
 *
 * FONTOS: minden manuálisan létrehozott browser.newContext()-et try/finally-
 * ben zárunk le — a specek egyetlen worker-en, egymás után futnak (workers:1),
 * és a `browser` fixture a teljes worker élettartamára megosztott. Ha egy
 * korábbi teszt hibázás esetén nyitva hagy kontextusokat, azok felhalmozódnak
 * és a KÉSŐBBI tesztek hálózati kéréseit is instabillá tehetik.
 */
test('regisztráció -> tanári jelentkezés -> admin elfogadás -> tanári dashboard', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const teacherContext = await browser.newContext();

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    const teacherPage = await teacherContext.newPage();
    const email = await onboardApprovedTeacher(teacherPage, adminPage, { prefix: 'onboarding' });

    await expect(teacherPage).toHaveURL(/\/dashboard/);

    // roleGuard('teacher') immár átenged egy korábban tanár-védett route-ra —
    // ez bizonyítja, hogy a frissített JWT tartalmazza a 'teacher' claimet.
    await teacherPage.goto(`${TEACHER_FE_URL}/csoportok`);
    await expect(teacherPage).toHaveURL(/\/csoportok/);
    expect(email).toContain('onboarding');
  } finally {
    await teacherContext.close();
    await adminContext.close();
  }
});

test('elutasított jelentkezés után a diák újra jelentkezhet indoklás megjelenítésével', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const teacherContext = await browser.newContext();

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    const teacherPage = await teacherContext.newPage();
    const email = uniqueEmail('rejected');
    await registerStudent(teacherPage, { email });
    await loginOnTeacherApp(teacherPage, email);
    await teacherPage.waitForURL(/\/jelentkezes/);

    await teacherPage.locator('#motivation').fill('Első próbálkozás — hiányos indoklás.');
    await teacherPage.getByRole('button', { name: 'Jelentkezés beküldése' }).click();
    await expect(teacherPage.getByText('Jelentkezésed elbírálás alatt.')).toBeVisible({ timeout: 15000 });

    await adminPage.goto(`${TEACHER_FE_URL}/admin/jelentkezesek`);
    const row = adminPage.locator('li', { hasText: email });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button', { name: 'Elutasítás' }).click();
    await row.locator('input[placeholder="Indoklás (opcionális)"]').fill('Nem elég részletes az indoklás.');
    await row.getByRole('button', { name: 'Megerősítés' }).click();

    await expect(teacherPage.getByText('A korábbi jelentkezésedet elutasítottuk.')).toBeVisible({ timeout: 15000 });
    await expect(teacherPage.getByText('Kiegészített bemutatkozással újra jelentkezhetsz.')).toBeVisible();
    // A form újra elérhető az elutasítás után
    await expect(teacherPage.locator('#motivation')).toBeVisible();
  } finally {
    await teacherContext.close();
    await adminContext.close();
  }
});
