import { test, expect, Browser, Page } from '@playwright/test';
import { STUDENT_FE_URL, TEACHER_FE_URL } from '../constants';
import {
  acceptConfirmDialog,
  createLoggedInStudent,
  loginAsE2EAdmin,
  loginOnStudentApp,
  onboardApprovedTeacher,
} from '../helpers';

/**
 * Az intézményi licenc versengő és életciklus-forgatókönyvei, valódi böngészőn.
 *
 * A backend unit-tesztjei a foglalási logikát önmagában már bizonyítják; itt az a
 * kérdés, hogy a TELJES lánc — HTTP-bejelentkezés, jogosultság-feloldás, a diák és
 * a tanár/admin felülete — együtt is helyesen viselkedik-e, több egyidejű
 * felhasználóval.
 */

/** Regisztrál egy diákot és beléptet a csoportba. A hely FOGLALÁSA a következő bejelentkezéskor történik. */
async function registerAndJoin(browser: Browser, prefix: string, inviteCode: string): Promise<string> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const email = await createLoggedInStudent(page, prefix);
    await page.goto(`${STUDENT_FE_URL}/csoport/csatlakozas?code=${inviteCode}`);
    await page.locator('#consent').check();
    await page.getByRole('button', { name: 'Csatlakozás a csoporthoz' }).click();
    await expect(page.getByText('Sikeresen csatlakoztál!').first()).toBeVisible({ timeout: 15000 });
    return email;
  } finally {
    await context.close();
  }
}

/** Friss kontextusban belép, és megmondja, kapott-e intézményi helyet. */
async function loginAndHasSeat(browser: Browser, email: string): Promise<{ hasSeat: boolean; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginOnStudentApp(page, email);
  await page.goto(`${STUDENT_FE_URL}/profile`);
  const hasSeat = await page.getByText(/Iskolai licenc/).isVisible().catch(() => false);
  return { hasSeat, page };
}

async function setUpInstitutionWithLicence(
  browser: Browser,
  adminPage: Page,
  capacity: number,
): Promise<{ principalPage: Page; institutionName: string; groupName: string; inviteCode: string }> {
  const principalContext = await browser.newContext();
  const principalPage = await principalContext.newPage();
  await onboardApprovedTeacher(principalPage, adminPage, { prefix: 'cont-principal' });

  const institutionName = `E2E Verseny Intézmény ${Date.now()}`;
  await principalPage.goto(`${TEACHER_FE_URL}/intezmenyek`);
  await principalPage.locator('[formcontrolname="name"]').fill(institutionName);
  await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(principalPage.getByText(institutionName)).toBeVisible({ timeout: 15000 });

  const groupName = `cont-group-${Date.now()}`;
  await principalPage.goto(`${TEACHER_FE_URL}/csoportok`);
  await principalPage.locator('[formcontrolname="name"]').fill(groupName);
  await principalPage.locator('[formcontrolname="schoolId"]').selectOption({ label: institutionName });
  await principalPage.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(principalPage.getByText(groupName)).toBeVisible({ timeout: 15000 });
  await principalPage.getByText(groupName).click();
  await principalPage.getByRole('tab', { name: 'Meghívó' }).click();
  const inviteCode = (await principalPage.locator('code').first().textContent())?.trim() ?? '';
  expect(inviteCode).toBeTruthy();

  await adminPage.goto(`${TEACHER_FE_URL}/admin/intezmenyek`);
  const schoolRow = adminPage.locator('li', { hasText: institutionName });
  await expect(schoolRow).toBeVisible({ timeout: 15000 });
  await schoolRow.getByRole('button', { name: '+ Új licenc' }).click();
  await schoolRow.locator('[name^="tier-"]').selectOption('premium');
  await schoolRow.locator('[name^="cap-"]').fill(String(capacity));
  await schoolRow.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(schoolRow.getByText(new RegExp(`0/${capacity} hely használatban`))).toBeVisible({ timeout: 15000 });

  return { principalPage, institutionName, groupName, inviteCode };
}

/**
 * A legterheltebb pont: becsengetéskor egyszerre lép be az egész osztály. A
 * kapacitásnál pontosan annyian kaphatnak helyet — se többen (túlfoglalás), se
 * kevesebben (fölöslegesen elveszett hely).
 *
 * A kapacitás SZÁNDÉKOSAN kisebb a diákok számánál, hogy ugyanez a futás a
 * kiszorulás-számlálót és a belőle készülő kimutatást is bizonyítsa.
 */
