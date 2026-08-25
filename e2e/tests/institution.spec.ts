import { test, expect } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import { acceptConfirmDialog, createLoggedInStudent, loginAsE2EAdmin, onboardApprovedTeacher } from '../helpers';

// A csoport-/intézmény-oldal fülei UI-TT-179 óta valódi tab-widgetek:
// a gombok `role="tab"`-ot viselnek. Az explicit role FELÜLÍRJA az implicit
// `button` szerepet, ezért a `getByRole('button', ...)` egyszerűen nem találja
// meg őket - a kattintás nem hibázott, hanem VÉGTELENÜL várt egy sosem létező
// elemre, és a teszt csak a teljes teszt-timeouttal halt el (semmitmondó
// hibaüzenettel). Ezért `getByRole('tab', ...)`.

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
  await expect(principalPage.getByTestId('my-role-badge')).toHaveText(/Igazgató/, { timeout: 15000 });

  const teacherInviteCode = (await principalPage.locator('code').first().textContent())?.trim();
  expect(teacherInviteCode).toBeTruthy();

  // ── Kolléga tanár onboardingja + csatlakozás tanári kóddal ──
  const colleaguePage = await colleagueContext.newPage();
  await onboardApprovedTeacher(colleaguePage, adminPage, { prefix: 'colleague' });

  await colleaguePage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await colleaguePage.locator('[formcontrolname="code"]').fill(teacherInviteCode!);
  await colleaguePage.getByRole('button', { name: 'Csatlakozás' }).click();
  await acceptConfirmDialog(colleaguePage);
  await expect(colleaguePage.getByText(institutionName)).toBeVisible({ timeout: 15000 });

  // ── Az igazgató igazgatóvá lépteti elő a kollégát ──
  // A BE-GROUPSCHOOLBIND-NOADMINROLE-GATE fix óta csoportot intézményhez kötni
  // CSAK aktív Admin (igazgató) tag tud - a meghívó kóddal szerzett Teacher-tagság
  // nem elég, mert a kötés ugyanazt az intézmény-szintű láthatóságot hozza létre,
  // amit a kódbázis máshol is Admin-only-ként kezel. A spec ennél régebbi, ezért
  // sima tanárként próbált kötni, és "Az iskola nem található." hibát kapott.
  await principalPage.reload();
  // A kollégát NEM a nevével azonosítjuk: a megjelenített név a regisztrációból jön
  // (mindkét tanár ugyanazt a teszt-nevet kapja), az e-mail-prefix pedig nem látszik
  // ebben a listában. Az "Igazgatóvá tétel" gomb viszont KIZÁRÓLAG a nem-admin
  // tagoknál jelenik meg - a principal maga admin, tehát pontosan egy ilyen sor van.
  const promoteButton = principalPage.getByRole('button', { name: 'Igazgatóvá tétel' });
  await expect(promoteButton).toBeVisible({ timeout: 15000 });
  await promoteButton.click();
  await acceptConfirmDialog(principalPage);
  await expect(promoteButton).toHaveCount(0, { timeout: 15000 });

  // ── Kolléga csoportot hoz létre, az intézményhez kötve ──
  const groupName = `institution-group-${Date.now()}`;
  await colleaguePage.goto(`${TEACHER_FE_URL}/csoportok`);
  await colleaguePage.locator('[formcontrolname="name"]').fill(groupName);
  await colleaguePage.locator('[formcontrolname="schoolId"]').selectOption({ label: institutionName });
  await colleaguePage.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(colleaguePage.getByText(groupName)).toBeVisible({ timeout: 15000 });
  await colleaguePage.getByText(groupName).click();
  await colleaguePage.getByRole('tab', { name: 'Meghívó' }).click();
  const groupInviteCode = (await colleaguePage.locator('code').first().textContent())?.trim();

  // ── Az igazgató VISSZA-lefokozza a kollégát sima tanárrá ──
  // Az előléptetés csak a csoport intézményhez KÖTÉSÉHEZ kellett (Admin-only
  // művelet). A teszt lényege viszont az, hogy a diák a KOLLÉGA csoportjából éri
  // el az IGAZGATÓ feladatsorát - és a spec vége külön ellenőrzi, hogy a kolléga
  // sima tagként NEM lát admin-füleket. Ha igazgató maradna, azt az ellenőrzést
  // értelmetlenné tennénk. A csoport intézményi kötése a lefokozás után is megmarad.
  await principalPage.reload();
  // Előléptetés után MINDKÉT tanár igazgató, tehát két "Lefokozás" gomb van. A
  // megjelenített nevük azonos (mindkettő ugyanazzal a teszt-névvel regisztrált),
  // ezért a sorban látszó csoportszám különbözteti meg őket: ezen a ponton a
  // kollégának pontosan egy csoportja van, az igazgatónak egy sem.
  const colleagueRow = principalPage.locator('li', { hasText: '1 csoport' });
  const demoteButton = colleagueRow.getByRole('button', { name: 'Lefokozás' });
  await expect(demoteButton).toBeVisible({ timeout: 15000 });
  await demoteButton.click();
  await acceptConfirmDialog(principalPage);
  await expect(demoteButton).toHaveCount(0, { timeout: 15000 });

  // ── Igazgató feladatsort ír és publikál (intézményi megosztás confirm) ──
  const taskSetTitle = `E2E Igazgató feladatsor ${Date.now()}`;
  await principalPage.goto(`${TEACHER_FE_URL}/feladatsorok`);
  await principalPage.locator('[formcontrolname="title"]').fill(taskSetTitle);
  await principalPage.locator('[formcontrolname="description"]').fill('Igazgatói feladatsor E2E teszthez.');
  await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
  await principalPage.waitForURL(/\/feladatsorok\/\d+\/szerkesztes/, { timeout: 15000 });

  await principalPage.locator('[name="newTaskTitle-6"]').fill('Igazgatói feladat');
  await principalPage.locator('[name="newTaskDescription-6"]').fill('Igazgatói feladat leírása.');
  const taskAddForm = principalPage.locator('form', { has: principalPage.locator('[name="newTaskTitle-6"]') });
  await taskAddForm.getByRole('button', { name: 'Hozzáadás' }).click();
  await expect(principalPage.getByText('1. Igazgatói feladat')).toBeVisible({ timeout: 15000 });
  await principalPage.getByText('1. Igazgatói feladat').click();

  await principalPage.locator('[name="newSolutionDescription"]').fill('Igazgatói részfeladat');
  const solutionAddForm = principalPage.locator('form', { has: principalPage.locator('[name="newSolutionDescription"]') });
  await solutionAddForm.getByRole('button', { name: 'Hozzáadás' }).click();

  const saveSnippetsButton = principalPage.getByRole('button', { name: 'Kódrészletek mentése' });
  // Python az első nyelv a rácsban (nem igényel fájl-párosítást, mint az SQL) —
  // a mentés gombhoz képest közvetlenül megelőző rács-div első textarea-ja.
  const snippetGrid = saveSnippetsButton.locator('xpath=preceding-sibling::div[1]');
  const pythonTextarea = snippetGrid.locator('textarea').first();
  await pythonTextarea.fill('print("hello")');
  await expect(pythonTextarea).toHaveValue('print("hello")');
  await saveSnippetsButton.click();

  await principalPage.getByRole('button', { name: 'Publikálás', exact: true }).click();
  await principalPage.getByTestId('confirm-accept').click();
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
  await principalPage.getByRole('tab', { name: 'Áttekintés' }).click();
  await expect(principalPage.getByText('Teszt').first()).toBeVisible({ timeout: 15000 });

  // ── A kolléga (sima tag) NEM lát Áttekintés/Csoportok fület ──
  await colleaguePage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await colleaguePage.getByText(institutionName).click();
  await expect(colleaguePage.getByTestId('my-role-badge')).toHaveText(/Tanár/, { timeout: 15000 });
  await expect(colleaguePage.getByRole('tab', { name: 'Áttekintés' })).toHaveCount(0);
  await expect(colleaguePage.getByRole('tab', { name: 'Csoportok' })).toHaveCount(0);

  // ── Kolléga kilép az intézményből (saját confirm-dialógus) ──
  await colleaguePage.getByRole('main').getByRole('button', { name: 'Kilépés' }).click();
  await colleaguePage.getByTestId('confirm-accept').click();
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
