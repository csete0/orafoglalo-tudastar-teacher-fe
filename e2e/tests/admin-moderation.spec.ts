import { test, expect } from '@playwright/test';
import { TEACHER_FE_URL } from '../constants';
import { loginAsE2EAdmin, onboardApprovedTeacher } from '../helpers';

/**
 * Admin moderáció: kill-switch (TeacherProfile.IsActive) és feladatsor-
 * takedown (publikálás visszavonása). Mindkettő halasztott funkció volt,
 * amíg nem volt rá igény — most, hogy megépült, ez a flow bizonyítja élőben.
 */
test('admin felfüggeszt egy tanárt és visszavonja egy publikált feladatsor publikálását', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const teacherContext = await browser.newContext();

  try {
    const adminPage = await adminContext.newPage();
    await loginAsE2EAdmin(adminPage);

    const teacherPage = await teacherContext.newPage();
    const teacherEmail = await onboardApprovedTeacher(teacherPage, adminPage, { prefix: 'moderation' });

    // ── Tanár publikál egy minimális feladatsort ──
    const taskSetTitle = `E2E moderációs feladatsor ${Date.now()}`;
    await teacherPage.goto(`${TEACHER_FE_URL}/feladatsorok`);
    await teacherPage.locator('[formcontrolname="title"]').fill(taskSetTitle);
    await teacherPage.locator('[formcontrolname="description"]').fill('Moderációs E2E teszt feladatsor.');
    await teacherPage.getByRole('button', { name: 'Létrehozás' }).click();
    await teacherPage.waitForURL(/\/feladatsorok\/\d+\/szerkesztes/, { timeout: 15000 });

    await teacherPage.locator('[name="newTaskTitle-6"]').fill('Feladat');
    await teacherPage.locator('[name="newTaskDescription-6"]').fill('Feladat leírása.');
    const taskAddForm = teacherPage.locator('form', { has: teacherPage.locator('[name="newTaskTitle-6"]') });
    await taskAddForm.getByRole('button', { name: 'Hozzáadás' }).click();
    await expect(teacherPage.getByText('1. Feladat')).toBeVisible({ timeout: 15000 });
    await teacherPage.getByText('1. Feladat').click();

    await teacherPage.locator('[name="newSolutionDescription"]').fill('Részfeladat');
    const solutionAddForm = teacherPage.locator('form', { has: teacherPage.locator('[name="newSolutionDescription"]') });
    await solutionAddForm.getByRole('button', { name: 'Hozzáadás' }).click();

    const saveSnippetsButton = teacherPage.getByRole('button', { name: 'Kódrészletek mentése' });
    const snippetGrid = saveSnippetsButton.locator('xpath=preceding-sibling::div[1]');
    const pythonTextarea = snippetGrid.locator('textarea').first();
    await pythonTextarea.fill('print("hello")');
    await expect(pythonTextarea).toHaveValue('print("hello")');
    await saveSnippetsButton.click();

    await teacherPage.getByRole('button', { name: 'Publikálás' }).click();
    await expect(teacherPage.getByRole('button', { name: 'Publikálva' })).toBeVisible({ timeout: 15000 });

    // ── Admin: /admin/tanarok — a tanár sorát az email alapján találjuk meg
    // (onboardApprovedTeacher visszaadja), a "Feladatsorai" kinyitás után a
    // publikálás visszavonás gombra explicit meg is várjuk a betöltést. ──
    await adminPage.goto(`${TEACHER_FE_URL}/admin/tanarok`);
    const item = adminPage.locator('li', { hasText: teacherEmail });
    await expect(item).toBeVisible({ timeout: 15000 });

    await item.getByRole('button', { name: /Feladatsorai/ }).click();
    await expect(item.getByText(taskSetTitle)).toBeVisible({ timeout: 15000 });

    // ── Takedown (saját confirm-dialógus) ──
    await item.getByRole('button', { name: 'Publikálás visszavonása' }).click();
    await adminPage.getByTestId('confirm-accept').click();
    await expect(item.getByText('Piszkozat')).toBeVisible({ timeout: 15000 });

    // ── Kill-switch (saját confirm-dialógus) ──
    await item.getByRole('button', { name: 'Felfüggesztés' }).click();
    await adminPage.getByTestId('confirm-accept').click();
    await expect(item.getByText('Felfüggesztve')).toBeVisible({ timeout: 15000 });
  } finally {
    await teacherContext.close();
    await adminContext.close();
  }
});