test('egyidejű bejelentkezés: pontosan a kapacitásnyi diák kap helyet, a többi a kimutatásban látszik', async ({ browser }) => {
  test.setTimeout(300_000);

  const CAPACITY = 2;
  const STUDENTS = 4;

  const adminContext = await browser.newContext();
  const openPages: Page[] = [];

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    const { institutionName, inviteCode } = await setUpInstitutionWithLicence(browser, adminPage, CAPACITY);

    const emails: string[] = [];
    for (let i = 0; i < STUDENTS; i++) {
      emails.push(await registerAndJoin(browser, `cont-student-${i}`, inviteCode));
    }

    // EGYSZERRE indított bejelentkezések - ez modellezi a becsengetéskori rohamot.
    const results = await Promise.all(emails.map((email) => loginAndHasSeat(browser, email)));
    openPages.push(...results.map((r) => r.page));

    const winners = results.filter((r) => r.hasSeat).length;
    expect(winners, `pontosan ${CAPACITY} diáknak kell helyet kapnia`).toBe(CAPACITY);

    // ── A kimutatás ugyanezt mutatja az adminnak ──
    await adminPage.goto(`${TEACHER_FE_URL}/admin/intezmenyek`);
    const schoolRow = adminPage.locator('li', { hasText: institutionName });
    await expect(schoolRow.getByText(new RegExp(`${CAPACITY}/${CAPACITY} hely használatban`)))
      .toBeVisible({ timeout: 15000 });

    await schoolRow.getByRole('button', { name: 'Kihasználtság' }).click();
    // A bővítési döntés fő száma: akik jogosultak lettek volna, de nem fértek be.
    await expect(schoolRow.getByText(new RegExp(`${STUDENTS - CAPACITY} alkalommal nem jutott hely`)))
      .toBeVisible({ timeout: 15000 });
    await expect(schoolRow.getByText(/Ez a keret szűk/)).toBeVisible({ timeout: 15000 });
  } finally {
    for (const page of openPages) await page.context().close();
    await adminContext.close();
  }
});

/**
 * Életciklus: a kézi felszabadítás azonnal helyet ad a következő igénylőnek, a
 * licenc visszavonása pedig minden hozzáférést megszüntet.
 */
test('admin felszabadít egy helyet, majd visszavonja a licencet', async ({ browser }) => {
  test.setTimeout(300_000);

  const adminContext = await browser.newContext();
  const openPages: Page[] = [];

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    const { institutionName, inviteCode } = await setUpInstitutionWithLicence(browser, adminPage, 1);

    const holderEmail = await registerAndJoin(browser, 'rel-holder', inviteCode);
    const waitingEmail = await registerAndJoin(browser, 'rel-waiting', inviteCode);

    const holder = await loginAndHasSeat(browser, holderEmail);
    openPages.push(holder.page);
    expect(holder.hasSeat).toBe(true);

    const waitingBefore = await loginAndHasSeat(browser, waitingEmail);
    openPages.push(waitingBefore.page);
    expect(waitingBefore.hasSeat, 'egy hely van, a második diák nem kaphat').toBe(false);

    // ── Admin kézzel felszabadítja a helyet ──
    await adminPage.goto(`${TEACHER_FE_URL}/admin/intezmenyek`);
    const schoolRow = adminPage.locator('li', { hasText: institutionName });
    await schoolRow.getByRole('button', { name: 'Helyek megtekintése' }).click();
    await schoolRow.getByRole('button', { name: 'Felszabadítás' }).first().click();
    await acceptConfirmDialog(adminPage);
    await expect(schoolRow.getByText(/0\/1 hely használatban/)).toBeVisible({ timeout: 15000 });

    // ── A várakozó diák következő belépésekor megkapja ──
    const waitingAfter = await loginAndHasSeat(browser, waitingEmail);
    openPages.push(waitingAfter.page);
    expect(waitingAfter.hasSeat, 'a felszabadult helyet a következő igénylő megkapja').toBe(true);

    // ── Licenc visszavonása: a hozzáférés azonnal megszűnik ──
    await adminPage.goto(`${TEACHER_FE_URL}/admin/intezmenyek`);
    const rowAgain = adminPage.locator('li', { hasText: institutionName });
    await rowAgain.getByRole('button', { name: 'Visszavonás' }).click();
    await acceptConfirmDialog(adminPage);
    await expect(rowAgain.getByText(/visszavonva/)).toBeVisible({ timeout: 15000 });

    const afterRevoke = await loginAndHasSeat(browser, waitingEmail);
    openPages.push(afterRevoke.page);
    expect(afterRevoke.hasSeat, 'visszavont licenc után nincs iskolai hozzáférés').toBe(false);
  } finally {
    for (const page of openPages) await page.context().close();
    await adminContext.close();
  }
});
