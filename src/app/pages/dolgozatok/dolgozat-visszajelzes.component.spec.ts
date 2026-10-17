import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { DolgozatVisszajelzesComponent, draftErrorMessage } from './dolgozat-visszajelzes.component';
import { ClassTestService } from '../../services/class-test/class-test.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ClassTestFeedbackDraftDto, ClassTestFeedbackDraftsDto, ClassTestStudentRow } from '../../models/class-test.model';
import { ReportService } from '../../services/report/report.service';

function student(userId: number, overrides: Partial<ClassTestStudentRow> = {}): ClassTestStudentRow {
  return {
    userId, name: `Diák ${userId}`, status: 'submitted', examSessionId: 300 + userId, startedAt: null, submittedAt: null,
    remainingSeconds: null, timeLimitReached: false, earnedPoints: 10, maxPoints: 20, needsManualGrading: false, tasks: [],
    focusLossCount: 0, pasteCount: 0, pastedChars: 0, teacherFeedback: null, ...overrides,
  };
}

function item(userId: number, overrides: Partial<ClassTestFeedbackDraftDto> = {}): ClassTestFeedbackDraftDto {
  return {
    userId, studentName: `Diák ${userId}`, examSessionId: 300 + userId, status: 'ready', draft: `Vázlat ${userId}.`, reason: null,
    earnedPoints: 10, maxPoints: 20, savedFeedback: null, ...overrides,
  };
}

const drafts = (items: ClassTestFeedbackDraftDto[], pendingUserIds: number[] = []): ClassTestFeedbackDraftsDto =>
  ({ assignmentId: 7, model: 'm', items, pendingUserIds });

