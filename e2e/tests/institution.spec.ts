import { test, expect } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import { createLoggedInStudent, loginAsE2EAdmin, onboardApprovedTeacher } from '../helpers';

/**
 * A teljes intézményi (F6.5) flow két tanárral: az igazgató intézményt hoz
 * létre, a kolléga tanári kóddal csatlakozik és a csoportját az
 * intézményhez köti, majd a diák a KOLLÉGA csoportjába lépve is eléri az
 * IGAZGATÓ publikált tartalmát (intézményen belüli tartalom-megosztás) —
 * ez az F6.5 legfontosabb új garanciája. Kilépéskor a megosztás megszűnik.
 */
test('intézményi tartalom-megosztás: igazgató + kolléga tanár + diák, majd kilépés megszünteti a hozzáférést', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const principalContext = await browser.newContext();
  const colleagueContext = await browser.newContext();
  const studentContext = await browser.newContext();

  try {
  const adminPage = await adminContext.newPage();
  await loginAsE2EAdmin(adminPage);

  // ── Igazgató (intézmény-létrehozó) onboardingja ──
  const principalPage = await principalContext.newPage();
  await onboardApprovedTeacher(principalPage, adminPage, { prefix: 'principal' });

  const institutionName = `E2E Intézmény ${Date.now()}`;
  await principalPage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await principalPage.locator('[formcontrolname="name"]').fill(institutionName);
  await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(principalPage.getByText(institutionName)).toBeVisible({ timeout: 15000 });
  await principalPage.getByText(institutionName).click();
  await expect(principalPage.getByText('A szereped: Igazgató')).toBeVisible({ timeout: 15000 });

  const teacherInviteCode = (await principalPage.locator('code').first().textContent())?.trim();
  expect(teacherInviteCode).toBeTruthy();

  // ── Kolléga tanár onboardingja + csatlakozás tanári kóddal ──
  const colleaguePage = await colleagueContext.newPage();
  await onboardApprovedTeacher(colleaguePage, adminPage, { prefix: 'colleague' });

  await colleaguePage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await colleaguePage.locator('[formcontrolname="code"]').fill(teacherInviteCode!);
  await colleaguePage.getByRole('button', { name: 'Csatlakozás' }).click();
  await expect(colleaguePage.getByText(institutionName)).toBeVisible({ timeout: 15000 });

  // ── Kolléga csoportot hoz létre, az intézményhez kötve ──
  const groupName = `institution-group-${Date.now()}`;
  await colleaguePage.goto(`${TEACHER_FE_URL}/csoportok`);
  await colleaguePage.locator('[formcontrolname="name"]').fill(groupName);
  await colleaguePage.locator('[formcontrolname="schoolId"]').selectOption({ label: institutionName });
  await colleaguePage.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(colleaguePage.getByText(groupName)).toBeVisible({ timeout: 15000 });
  await colleaguePage.getByText(groupName).click();
  await colleaguePage.getByRole('button', { name: 'Meghívó' }).click();
  const groupInviteCode = (await colleaguePage.locator('code').first().textContent())?.trim();

  // ── Igazgató feladatsort ír és publikál (intézményi megosztás confirm) ──
  const taskSetTitle = `E2E Igazgató feladatsor ${Date.now()}`;
  await principalPage.goto(`${TEACHER_FE_URL}/feladatsorok`);
  await principalPage.locator('[formcontrolname="title"]').fill(taskSetTitle);
  await principalPage.locator('[formcontrolname="description"]').fill('Igazgatói feladatsor E2E teszthez.');
  await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
  await principalPage.waitForURL(/\/feladatsorok\/\d+\/szerkesztes/, { timeout: 15000 });

  await principalPage.locator('[name="newTaskTitle"]').fill('Igazgatói feladat');
  await principalPage.locator('[name="newTaskDescription"]').fill('Igazgatói feladat leírása.');
  await principalPage.getByRole('button', { name: 'Hozzáadás' }).click();
  await expect(principalPage.getByText('1. Igazgatói feladat')).toBeVisible({ timeout: 15000 });
  await principalPage.getByText('1. Igazgatói feladat').click();

  await principalPage.locator('[name="newSolutionDescription"]').fill('Igazgatói részfeladat');
  await principalPage.getByRole('button', { name: 'Hozzáadás' }).nth(0).click();

  const saveSnippetsButton = principalPage.getByRole('button', { name: 'Kódrészletek mentése' });
  // Python az első nyelv a rácsban (nem igényel fájl-párosítást, mint az SQL) —
  // a mentés gombhoz képest közvetlenül megelőző rács-div első textarea-ja.
  const snippetGrid = saveSnippetsButton.locator('xpath=preceding-sibling::div[1]');
  const pythonTextarea = snippetGrid.locator('textarea').first();
  await pythonTextarea.fill('print("hello")');
  await expect(pythonTextarea).toHaveValue('print("hello")');
  await saveSnippetsButton.click();

  principalPage.once('dialog', (dialog) => dialog.accept());
  await principalPage.getByRole('button', { name: 'Publikálás' }).click();
  await expect(principalPage.getByRole('button', { name: 'Publikálva' })).toBeVisible({ timeout: 15000 });

  // ── Diák a KOLLÉGA csoportjába lép be ──
  const studentPage = await studentContext.newPage();
  await createLoggedInStudent(studentPage, 'institution-student');

  await studentPage.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${groupInviteCode}`);
  await studentPage.locator('#consent').check();
  await studentPage.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
  await expect(studentPage.getByText('Sikeresen csatlakoztál!')).toBeVisible({ timeout: 15000 });

  // ── A diák eléri az IGAZGATÓ (nem a saját csoport-tanára) feladatsorát ──
  await studentPage.goto(`${STUDENT_FE_URL}/categories`);
  await expect(studentPage.getByText('Csoportjaim feladatsorai')).toBeVisible({ timeout: 15000 });
  await expect(studentPage.getByText(taskSetTitle)).toBeVisible({ timeout: 15000 });

  // ── Intézményi ranglista fül elérhető a diáknak ──
  await studentPage.goto(`${STUDENT_FE_URL}/leaderboard`);
  await expect(studentPage.getByRole('button', { name: 'Iskolám' })).toBeVisible({ timeout: 15000 });

  // ── Igazgató Áttekintés füle látja a diákot ──
  await principalPage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await principalPage.getByText(institutionName).click();
  await principalPage.getByRole('button', { name: 'Áttekintés' }).click();
  await expect(principalPage.getByText('Teszt').first()).toBeVisible({ timeout: 15000 });

  // ── A kolléga (sima tag) NEM lát Áttekintés/Csoportok fület ──
  await colleaguePage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await colleaguePage.getByText(institutionName).click();
  await expect(colleaguePage.getByText('A szereped: Tanár')).toBeVisible({ timeout: 15000 });
  await expect(colleaguePage.getByRole('button', { name: 'Áttekintés' })).toHaveCount(0);
  await expect(colleaguePage.getByRole('button', { name: 'Csoportok' })).toHaveCount(0);

  // ── Kolléga kilép az intézményből ──
  colleaguePage.once('dialog', (dialog) => dialog.accept());
  await colleaguePage.getByRole('main').getByRole('button', { name: 'Kilépés' }).click();
  await expect(colleaguePage).toHaveURL(/\/intezmenyek$/, { timeout: 15000 });

  // ── A diák elveszti a hozzáférést az igazgató tartalmához ──
  await studentPage.goto(`${STUDENT_FE_URL}/categories`);
  await expect(studentPage.getByText(taskSetTitle)).toHaveCount(0, { timeout: 15000 });
  } finally {
    await studentContext.close();
    await colleagueContext.close();
    await principalContext.close();
    await adminContext.close();
  }
});
