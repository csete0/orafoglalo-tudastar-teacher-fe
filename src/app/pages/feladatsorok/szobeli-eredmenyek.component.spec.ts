import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SzobeliEredmenyekComponent, transcriptSections } from './szobeli-eredmenyek.component';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { TeacherOralResultsDto, TeacherOralSessionDto } from '../../models/teacher-oral-exam.model';

const RESULTS: TeacherOralResultsDto = {
  assignment: {
    id: 9, topicId: 3, profileSlug: null, title: 'A fotoszintézis', groupId: 1, groupName: '9.A', mode: 'exam', voiceMinutes: 10,
    opensAt: null, dueAt: null, createdAt: '2026-10-22T08:00:00', revokedAt: null, resultsPublishedAt: null, studentCount: 1,
  },
  rows: [
    { userId: 5, studentName: 'Kiss Anna', sessionId: 11, status: 'graded', totalPoints: 20, maxPoints: 30, teacherTotalPoints: null, startedAt: '2026-10-22T09:00:00' },
    { userId: 6, studentName: 'Nagy Béla', sessionId: null, status: null, totalPoints: null, maxPoints: null, teacherTotalPoints: null, startedAt: null, awaitingParentConsent: true },
    { userId: 7, studentName: 'Tóth Cili', sessionId: 12, status: 'graded', totalPoints: 18, maxPoints: 30, teacherTotalPoints: null, startedAt: '2026-10-22T09:00:00', leftGroup: true },
  ],
};

function session(overrides: Partial<TeacherOralSessionDto> = {}): TeacherOralSessionDto {
  return {
    status: 'graded', message: null, totalPoints: 20, maxPoints: 30,
    criteria: [
      { key: 'tartalom', title: 'Tartalom', points: 16, maxPoints: 26, reason: 'Pontos', feedbackOnly: false },
      { key: 'kommunikacio', title: 'Kommunikatív készség', points: 4, maxPoints: 4, reason: 'Érthető', feedbackOnly: false },
      { key: 'szakmai', title: 'Szakmai visszajelzés', points: 0, maxPoints: 0, reason: 'Jó irány', feedbackOnly: true },
    ],
    questions: [], strengths: [], gaps: [], practice: [],
    transcript: [
      { speaker: 'examiner', text: 'Szia! Mi a fotoszintézis?', atSeconds: 0, questionNo: 1, interrupted: true },
      { speaker: 'student', text: 'A növények…', atSeconds: 5, questionNo: 1 },
    ],
    transcriptDeleted: false,
    prepCode: { languageId: 71, languageName: 'Python', code: 'print(1)' },
    teacher: null,
    sessionId: 11, student: { userId: 5, name: 'Kiss Anna' }, assignmentId: 9, itemTitle: 'A fényszakasz',
    plannedQuestions: [{ no: 1, text: 'Mi a fotoszintézis?', expected: ['fényenergia', 'glükóz'], segment: null }],
    runs: [[16, 4, 0]], endReason: 'completed', costUsd: 1.2,
    ...overrides,
  };
}

describe('transcriptSections', () => {
  it('a szomszédos, azonos szakaszú fordulókat csoportosítja; a régi leirat egy csoport', () => {
    const t = (segment: string | null) => ({ speaker: 'student' as const, text: 'x', atSeconds: 0, questionNo: 0, segment });
    expect(transcriptSections([t('a'), t('a'), t('b')]).map((s) => [s.segment, s.turns.length])).toEqual([['a', 2], ['b', 1]]);
    expect(transcriptSections([{ speaker: 'student', text: 'x', atSeconds: 0, questionNo: 1 }]).map((s) => s.segment)).toEqual([null]);
  });
});

