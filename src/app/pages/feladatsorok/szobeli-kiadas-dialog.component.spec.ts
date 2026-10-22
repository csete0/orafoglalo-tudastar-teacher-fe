import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { OralAssignTarget, SzobeliKiadasDialogComponent } from './szobeli-kiadas-dialog.component';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { GroupStore } from '../../services/group/group.store';

const TARGET: OralAssignTarget = { topicId: 3, profileSlug: null, title: 'A fotoszintézis', voiceMinuteOptions: [5, 10, 15], defaultVoiceMinutes: 10 };

describe('SzobeliKiadasDialogComponent', () => {
  function setup(assignResult: unknown = of({ id: 9, groupName: '9.A' })) {
    const api = { quota: vi.fn(() => of({ oralExam: { used: 4, limit: 15 } })), assign: vi.fn(() => assignResult) };
    const groups = { loadMine: vi.fn(), activeGroups: signal([{ id: 1, name: '9.A' }, { id: 2, name: '10.B' }]) };
    TestBed.configureTestingModule({
      imports: [SzobeliKiadasDialogComponent],
      providers: [{ provide: TeacherOralExamService, useValue: api }, { provide: GroupStore, useValue: groups }],
    });
    const fixture = TestBed.createComponent(SzobeliKiadasDialogComponent);
    fixture.componentRef.setInput('target', TARGET);
    fixture.detectChanges();
    const assigned = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.assigned.subscribe(assigned);
    fixture.componentInstance.closed.subscribe(closed);
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    return { fixture, c: fixture.componentInstance, el, q, api, groups, assigned, closed };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a csoportok és a hosszak a választóban; az alap hossz a célé; csoport nélkül nem adható ki', () => {
    const { q, c, groups } = setup();
    expect(groups.loadMine).toHaveBeenCalled();
    expect(q('oral-assign-group').textContent).toContain('10.B');
    expect(q('oral-assign-minutes').textContent).toContain('15 perc');
    expect(c.voiceMinutes()).toBe(10);
    expect((q('oral-assign-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('dolgozat módban a tanári keretet írja ki; gyakorlásnál a diákét', () => {
    const { fixture, q } = setup();
    expect(q('oral-assign-mode-help').textContent).toContain('saját havi szóbeli-keretéből');
    (q('oral-assign-mode-exam') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(q('oral-assign-mode-help').textContent).toContain('Diákonként 1 egység a havi szóbeli-keretedből');
    expect(q('oral-assign-mode-help').textContent).toContain('még 11 / 15');
  });

  it('prémium nélküli tanárnál dolgozat módban figyelmeztet és nem engedi kiadni (BE-ORALEXAM-ASSIGNMENT-NONPREMIUM-TEACHER-DEADEND)', () => {
    const api = { quota: vi.fn(() => of({ premium: false, oralExam: { used: 0, limit: 5 } })), assign: vi.fn(() => of({ id: 9, groupName: '9.A' })) };
    const groups = { loadMine: vi.fn(), activeGroups: signal([{ id: 1, name: '9.A' }]) };
    TestBed.configureTestingModule({
      imports: [SzobeliKiadasDialogComponent],
      providers: [{ provide: TeacherOralExamService, useValue: api }, { provide: GroupStore, useValue: groups }],
    });
    const fixture = TestBed.createComponent(SzobeliKiadasDialogComponent);
    fixture.componentRef.setInput('target', TARGET);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;

    (q('oral-assign-mode-exam') as HTMLInputElement).click();
    fixture.detectChanges();

    // Nem-prémium tanárnál a dolgozat-kiadás MINDEN diáknál garantáltan 400 AiHelperPremiumRequired-del
    // bukik majd induláskor (TeacherAiHelperQuota.ReserveAsync) - a dialógusnak ezt ELŐRE kellene jeleznie
    // és a "Kiadás" gombot tiltania, ugyanúgy, mint a testvér "Új szóbeli téma anyagból" oldal teszi
    // (AI_HELPER_PREMIUM_TEXT). A quota() válasz premium:false-ja már a dialógusban elérhető, csak nem
    // néz rá senki (ngOnInit csak a q.oralExam-et olvassa).
    expect(q('oral-assign-mode-help').textContent).toContain('Prémium');
    fixture.componentInstance.groupId.set(1);
    fixture.detectChanges();
    expect((q('oral-assign-submit') as HTMLButtonElement).disabled).toBe(true);
    fixture.componentInstance.submit();
    expect(api.assign).not.toHaveBeenCalled();

    // Gyakorlás módban kiadható.
    (q('oral-assign-mode-practice') as HTMLInputElement).click();
    fixture.detectChanges();
    expect((q('oral-assign-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a kiadás a helyes törzzsel (helyi idő → UTC ISO) és kibocsátja az eredményt', () => {
    const { c, api, assigned } = setup();
    c.groupId.set(2);
    c.mode.set('exam');
    c.voiceMinutes.set(15);
    c.opensAt.set('2026-11-02T08:00');
    c.dueAt.set('2026-11-09T08:00');
    c.submit();
    expect(api.assign).toHaveBeenCalledWith({
      topicId: 3, profileSlug: null, groupId: 2, mode: 'exam', voiceMinutes: 15,
      opensAt: new Date('2026-11-02T08:00').toISOString(), dueAt: new Date('2026-11-09T08:00').toISOString(),
    });
    expect(assigned).toHaveBeenCalledWith({ id: 9, groupName: '9.A' });
  });

  it('a nyitás utáni határidőt helyben ellenőrzi; a szerver hibája megjelenik; a háttér bezár', () => {
    const err = new HttpErrorResponse({ status: 400, error: { errorMessage: 'A téma még nincs jóváhagyva.' } });
    const { fixture, c, q, api, closed } = setup(throwError(() => err));
    c.groupId.set(1);
    c.opensAt.set('2026-11-09T08:00');
    c.dueAt.set('2026-11-02T08:00');
    c.submit();
    expect(api.assign).not.toHaveBeenCalled();
    expect(c.error()).toContain('a nyitás után');

    c.dueAt.set('');
    c.submit();
    fixture.detectChanges();
    expect(q('oral-assign-error').textContent).toContain('még nincs jóváhagyva');

    q('oral-assign-backdrop').click();
    expect(closed).toHaveBeenCalled();
  });
});
