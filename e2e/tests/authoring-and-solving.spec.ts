import { test, expect } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import { createLoggedInStudent, loginAsE2EAdmin, onboardApprovedTeacher } from '../helpers';

/**
 * A teljes tartalom-készítési kör: tanár SQL-feladatsort ír (create.sql +
 * create_lite.sql párral, ahogy a Judge0/SQLite konvenció megköveteli) és
 * publikálja; egy csoporttag diák (előfizetés NÉLKÜL) eléri a katalógusból.
 *
 * SZÁNDÉKOS HATÓKÖR-SZŰKÍTÉS: a tényleges vizsga-beadás (Judge0 kód-futtatás,
 * pontozás) NEM ennek a fázisnak a felelőssége — az a platform már meglévő,
 * ettől független funkciója, saját teszt-lefedettséggel. Ami ÚJ és emiatt itt
 * bizonyítandó: hogy egy tanári, nem-publikus feladatsor egy csoporttag
 * diáknak ELŐFIZETÉS NÉLKÜL is megnyílik (Fázis 5 láthatósági garancia), és
 * hogy a tanári eredmény-mátrix/ranglista integráció látja a csoporttagot.
 */
test('SQL-feladatsor create.sql+lite párral publikálva, csoporttag diák eléri, tanár látja a riportban', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();

  try {
  const adminPage = await adminContext.newPage();
  await loginAsE2EAdmin(adminPage);

  const teacherPage = await teacherContext.newPage();
  await onboardApprovedTeacher(teacherPage, adminPage, { prefix: 'authoring' });

  // ── Feladatsor létrehozása ──
  const taskSetTitle = `E2E SQL feladatsor ${Date.now()}`;
  await teacherPage.goto(`${TEACHER_FE_URL}/feladatsorok`);
  await teacherPage.locator('[formcontrolname="title"]').fill(taskSetTitle);
  await teacherPage.locator('[formcontrolname="description"]').fill('E2E teszt SQL feladatsor.');
  await teacherPage.getByRole('button', { name: 'Létrehozás' }).click();
  await teacherPage.waitForURL(/\/feladatsorok\/\d+\/szerkesztes/, { timeout: 15000 });

  // ── Feladat hozzáadása az SQL blokkban (típusonként külön, összecsukható
  //    szekció + saját "Új feladat" űrlap — a típus a szekció, nem választógomb) ──
  await teacherPage.locator('[name="newTaskTitle-5"]').fill('Feladat egy');
  await teacherPage.locator('[name="newTaskDescription-5"]').fill('Írj egy SELECT lekérdezést.');
  const sqlAddForm = teacherPage.locator('form', { has: teacherPage.locator('[name="newTaskTitle-5"]') });
  await sqlAddForm.getByRole('button', { name: 'Hozzáadás' }).click();

  await expect(teacherPage.getByText('1. Feladat egy')).toBeVisible({ timeout: 15000 });
  await teacherPage.getByText('1. Feladat egy').click();

  // ── Részfeladat (megoldás) hozzáadása ──
  // A "Hozzáadás" gomb szövege több formmal is megegyezik (típusonkénti "új
  // feladat" formok + ez a részfeladat-form) — a formot a benne lévő
  // newSolutionDescription mező alapján azonosítjuk egyértelműen.
  await teacherPage.locator('[name="newSolutionDescription"]').fill('Listázd az összes felhasználót.');
  await teacherPage.locator('[name="newSolutionPoints"]').fill('10');
  const solutionAddForm = teacherPage.locator('form', { has: teacherPage.locator('[name="newSolutionDescription"]') });
  await solutionAddForm.getByRole('button', { name: 'Hozzáadás' }).click();

  // ── SQL kódrészlet kitöltése + mentés ──
  const saveSnippetsButton = teacherPage.getByRole('button', { name: 'Kódrészletek mentése' });
  const sqlTextarea = saveSnippetsButton.locator('xpath=preceding::textarea[1]');
  await sqlTextarea.fill('SELECT * FROM Users;');
  await saveSnippetsButton.click();

  // ── SQL-párosítási figyelmeztetés látszik (még nincs fájl feltöltve) ──
  await expect(teacherPage.locator('p.text-warning')).toBeVisible({ timeout: 15000 });

  // ── create.sql + create_lite.sql feltöltése ──
  const createSqlInput = teacherPage.locator('label', { hasText: 'create.sql' }).locator('xpath=following-sibling::input[@type="file"]');
  const createLiteSqlInput = teacherPage.locator('label', { hasText: 'create_lite.sql' }).locator('xpath=following-sibling::input[@type="file"]');

  await createSqlInput.setInputFiles({
    name: 'create.sql', mimeType: 'application/sql',
    buffer: Buffer.from('CREATE TABLE Users (Id INT PRIMARY KEY, Name NVARCHAR(100));', 'utf-8'),
  });
  await expect(teacherPage.getByText('create.sql (', { exact: false })).toBeVisible({ timeout: 15000 });

  await createLiteSqlInput.setInputFiles({
    name: 'create_lite.sql', mimeType: 'application/sql',
    buffer: Buffer.from('CREATE TABLE Users (Id INTEGER PRIMARY KEY, Name TEXT);', 'utf-8'),
  });
  await expect(teacherPage.locator('p.text-warning')).toHaveCount(0, { timeout: 15000 });

  // ── Publikálás (magántanár — nincs intézmény, nincs megerősítő dialógus) ──
  await teacherPage.getByRole('button', { name: 'Publikálás' }).click();
  await expect(teacherPage.getByRole('button', { name: 'Publikálva' })).toBeVisible({ timeout: 15000 });

  const taskSetUrl = teacherPage.url();
  const taskSetId = taskSetUrl.match(/feladatsorok\/(\d+)\//)?.[1];
  expect(taskSetId).toBeTruthy();

  // ── Csoport létrehozása + meghívó kód ──
  const groupName = `authoring-${Date.now()}`;
  await teacherPage.goto(`${TEACHER_FE_URL}/csoportok`);
  await teacherPage.locator('[formcontrolname="name"]').fill(groupName);
  await teacherPage.getByRole('button', { name: 'Létrehozás' }).click();
  await teacherPage.getByText(groupName).click();
  await teacherPage.getByRole('button', { name: 'Meghívó' }).click();
  const inviteCode = (await teacherPage.locator('code').first().textContent())?.trim();

  // ── Diák csatlakozik, előfizetés NÉLKÜL ──
  const studentPage = await studentContext.newPage();
  await createLoggedInStudent(studentPage, 'authoring-student');

  await studentPage.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${inviteCode}`);
  await studentPage.locator('#consent').check();
  await studentPage.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
  await expect(studentPage.getByText('Sikeresen csatlakoztál!')).toBeVisible({ timeout: 15000 });

  // ── A katalógusban megjelenik a tanár feladatsora, és megnyitható ──
  await studentPage.goto(`${STUDENT_FE_URL}/categories`);
  await expect(studentPage.getByText('Csoportjaim feladatsorai')).toBeVisible({ timeout: 15000 });
  await expect(studentPage.getByText(taskSetTitle)).toBeVisible();
  await studentPage.getByText(taskSetTitle).click();

  await studentPage.waitForURL(/\/categories\/\d+\/task-sets\/\d+/, { timeout: 15000 });
  // Nincs 403/hiba-átirányítás — a Fázis 5 láthatósági predikátum előfizetés
  // nélkül is átengedte a csoporttagot a tanári (nem publikus) tartalomhoz.
  await expect(studentPage.getByText('Nincs hozzáférés', { exact: false })).toHaveCount(0);

  // ── Tanár oldalán az eredmény-mátrix mutatja a csoporttagot ──
  // A regisztráció (registerStudent) alapértelmezett keresztneve "Teszt",
  // ez jelenik meg a táblázatban az email helyett.
  await teacherPage.goto(`${TEACHER_FE_URL}/feladatsorok/${taskSetId}/eredmenyek`);
  await expect(teacherPage.locator('tr', { hasText: 'Teszt' }).first()).toBeVisible({ timeout: 15000 });
  } finally {
    await studentContext.close();
    await teacherContext.close();
    await adminContext.close();
  }
});