describe('DolgozatVisszajelzesComponent', () => {
  let service: { draftFeedback: ReturnType<typeof vi.fn>; saveFeedback: ReturnType<typeof vi.fn> };
  let confirm: { ask: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn> };
  let reports: { getAiHelperQuota: ReturnType<typeof vi.fn> };

  /** Alapból a megnyitás után a „Vázlat AI-val” gombot is megnyomja (az alapértelmezett vagy a megadott kijelöléssel). */
  function create(students: ClassTestStudentRow[], responses: unknown[], published = false, opts: { generate?: boolean; select?: number[] } = {}) {
    reports = { getAiHelperQuota: vi.fn(() => of({ month: '2026-10', premium: true, quizSource: { used: 0, limit: 60 }, testFeedback: { used: 40, limit: 600 } })) };
    const draftFeedback = vi.fn();
    for (const r of responses) draftFeedback.mockReturnValueOnce(r);
    service = { draftFeedback, saveFeedback: vi.fn(() => of({ saved: 1, examSessionIds: [], notifiedStudents: 0 })) };
    confirm = { ask: vi.fn().mockResolvedValue(true) };
    toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [DolgozatVisszajelzesComponent],
      providers: [
        { provide: ClassTestService, useValue: service },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: toast },
        { provide: ReportService, useValue: reports },
      ],
    });
    const fixture = TestBed.createComponent(DolgozatVisszajelzesComponent);
    fixture.componentRef.setInput('assignmentId', 7);
    fixture.componentRef.setInput('students', students);
    fixture.componentRef.setInput('published', published);
    fixture.detectChanges();
    const saved = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    if (opts.generate !== false) {
      if (opts.select) fixture.componentInstance.selected.set(new Set(opts.select));
      fixture.componentInstance.generateSelected();
      fixture.detectChanges();
    }
    return { fixture, c: fixture.componentInstance, saved, closed };
  }

  /** Az ngModel a mező értékét aszinkron írja be. */
  async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  afterEach(() => TestBed.resetTestingModule());

  describe('megnyitás: nincs automatikus vázlat', () => {
    it('megnyitáskor nem kér vázlatot; az elmentett visszajelzés a mezőben, a kijelölés alapból csak a visszajelzés nélküli beadottak', async () => {
      const students = [student(1, { teacherFeedback: 'Már megírtam.' }), student(2), student(3, { status: 'not_started', examSessionId: null })];
      const { fixture, c } = create(students, [], false, { generate: false });
      await settle(fixture);
      expect(service.draftFeedback).not.toHaveBeenCalled();
      expect((q(fixture, 'feedback-text-1') as HTMLTextAreaElement).value).toBe('Már megírtam.');
      expect((q(fixture, 'feedback-text-2') as HTMLTextAreaElement).value).toBe('');
      expect([...c.selected()]).toEqual([2]);
      expect((q(fixture, 'feedback-select-1') as HTMLInputElement).checked).toBe(false);
      expect(q(fixture, 'feedback-select-3')).toBeNull();
      expect(q(fixture, 'feedback-cost')!.textContent).toContain('1 diák kijelölve');
      expect(q(fixture, 'feedback-cost')!.textContent).toContain('legfeljebb 1 egység a havi keretből');
      expect(q(fixture, 'feedback-generate')!.textContent).toContain('Vázlat AI-val (1)');
    });

    it('ha mindenkinek van elmentett visszajelzése, semmi nincs kijelölve, a gomb tiltott', () => {
      const { fixture, c } = create([student(1, { teacherFeedback: 'A' }), student(2, { teacherFeedback: 'B' })], [], false, { generate: false });
      expect(c.selectedCount()).toBe(0);
      expect((q(fixture, 'feedback-generate') as HTMLButtonElement).disabled).toBe(true);
      c.generateSelected();
      expect(service.draftFeedback).not.toHaveBeenCalled();
    });

    it('elmentett visszajelzésű diák újra-vázlatolása csak diákonkénti kijelöléssel; csak a kijelöltekre kér', () => {
      const { fixture, c } = create([student(1, { teacherFeedback: 'A' }), student(2)], [of(drafts([item(1, { savedFeedback: 'A' }), item(2)]))], false, { generate: false });
      (q(fixture, 'feedback-select-1') as HTMLInputElement).click();
      (q(fixture, 'feedback-select-2') as HTMLInputElement).click();
      fixture.detectChanges();
      expect([...c.selected()]).toEqual([1]);
      q(fixture, 'feedback-generate')!.click();
      expect(service.draftFeedback).toHaveBeenCalledWith(7, [1]);
      expect(c.selectedCount()).toBe(0);
    });

    it('ha a kijelölés több, mint a hátralévő keret, figyelmeztet', () => {
      const { fixture } = create([student(1), student(2)], [], false, { generate: false });
      reports.getAiHelperQuota.mockReturnValue(of({}));
      fixture.componentInstance.quota.set({ used: 599, limit: 600 });
      fixture.detectChanges();
      expect(q(fixture, 'feedback-cost')!.textContent).toContain('A keretbe csak 1 fér bele');
    });
  });

  it('csak a beadott diákokra kér vázlatot; a kész vázlat szerkeszthető, a kimaradt diák oka látszik', async () => {
    const students = [student(1), student(2, { needsManualGrading: true }), student(3, { status: 'not_started', examSessionId: null })];
    const { fixture, c } = create(students, [of(drafts([item(1), item(2, { status: 'skipped', draft: null, reason: 'kézi pontozásra vár' })]))]);
    await settle(fixture);

    expect(service.draftFeedback).toHaveBeenCalledWith(7, [1, 2]);
    expect(c.drafting()).toBe(false);
    expect((q(fixture, 'feedback-text-1') as HTMLTextAreaElement).value).toBe('Vázlat 1.');
    expect(q(fixture, 'feedback-skipped-2')!.textContent).toContain('kézi pontozásra vár');
    // Vázlat nélkül is kézzel megírható (beadott munkamenet).
    expect(q(fixture, 'feedback-text-2')).not.toBeNull();
    expect(q(fixture, 'feedback-row-3')!.textContent).toContain('Nem adta be');
    expect(q(fixture, 'feedback-dialog')!.getAttribute('role')).toBe('dialog');
    expect(q(fixture, 'feedback-visibility')!.textContent).toContain('az eredmények közzététele után látják');
  });

  it('pending: a maradékkal magától újra hív, haladásjelzéssel; a sorrend és a vázlatok összeérnek', async () => {
    const second = new Subject<ClassTestFeedbackDraftsDto>();
    const { fixture, c } = create([student(1), student(2), student(3)], [
      of(drafts([item(1), item(2, { status: 'pending', draft: null }), item(3, { status: 'pending', draft: null })], [2, 3])),
      second,
    ]);
    fixture.detectChanges();

    expect(service.draftFeedback).toHaveBeenNthCalledWith(2, 7, [2, 3]);
    expect(c.drafting()).toBe(true);
    expect(q(fixture, 'feedback-progress')!.textContent).toContain('1 / 3 diák kész');
    expect(q(fixture, 'feedback-pending-2')).not.toBeNull();
    expect((q(fixture, 'feedback-save') as HTMLButtonElement).disabled).toBe(true);

    second.next(drafts([item(2), item(3)]));
    second.complete();
    await settle(fixture);
    expect(c.drafting()).toBe(false);
    expect(c.processed()).toBe(3);
    expect((q(fixture, 'feedback-text-3') as HTMLTextAreaElement).value).toBe('Vázlat 3.');
  });

  it('a második „pending” kör után már nem kér magától: „Folytatás” gomb, ami újra egy automatikus kört enged', () => {
    const { fixture, c } = create([student(1), student(2), student(3)], [
      of(drafts([item(1), item(2, { status: 'pending', draft: null }), item(3, { status: 'pending', draft: null })], [2, 3])),
      of(drafts([item(2), item(3, { status: 'pending', draft: null })], [3])),
      of(drafts([item(3)])),
    ]);
    fixture.detectChanges();
    expect(service.draftFeedback).toHaveBeenCalledTimes(2);
    expect(c.drafting()).toBe(false);
    expect(q(fixture, 'feedback-resume')!.textContent).toContain('Folytatás (1)');

    c.resume();
    expect(service.draftFeedback).toHaveBeenNthCalledWith(3, 7, [3]);
    expect(c.remaining()).toBe(0);
  });

  it('havi keret: a hátralévőt mutatja, a válasz frissíti; a keret fölötti diák oka látszik, és kézzel írható', async () => {
    const { fixture } = create([student(1), student(2)], [
      of({ ...drafts([item(1), item(2, { status: 'skipped', draft: null, reason: 'Elfogyott a havi visszajelzés-vázlat kereted - a következő hónapban újra kérhetsz.' })]), quota: { used: 600, limit: 600 } }),
    ]);
    await settle(fixture);
    expect(q(fixture, 'feedback-quota')!.textContent).toContain('még 0 / 600 diák-vázlat');
    expect(q(fixture, 'feedback-skipped-2')!.textContent).toContain('Elfogyott a havi visszajelzés-vázlat kereted');
    expect(q(fixture, 'feedback-text-2')).not.toBeNull();
  });

  it('nem Prémium tanár: érthető üzenet, nincs „Folytatás”, a sorok kézzel írhatók', () => {
    const err = new HttpErrorResponse({ status: 400, error: { errorType: 'AiHelperPremiumRequired', errorMessage: 'x' } });
    const { fixture, c } = create([student(1)], [throwError(() => err)]);
    fixture.detectChanges();
    expect(q(fixture, 'feedback-blocked')!.textContent).toContain('Prémium tanári előfizetéssel');
    expect(q(fixture, 'feedback-resume')).toBeNull();
    expect(q(fixture, 'feedback-text-1')).not.toBeNull();
    c.resume();
    expect(service.draftFeedback).toHaveBeenCalledTimes(1);
  });

  it('60-nál több diák: 60-as részletekben kér', () => {
    const students = Array.from({ length: 65 }, (_, i) => student(i + 1));
    create(students, [of(drafts([])), of(drafts([]))]);
    expect(service.draftFeedback.mock.calls[0][1]).toHaveLength(60);
    expect(service.draftFeedback.mock.calls[1][1]).toEqual([61, 62, 63, 64, 65]);
  });

  it('előrehaladás nélküli pending: nem kér végtelenül, „Folytatás” gombbal újraindítható', () => {
    const { fixture, c } = create([student(1)], [
      of(drafts([item(1, { status: 'pending', draft: null })], [1])),
      of(drafts([item(1)])),
    ]);
    fixture.detectChanges();
    expect(service.draftFeedback).toHaveBeenCalledTimes(1);
    expect(q(fixture, 'feedback-remaining')!.textContent).toContain('1 diák vázlata nem fért bele');

    q(fixture, 'feedback-resume')!.click();
    fixture.detectChanges();
    expect(service.draftFeedback).toHaveBeenCalledTimes(2);
    expect(c.remaining()).toBe(0);
    expect(q(fixture, 'feedback-text-1')).not.toBeNull();
  });

  it('hiba a vázlatkérésnél: üzenet, a maradék „Folytatás”-sal kérhető', () => {
    const { fixture } = create([student(1)], [throwError(() => new HttpErrorResponse({ status: 429 }))]);
    fixture.detectChanges();
    expect(q(fixture, 'feedback-remaining')!.textContent).toContain('túl sok vázlatot');
    expect(draftErrorMessage({ status: 400, error: { errorMessage: 'Nincs ilyen dolgozat.' } })).toBe('Nincs ilyen dolgozat.');
  });

  it('elmentett visszajelzés: azt mutatja (nem írja felül a vázlat), a vázlat gombbal behozható; sikertelen vázlat oka', async () => {
    const { fixture, c } = create([student(1, { teacherFeedback: 'Régi szöveg.' }), student(2)], [
      of(drafts([item(1, { savedFeedback: 'Régi szöveg.' }), item(2, { status: 'failed', draft: null, reason: 'a vázlat hibás számot tartalmazott' })])),
    ], false, { select: [1, 2] });
    await settle(fixture);
    expect((q(fixture, 'feedback-text-1') as HTMLTextAreaElement).value).toBe('Régi szöveg.');
    expect(q(fixture, 'feedback-has-saved-1')).not.toBeNull();
    expect(q(fixture, 'feedback-failed-2')!.textContent).toContain('hibás számot');
    expect((q(fixture, 'feedback-text-2') as HTMLTextAreaElement).value).toBe('');
    expect(c.changes()).toEqual([]);

    q(fixture, 'feedback-use-draft-1')!.click();
    fixture.detectChanges();
    expect(c.changes()).toEqual([{ examSessionId: 301, feedback: 'Vázlat 1.' }]);
  });

  it('Mentés: csak a módosított tételek, examSessionId-val; az üresre törölt elmentett szöveg null (törlés)', () => {
    const { fixture, c, saved, closed } = create([student(1), student(2, { teacherFeedback: 'Törlendő.' }), student(3, { teacherFeedback: 'Marad.' })], [
      of(drafts([item(1), item(2, { savedFeedback: 'Törlendő.' }), item(3, { savedFeedback: 'Marad.' })])),
    ], false, { select: [1, 2, 3] });
    c.setText(1, '  Átírt vázlat.  ');
    c.setText(2, '   ');
    fixture.detectChanges();
    expect(q(fixture, 'feedback-row-2')!.textContent).toContain('törlődik');
    expect(q(fixture, 'feedback-change-count')!.textContent).toContain('2 módosított');

    q(fixture, 'feedback-save')!.click();
    expect(service.saveFeedback).toHaveBeenCalledWith(7, [
      { examSessionId: 301, feedback: 'Átírt vázlat.' },
      { examSessionId: 302, feedback: null },
    ]);
    expect(toast.success.mock.calls[0][0]).toContain('A diákok a közzététel után látják.');
    expect(saved).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
  });

  it('közzétett eredménynél figyelmeztet, és az értesítettek számát jelzi', () => {
    const { fixture } = create([student(1)], [of(drafts([item(1)]))], true);
    service.saveFeedback.mockReturnValue(of({ saved: 1, examSessionIds: [301], notifiedStudents: 1 }));
    fixture.detectChanges();
    expect(q(fixture, 'feedback-visibility')!.textContent).toContain('azonnal látják');
    q(fixture, 'feedback-save')!.click();
    expect(toast.success.mock.calls[0][0]).toContain('1 diák értesítést kapott.');
  });

  it('2000 karakter fölött nem menthető; mentési hiba az ablakban marad', () => {
    const { fixture, c, closed } = create([student(1)], [of(drafts([item(1)]))]);
    c.setText(1, 'x'.repeat(2001));
    expect(c.canSave()).toBe(false);
    c.setText(1, 'Rendben.');
    service.saveFeedback.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { errorMessage: 'A dolgozat nincs beadva.' } })));
    c.save();
    fixture.detectChanges();
    expect(q(fixture, 'feedback-save-error')!.textContent).toContain('nincs beadva');
    expect(closed).not.toHaveBeenCalled();
  });

  it('bezárás futó vázlatkérés közben: megszakítja, a késő válasz nem ír', async () => {
    const pending = new Subject<ClassTestFeedbackDraftsDto>();
    const { c, closed } = create([student(1)], [pending]);
    expect(pending.observed).toBe(true);
    await c.close();
    expect(pending.observed).toBe(false);
    expect(closed).toHaveBeenCalled();
    expect(confirm.ask).not.toHaveBeenCalled();
    pending.next(drafts([item(1)]));
    expect(c.rows()[0].draft).toBeNull();
  });

  it('nem mentett módosítás mellett a bezárás megerősítést kér', async () => {
    const { c, closed } = create([student(1)], [of(drafts([item(1)]))]);
    confirm.ask.mockResolvedValue(false);
    await c.close();
    expect(confirm.ask).toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });
});