describe('SzobeliEredmenyekComponent', () => {
  function setup(opts: { results?: unknown; session?: TeacherOralSessionDto; confirm?: boolean } = {}) {
    const api = {
      results: vi.fn(() => opts.results ?? of(structuredClone(RESULTS))),
      session: vi.fn(() => of(opts.session ?? session())),
      review: vi.fn(() => of(session({ teacher: { totalPoints: 22, criteria: [{ key: 'tartalom', points: 18 }, { key: 'kommunikacio', points: 4 }], note: 'Szép', reviewedAt: '2026-10-22T10:00:00' } }))),
      deleteReview: vi.fn(() => of(session())),
      publishResults: vi.fn(() => of({ ...RESULTS.assignment, resultsPublishedAt: '2026-10-22T11:00:00' })),
      revokeAssignment: vi.fn(() => of(undefined)),
    };
    const confirm = { ask: vi.fn(() => Promise.resolve(opts.confirm ?? true)) };
    TestBed.configureTestingModule({
      imports: [SzobeliEredmenyekComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '9' }) } } },
        { provide: TeacherOralExamService, useValue: api },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: { success: vi.fn(), warning: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SzobeliEredmenyekComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    return { fixture, c: fixture.componentInstance, el, q, api, confirm };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a tábla a csoport minden diákjával; munkamenet nélkül „Nem kezdte el” és nem kattintható', () => {
    const { q, api } = setup();
    expect(api.results).toHaveBeenCalledWith(9);
    const table = q('oral-results-table')!;
    expect(table.textContent).toContain('Kiss Anna');
    expect(table.textContent).toContain('Értékelve');
    expect(table.textContent).toContain('20 / 30');
    expect(table.textContent).toContain('Nem kezdte el');
    expect(q('oral-row-5')).not.toBeNull();
    expect(q('oral-row-6')).toBeNull();
    // A tagként írt, azóta kilépett diák sora jelölve (BE-ORALEXAM-RESULTS-REMOVEDMEMBER-INVISIBLE).
    expect(q('left-group-7')).not.toBeNull();
    expect(q('left-group-5')).toBeNull();
    // 16 év alatti diák szülői hozzájárulás nélkül: jelölve.
    expect(q('awaiting-consent-6')?.textContent).toContain('szülői hozzájárulásra vár');
    expect(q('awaiting-consent-5')).toBeNull();
    expect(q('oral-results-meta')!.textContent).toContain('Szóbeli dolgozat');
  });

  it('a sorra kattintva oldalpanel: szempontok MI-ponttal, előtöltött tanári pont, elvárt elemek, kód, leirat', () => {
    const { fixture, q, api } = setup();
    q('oral-row-5')!.click();
    fixture.detectChanges();
    expect(api.session).toHaveBeenCalledWith(11);
    const panel = q('oral-session-panel')!;
    expect(panel.textContent).toContain('A fényszakasz');
    expect(q('oral-criterion-tartalom')!.textContent).toContain('MI: 16 / 26');
    expect((q('oral-review-tartalom') as HTMLInputElement)).not.toBeNull();
    expect(q('oral-review-szakmai')).toBeNull();
    expect(q('oral-criterion-szakmai')!.textContent).toContain('pont nélkül');
    expect(q('oral-planned-questions')!.textContent).toContain('glükóz');
    expect(q('oral-prep-code')!.textContent).toContain('print(1)');
    expect(q('oral-transcript')!.textContent).toContain('Mi a fotoszintézis?');
    expect(Array.from(q('oral-transcript')!.querySelectorAll('li')).map((li) => li.querySelector('[data-testid="oral-turn-interrupted"]')?.textContent ?? null))
      .toEqual(['(félbeszakítva)', null]);
  });

  it('felülpontozás: a pontozott szempontok a megjegyzéssel; a tábla tanári pontja frissül; tartományon kívül helyi hiba', () => {
    const { fixture, c, q, api } = setup();
    c.select(RESULTS.rows[0]);
    fixture.detectChanges();
    c.setPoints('tartalom', 30);
    c.saveReview();
    expect(api.review).not.toHaveBeenCalled();
    expect(c.reviewError()).toContain('0 és 26');

    c.setPoints('tartalom', 18);
    c.note.set('  Szép  ');
    q('oral-review-save')!.click();
    expect(api.review).toHaveBeenCalledWith(11, { criteria: [{ key: 'tartalom', points: 18 }, { key: 'kommunikacio', points: 4 }], note: 'Szép' });
    fixture.detectChanges();
    expect(c.results()!.rows[0].teacherTotalPoints).toBe(22);
    expect(q('oral-results-table')!.textContent).toContain('22');

    q('oral-review-delete')!.click();
    expect(api.deleteReview).toHaveBeenCalledWith(11);
    expect(c.results()!.rows[0].teacherTotalPoints).toBeNull();
  });

  it('ürített tanári pont mező (null): nincs mentés, helyi hiba - nem megy csendben 0 pont', () => {
    const { fixture, c, api } = setup();
    c.select(RESULTS.rows[0]);
    fixture.detectChanges();
    c.setPoints('kommunikacio', null);
    c.saveReview();
    expect(api.review).not.toHaveBeenCalled();
    expect(c.reviewError()).toBe('„Kommunikatív készség”: 0 és 4 közötti egész pont adható.');
  });

  it('szakaszolt leiratnál sorszámozott szakasz-címek, nyers kulcs nélkül', () => {
    const turn = (segment: string) => ({ speaker: 'student' as const, text: 'x', atSeconds: 0, questionNo: 0, segment });
    const { fixture, c, q } = setup({ session: session({ transcript: [turn('monolog'), turn('kerdesek')] }) });
    c.select(RESULTS.rows[0]);
    fixture.detectChanges();
    const text = q('oral-transcript')!.textContent!;
    expect(text).toContain('1. szakasz');
    expect(text).toContain('2. szakasz');
    expect(text).not.toContain('monolog');
  });

  it('nem értékelt szóbelinél nincs felülpontozás', () => {
    const { fixture, c, q } = setup({ session: session({ status: 'not-graded', message: 'Túl rövid felelet.' }) });
    c.select(RESULTS.rows[0]);
    fixture.detectChanges();
    expect(q('oral-review-save')).toBeNull();
    expect(q('oral-session-panel')!.textContent).toContain('Felülpontozni csak értékelt szóbelit lehet.');
  });

  it('közzététel megerősítéssel; utána a gomb eltűnik; visszavonás', async () => {
    const { fixture, c, q, api, confirm } = setup();
    expect(q('oral-results-publish')).not.toBeNull();
    await c.publish();
    fixture.detectChanges();
    expect(confirm.ask).toHaveBeenCalled();
    expect(api.publishResults).toHaveBeenCalledWith(9);
    expect(q('oral-results-publish')).toBeNull();
    expect(q('oral-results-meta')!.textContent).toContain('eredmény közzétéve');

    await c.revoke();
    fixture.detectChanges();
    expect(api.revokeAssignment).toHaveBeenCalledWith(9);
    expect(q('oral-results-revoke')).toBeNull();
  });

  it('elutasított megerősítésnél nincs közzététel; gyakorlásnál nincs közzététel-gomb; betöltési hiba', async () => {
    const { c, api } = setup({ confirm: false });
    await c.publish();
    expect(api.publishResults).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const practice = setup({ results: of({ ...structuredClone(RESULTS), assignment: { ...RESULTS.assignment, mode: 'practice' } }) });
    expect(practice.q('oral-results-publish')).toBeNull();

    TestBed.resetTestingModule();
    const failing = setup({ results: throwError(() => new HttpErrorResponse({ status: 404, error: { errorMessage: 'A kiadás nem található.' } })) });
    expect(failing.q('oral-results-error')!.textContent).toContain('nem található');
  });
});
