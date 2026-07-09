import { test, expect } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import { createLoggedInStudent, loginAsE2EAdmin, onboardApprovedTeacher, uniqueEmail } from '../helpers';

test('magántanár csoportot hoz létre, diák meghívó kóddal csatlakozik, majd a tanár eltávolítja', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    const teacherPage = await teacherContext.newPage();
    await onboardApprovedTeacher(teacherPage, adminPage, { prefix: 'grouplc' });

    // ── Csoport létrehozása (intézmény nélkül — magántanár eset) ──
    const groupName = uniqueEmail('csoport').split('@')[0];
    await teacherPage.goto(`${TEACHER_FE_URL}/csoportok`);
    await teacherPage.locator('[formcontrolname="name"]').fill(groupName);
    await teacherPage.getByRole('button', { name: 'Létrehozás' }).click();

    await expect(teacherPage.getByText(groupName)).toBeVisible({ timeout: 15000 });
    await teacherPage.getByText(groupName).click();
    await expect(teacherPage).toHaveURL(/\/csoportok\/\d+/, { timeout: 15000 });

    // ── Meghívó kód kiolvasása ──
    await teacherPage.getByRole('button', { name: 'Meghívó' }).click();
    const inviteCode = (await teacherPage.locator('code').first().textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    // ── Diák csatlakozik a kóddal ──
    const studentPage = await studentContext.newPage();
    await createLoggedInStudent(studentPage, 'grouplc-student');

    await studentPage.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${inviteCode}`);
    await studentPage.locator('#consent').check();
    await studentPage.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
    await expect(studentPage.getByText('Sikeresen csatlakoztál!')).toBeVisible({ timeout: 15000 });
    await expect(studentPage.getByText(groupName)).toBeVisible();

    await studentPage.goto(`${STUDENT_FE_URL}/csoportjaim`);
    await expect(studentPage.getByText(groupName)).toBeVisible({ timeout: 15000 });

    // ── Tanár oldalán a "Tagok" fülön megjelenik a diák ──
    await teacherPage.getByRole('button', { name: 'Tagok' }).click();
    await expect(teacherPage.getByRole('button', { name: 'Eltávolítás' })).toBeVisible({ timeout: 15000 });

    // ── Eltávolítás (natív confirm dialógus) ──
    teacherPage.once('dialog', (dialog) => dialog.accept());
    await teacherPage.getByRole('button', { name: 'Eltávolítás' }).click();
    await expect(teacherPage.getByRole('button', { name: 'Eltávolítás' })).toHaveCount(0, { timeout: 15000 });

    // ── A diák "Csoportjaim" oldala már nem mutatja a csoportot ──
    await studentPage.goto(`${STUDENT_FE_URL}/csoportjaim`);
    await expect(studentPage.getByText(groupName)).toHaveCount(0, { timeout: 15000 });
  } finally {
    await studentContext.close();
    await teacherContext.close();
    await adminContext.close();
  }
});

test('érvénytelen meghívó kódnál hibaüzenetet kap a diák', async ({ page }) => {
  await createLoggedInStudent(page, 'invalidcode');

  await page.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=NOSUCHCODE`);
  await page.locator('#consent').check();
  await page.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();

  await expect(page.getByText(/Érvénytelen meghívó kód/)).toBeVisible({ timeout: 15000 });
});
