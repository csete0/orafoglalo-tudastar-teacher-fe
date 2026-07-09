import { test, expect } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import { apiGet, createLoggedInStudent, getAccessTokenFromStorage, loginAsE2EAdmin, onboardApprovedTeacher } from '../helpers';

/**
 * A Fázis 5 láthatósági garancia negatív iránya: egy tanári (nem publikus)
 * feladatsor csak a tanár csoportjainak (ill. F6.5 óta az intézményének)
 * tagjai számára érhető el. Itt a `/api/my-groups/task-sets` végpontot
 * hívjuk KÖZVETLENÜL a diák saját, valós bearer tokenjével — ez a backend
 * jogosultsági kaput teszteli, nem csak azt, hogy a UI hova mutat linket.
 */
test('nem-csoporttag és másik csoport tagja sem éri el a tanári feladatsort — csak a valódi tag igen', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  const otherTeacherContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const outsiderContext = await browser.newContext();
  const noGroupContext = await browser.newContext();

  try {
  const adminPage = await adminContext.newPage();
  await loginAsE2EAdmin(adminPage);

  const teacherPage = await teacherContext.newPage();
  await onboardApprovedTeacher(teacherPage, adminPage, { prefix: 'visibility-teacher' });

  // ── Minimális (nem-SQL) publikált feladatsor egy privát csoporttal ──
  const taskSetTitle = `E2E láthatóság feladatsor ${Date.now()}`;
  await teacherPage.goto(`${TEACHER_FE_URL}/feladatsorok`);
  await teacherPage.locator('[formcontrolname="title"]').fill(taskSetTitle);
  await teacherPage.locator('[formcontrolname="description"]').fill('Láthatóság-teszt feladatsor.');
  await teacherPage.getByRole('button', { name: 'Létrehozás' }).click();
  await teacherPage.waitForURL(/\/feladatsorok\/\d+\/szerkesztes/, { timeout: 15000 });

  await teacherPage.locator('[name="newTaskTitle"]').fill('Feladat');
  await teacherPage.locator('[name="newTaskDescription"]').fill('Feladat leírása.');
  await teacherPage.getByRole('button', { name: 'Hozzáadás' }).click();
  await expect(teacherPage.getByText('1. Feladat')).toBeVisible({ timeout: 15000 });
  await teacherPage.getByText('1. Feladat').click();

  await teacherPage.locator('[name="newSolutionDescription"]').fill('Részfeladat');
  await teacherPage.getByRole('button', { name: 'Hozzáadás' }).nth(0).click();

  const saveSnippetsButton = teacherPage.getByRole('button', { name: 'Kódrészletek mentése' });
  // Python az első nyelv a rácsban (nem igényel fájl-párosítást, mint az SQL) —
  // a mentés gombhoz képest közvetlenül megelőző rács-div első textarea-ja.
  const snippetGrid = saveSnippetsButton.locator('xpath=preceding-sibling::div[1]');
  const pythonTextarea = snippetGrid.locator('textarea').first();
  await pythonTextarea.fill('print("hello")');
  await expect(pythonTextarea).toHaveValue('print("hello")');
  await saveSnippetsButton.click();

  await teacherPage.getByRole('button', { name: 'Publikálás' }).click();
  await expect(teacherPage.getByRole('button', { name: 'Publikálva' })).toBeVisible({ timeout: 15000 });

  // ── Két privát csoport: A (a tartalom tanáráé), B (másik, független) ──
  const groupAName = `visibility-a-${Date.now()}`;
  await teacherPage.goto(`${TEACHER_FE_URL}/csoportok`);
  await teacherPage.locator('[formcontrolname="name"]').fill(groupAName);
  await teacherPage.getByRole('button', { name: 'Létrehozás' }).click();
  await teacherPage.getByText(groupAName).click();
  await teacherPage.getByRole('button', { name: 'Meghívó' }).click();
  const groupACode = (await teacherPage.locator('code').first().textContent())?.trim();

  const otherTeacherPage = await otherTeacherContext.newPage();
  await onboardApprovedTeacher(otherTeacherPage, adminPage, { prefix: 'visibility-other-teacher' });

  const groupBName = `visibility-b-${Date.now()}`;
  await otherTeacherPage.goto(`${TEACHER_FE_URL}/csoportok`);
  await otherTeacherPage.locator('[formcontrolname="name"]').fill(groupBName);
  await otherTeacherPage.getByRole('button', { name: 'Létrehozás' }).click();
  await otherTeacherPage.getByText(groupBName).click();
  await otherTeacherPage.getByRole('button', { name: 'Meghívó' }).click();
  const groupBCode = (await otherTeacherPage.locator('code').first().textContent())?.trim();

  // ── Diák1: A csoport tagja — POZITÍV kontroll, ő elérje ──
  const memberPage = await memberContext.newPage();
  await createLoggedInStudent(memberPage, 'visibility-member');
  await memberPage.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${groupACode}`);
  await memberPage.locator('#consent').check();
  await memberPage.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
  await expect(memberPage.getByText('Sikeresen csatlakoztál!')).toBeVisible({ timeout: 15000 });

  // ── Diák2: csak a B csoport tagja (másik tanár, más tartalom) ──
  const outsiderPage = await outsiderContext.newPage();
  await createLoggedInStudent(outsiderPage, 'visibility-outsider');
  await outsiderPage.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${groupBCode}`);
  await outsiderPage.locator('#consent').check();
  await outsiderPage.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
  await expect(outsiderPage.getByText('Sikeresen csatlakoztál!')).toBeVisible({ timeout: 15000 });

  // ── Diák3: semmilyen csoportnak nem tagja ──
  const noGroupPage = await noGroupContext.newPage();
  await createLoggedInStudent(noGroupPage, 'visibility-nogroup');

  // ── API-szintű ellenőrzés mindhárom diákra a saját tokenjükkel ──
  const request = teacherContext.request; // bármelyik context requestje jó, mert csak a headert használjuk

  const memberToken = await getAccessTokenFromStorage(memberPage, 'access_token');
  const memberRes = await apiGet(request, memberToken, '/api/my-groups/task-sets');
  expect(memberRes.ok()).toBe(true);
  const memberTaskSets = await memberRes.json();
  expect(memberTaskSets.some((ts: { title: string }) => ts.title === taskSetTitle)).toBe(true);

  const outsiderToken = await getAccessTokenFromStorage(outsiderPage, 'access_token');
  const outsiderRes = await apiGet(request, outsiderToken, '/api/my-groups/task-sets');
  expect(outsiderRes.ok()).toBe(true);
  const outsiderTaskSets = await outsiderRes.json();
  expect(outsiderTaskSets.some((ts: { title: string }) => ts.title === taskSetTitle)).toBe(false);

  const noGroupToken = await getAccessTokenFromStorage(noGroupPage, 'access_token');
  const noGroupRes = await apiGet(request, noGroupToken, '/api/my-groups/task-sets');
  expect(noGroupRes.ok()).toBe(true);
  const noGroupTaskSets = await noGroupRes.json();
  expect(noGroupTaskSets.length).toBe(0);

  // ── UI-szinten is: a nem-tag katalógusában nincs "Csoportjaim feladatsorai" szekció ──
  await outsiderPage.goto(`${STUDENT_FE_URL}/categories`);
  await expect(outsiderPage.getByText(taskSetTitle)).toHaveCount(0, { timeout: 15000 });
  } finally {
    await noGroupContext.close();
    await outsiderContext.close();
    await memberContext.close();
    await otherTeacherContext.close();
    await teacherContext.close();
    await adminContext.close();
  }
});

test('bejelentkezés nélkül a csoport-csatlakozás oldal loginra irányít returnUrl-lel', async ({ page }) => {
  await page.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=ANYCODE1`);
  await page.waitForURL(/\/login\?returnUrl=/, { timeout: 15000 });
  expect(page.url()).toContain('returnUrl');
});
