import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { VizsgareszTerkepComponent } from './vizsgaresz-terkep.component';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ExamSessionSnapshotDto, HeatmapCellDto, TechnikumHeatmapDto } from '../../models/technikum.model';

const cell = (over: Partial<HeatmapCellDto>): HeatmapCellDto => ({
  partKey: 'console', points: 8, maxPoints: 15, ratio: 8 / 15, source: 'exam', fromClassTest: true, projectSlug: 'konyvtar',
  projectTitle: 'Könyvtár', assignmentId: 7, sessionId: 31, gradedAt: '2026-10-10T10:00:00', gradingFailed: false, ...over,
});

const heatmap: TechnikumHeatmapDto = {
  groupId: 12, groupName: '13.T', theoryMaxPoints: 40, testsOnly: false,
  parts: [{ key: 'console', maxPoints: 15 }, { key: 'gui', maxPoints: 10 }, { key: 'web', maxPoints: 10 }, { key: 'api', maxPoints: 15 }, { key: 'client', maxPoints: 15 }],
  tests: [
    { assignmentId: 7, projectSlug: 'konyvtar', projectTitle: 'Könyvtár', opensAt: null, dueAt: '2026-10-10T12:00:00', closedSessions: 4, resultsPublished: false },
    { assignmentId: 8, projectSlug: 'mozi', projectTitle: 'Mozi', opensAt: null, dueAt: null, closedSessions: 2, resultsPublished: true },
  ],
  students: [
    {
      userId: 55, name: 'Kiss Anna', theory: { points: 5, maxPoints: 40, ratio: 0.125 },
      cells: [
        cell({}),
        cell({ partKey: 'api', points: 14, ratio: 14 / 15, source: 'practice', fromClassTest: false, assignmentId: 9, sessionId: null }),
        cell({ partKey: 'web', points: 0, maxPoints: 10, ratio: 0, gradingFailed: true }),
        cell({ partKey: 'client', points: 9, ratio: 0.6, source: 'practice', fromClassTest: false, assignmentId: null, sessionId: null }),
      ],
    },
  ],
};

const snapshot: ExamSessionSnapshotDto = {
  sessionId: 31, assignmentId: 7, userId: 55, studentName: 'Kiss Anna', projectSlug: 'konyvtar', projectTitle: 'Könyvtár', runtime: 'judge0-aspnet',
  files: { 'console/Program.cs': '// BEADOTT\nConsole.WriteLine(1);', 'db/schema.sql': 'CREATE TABLE x();' }, readOnlyPaths: ['db/schema.sql'],
  session: {
    id: 31, projectSlug: 'konyvtar', assignmentId: 7, status: 'graded', startedAt: '', deadline: '', submittedAt: '2026-10-10T11:30:00',
    remainingSeconds: 0, resultsVisible: true, totalPoints: 30, maxPoints: 65, passed: true,
    parts: [
      { partKey: 'console', title: 'Konzol', maxPoints: 15, result: { id: 1, partKey: 'console', status: 'graded', points: 8, maxPoints: 15, source: 'exam',
        sessionId: 31, gradedAt: '', detail: { message: null, ai: null,
          machine: { status: 'done', points: 8, maxPoints: 15, compileOutput: null, cases: [
            { key: 'c1', title: 'Beolvasás', passed: true, reason: null, points: 4, rubricItemKey: null },
            { key: 'c2', title: 'Statisztika', passed: false, reason: 'Hibás átlag', points: 0, rubricItemKey: null }] } } } },
      { partKey: 'gui', title: 'GUI', maxPoints: 10, result: { id: 2, partKey: 'gui', status: 'pending', points: 0, maxPoints: 10, source: 'exam',
        sessionId: 31, gradedAt: '', detail: { message: null, ai: null, machine: null } } },
    ],
  },
};

describe('VizsgareszTerkepComponent', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  async function setup(publish = vi.fn(() => of({ published: 4, sessionsWithFailedParts: 0 })), confirmed = true) {
    const api = { heatmap: vi.fn(() => of(structuredClone(heatmap))), snapshot: vi.fn(() => of(snapshot)), publish, comments: vi.fn(() => of([])) };
    const toast = { success: vi.fn() };
    const confirm = { ask: vi.fn(async (_options: { message: string }) => confirmed) };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api, toast, confirm };
  }

  it('diák × öt rész + elméleti teszt, színskála a pontarányból, üres cella eredmény nélkül', async () => {
    const { el, api } = await setup();
    expect(api.heatmap).toHaveBeenCalledWith(12);
    const headers = [...el.querySelectorAll('[data-testid="heatmap"] thead th')].map((th) => th.textContent!.trim());
    expect(headers[1]).toContain('Konzolos alkalmazás');
    expect(headers[6]).toContain('Elméleti teszt');
    const row = el.querySelector('[data-testid="heat-row-55"]')!;
    expect(row.querySelectorAll('td').length).toBe(6);
    expect(row.querySelector('th[scope="row"]')).not.toBeNull();
    expect(row.querySelector('.heat-cell--empty .sr-only')!.textContent).toBe('nincs eredmény');
    expect(el.querySelector('[data-testid="cell-55-console"]')!.className).toContain('bg-warning-subtle');
    expect(el.querySelector('[data-testid="cell-55-api"]')!.className).toContain('bg-success-subtle');
    expect(el.querySelector('[data-testid="cell-55-client"]')!.className).toContain('bg-primary-subtle');
    expect(el.querySelector('[data-testid="theory-55"]')!.className).toContain('bg-danger-subtle');
    expect(el.querySelector('[data-testid="theory-55"]')!.textContent!.trim()).toBe('5/40');
    expect(row.querySelectorAll('.heat-cell--empty').length).toBe(1);
    expect(el.querySelector('[data-testid="tests-only-note"]')).toBeNull();
  });

  it('prémium nélkül (testsOnly) jelzi, hogy csak a kiadott dolgozatok eredménye látszik; a dolgozat megnyitható és közzétehető', () => {
    const api = { heatmap: vi.fn(() => of({ ...structuredClone(heatmap), testsOnly: true })), snapshot: vi.fn(() => of(snapshot)), comments: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="tests-only-note"]')!.textContent).toContain('már kiadott technikumi dolgozatok eredménye');
    expect(el.querySelector('[data-testid="technikum-test-7"] button')!.textContent).toContain('Eredmények közzététele');
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    expect(api.snapshot).toHaveBeenCalledWith(31);
  });

  it('a végleg sikertelen bírálatú dolgozat-rész 0 pontként, külön jelölve (és nem a sikereseké)', async () => {
    const { el } = await setup();
    const failed = el.querySelector('[data-testid="cell-55-web"]')!;
    expect(failed.className).toContain('heat-cell--failed');
    expect(failed.textContent).toContain('0/10');
    expect(failed.querySelector('.sr-only')!.textContent).toContain('bírálat sikertelen');
    expect(failed.getAttribute('title')).toContain('végleg sikertelen');
    expect(el.querySelector('[data-testid="cell-55-console"]')!.className).not.toContain('heat-cell--failed');
  });

  it('a térkép a saját dobozában görög (390 px-en a lap nem lesz szélesebb): az .sr-only szövegek is a görgető dobozon belül', async () => {
    const { el } = await setup();
    const scroll = el.querySelector('[data-testid="heatmap-scroll"]')!;
    expect(scroll.className).toContain('overflow-x-auto');
    expect(scroll.className).toContain('relative');
    expect(scroll.querySelector('[data-testid="heatmap"]')).not.toBeNull();
  });

  it('nem értékelt MI-szempontok: a cella jelölve, a pillanatképben a szempontok „nem értékelt”-ek, részleges eredmény ítélet nélkül', async () => {
    const api = {
      comments: vi.fn(() => of([])),
      heatmap: vi.fn(() => of({ ...structuredClone(heatmap), students: [{ ...heatmap.students[0],
        cells: [cell({ points: 10, ratio: 10 / 15, aiNotEvaluatedPoints: 5 })] }] })),
      snapshot: vi.fn(() => of({ ...snapshot, session: { ...snapshot.session, totalPoints: 25, passed: null, notEvaluatedPoints: 5, parts: [
        { partKey: 'console' as const, title: 'Konzol', maxPoints: 15, result: { id: 1, partKey: 'console' as const, status: 'graded', points: 10, maxPoints: 15,
          source: 'exam', sessionId: 31, gradedAt: '', detail: { message: null, machine: { status: 'done', points: 10, maxPoints: 10, compileOutput: null, cases: [] },
            ai: { status: 'unavailable', points: 0, maxPoints: 5, message: 'Nem értékelt (MI-keret: a tanár havi MI-értékelési kerete elfogyott)',
              items: [{ key: 'k', points: 0, maxPoints: 5, reason: 'Beszédes nevek', notEvaluated: true }] } } } }] } })),
      publish: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: { success: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const c = el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!;
    expect(c.className).toContain('heat-cell--ai-na');
    expect(c.textContent).toContain('5 pont MI-szempont nem értékelt');
    expect(c.getAttribute('title')).toContain('MI-szempont nem értékelt');
    c.click();
    fixture.detectChanges();
    const section = el.querySelector('[data-testid="snapshot"]')!;
    expect(section.querySelector('[data-testid="snapshot-partial"]')).not.toBeNull();
    expect(section.textContent).not.toContain('nem felelt meg');
    expect(section.querySelector('[data-testid="snapshot-not-evaluated"]')!.textContent).toContain('5 pontnyi MI-szempont');
    expect(section.querySelector('[data-testid="item-not-evaluated"]')).not.toBeNull();
    expect(section.textContent).toContain('Beszédes nevek');
  });

  it('kilépett diák: jelölt sor, a dolgozat pillanatképe csak olvasható (nincs kézi pontozás)', async () => {
    const api = {
      comments: vi.fn(() => of([])),
      heatmap: vi.fn(() => of({ ...structuredClone(heatmap), students: [...structuredClone(heatmap).students,
        { userId: 66, name: 'Volt Diák', theory: null, leftGroup: true, cells: [cell({ points: 10, ratio: 10 / 15 })] }] })),
      snapshot: vi.fn(() => of({ ...snapshot, userId: 66, leftGroup: true, session: { ...snapshot.session, notEvaluatedPoints: 5, parts: [
        { partKey: 'console' as const, title: 'Konzol', maxPoints: 15, result: { id: 1, partKey: 'console' as const, status: 'graded', points: 10, maxPoints: 15,
          source: 'exam', sessionId: 31, gradedAt: '', detail: { message: null, machine: { status: 'done', points: 10, maxPoints: 10, compileOutput: null, cases: [] },
            ai: { status: 'done', points: 0, maxPoints: 5, message: null, items: [{ key: 'k', points: 0, maxPoints: 5, reason: 'Beszédes nevek', notEvaluated: false }] } } } }] } })),
      publish: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: { success: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="left-group-66"]')!.textContent).toContain('kilépett a csoportból');
    expect(el.querySelector('[data-testid="left-group-55"]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="cell-66-console"]')!.click();
    fixture.detectChanges();
    const section = el.querySelector('[data-testid="snapshot"]')!;
    expect(section.querySelector('[data-testid="snapshot-left-group"]')).not.toBeNull();
    expect(section.querySelector('[data-testid="snapshot-left-ungradable"]')!.textContent).toContain('A diák kilépett, nem pontozható');
    expect(section.textContent).toContain('Beszédes nevek');
    expect(section.querySelector('[data-testid^="rubric-input-"]')).toBeNull();
    expect(section.querySelector('[data-testid^="rubric-save-"]')).toBeNull();
  });

  it('kézi pontozás: a szempont pontja szerkeszthető, mentés után a pillanatkép és a térkép frissül; hibás pont elutasítva; visszavonás', async () => {
    const part = (points: number, aiPoints: number | null, review: boolean): ExamSessionSnapshotDto => ({ ...snapshot, session: { ...snapshot.session,
      notEvaluatedPoints: aiPoints === null ? 5 : 0, passed: null, parts: [{ partKey: 'console' as const, title: 'Konzol', maxPoints: 15,
        result: { id: 77, partKey: 'console' as const, status: 'graded', points: 10 + points, maxPoints: 15, source: 'exam', sessionId: 31, gradedAt: '',
          detail: { message: null, review: review ? { reviewedAt: '2026-10-19T08:00:00', teacherProfileId: 3 } : null,
            machine: { status: 'done', points: 10, maxPoints: 10, compileOutput: null, cases: [] },
            ai: { status: 'unavailable', points, maxPoints: 5, message: 'Nem értékelt (MI-keret)',
              items: [{ key: 'nevek', points, maxPoints: 5, reason: 'Beszédes nevek', notEvaluated: true, aiPoints }] } } } }] } });
    const api = {
      comments: vi.fn(() => of([])),
      heatmap: vi.fn(() => of(structuredClone(heatmap))),
      snapshot: vi.fn(() => of(part(0, null, false))),
      scoreRubric: vi.fn(() => of(part(4, 0, true))),
      revertRubric: vi.fn(() => of(part(0, null, false))),
      publish: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: { success: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    fixture.detectChanges();

    const input = el.querySelector<HTMLInputElement>('[data-testid="rubric-input-nevek"]')!;
    expect(input.closest('li')!.className).toContain('rubric-open');
    const save = el.querySelector<HTMLButtonElement>('[data-testid="rubric-save-77"]')!;
    expect(save.disabled).toBe(true);
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    save.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="rubric-error"]')!.textContent).toContain('0 és 5');
    expect(api.scoreRubric).not.toHaveBeenCalled();

    input.value = '4';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    save.click();
    fixture.detectChanges();
    expect(api.scoreRubric).toHaveBeenCalledWith(77, [{ key: 'nevek', points: 4 }]);
    expect(api.heatmap).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="item-teacher-scored"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="item-not-evaluated"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="rubric-revert-77"]')!.click();
    fixture.detectChanges();
    expect(api.revertRubric).toHaveBeenCalledWith(77);
    expect(el.querySelector('[data-testid="item-not-evaluated"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="rubric-revert-77"]')).toBeNull();
  });

  it('gépi felülbírálás: csak saját gépes kliens-részen (csoportkulcsos esetek), mentés után a pillanatkép és a térkép frissül', async () => {
    const clientPart = (build: boolean, passed: boolean): ExamSessionSnapshotDto => ({ ...snapshot, session: { ...snapshot.session, parts: [
      snapshot.session.parts[0],
      { partKey: 'client' as const, title: 'Kliens', maxPoints: 15, result: { id: 88, partKey: 'client' as const, status: 'graded', points: passed ? 10 : 6,
        maxPoints: 15, source: 'exam', sessionId: 31, gradedAt: '', detail: { message: null, ai: null,
          machineReview: passed ? { reviewedAt: '2026-10-20T09:00:00', teacherProfileId: 3, note: null } : null,
          machine: { status: 'done', points: passed ? 10 : 6, maxPoints: 10, compileOutput: null, cases: [
            { key: 'betoltes', title: 'Lista', passed: true, reason: null, points: 6, rubricItemKey: null, groupKey: build ? 'betoltes' : null },
            { key: 'hiba', title: 'Hibaüzenet', passed, reason: passed ? null : 'hiányzó elem', points: 4, rubricItemKey: null,
              groupKey: build ? 'hiba' : null, machinePassed: passed ? false : null }] } } } }] } });
    const api = {
      comments: vi.fn(() => of([])),
      heatmap: vi.fn(() => of(structuredClone(heatmap))),
      snapshot: vi.fn(() => of(clientPart(false, false))),
      scoreMachine: vi.fn(() => of(clientPart(true, true))),
      publish: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: { success: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // Böngészős kliens-rész és más rész: nincs felülbírálás-UI, a gépi esetek sima listája.
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="snapshot-parts"]')!.textContent).toContain('hiányzó elem');
    expect(el.querySelector('app-gepi-felulbiralas')).toBeNull();

    api.snapshot.mockReturnValue(of(clientPart(true, false)));
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('app-gepi-felulbiralas').length).toBe(1);
    const verdict = el.querySelector<HTMLSelectElement>('[data-testid="machine-verdict-hiba"]')!;
    verdict.value = 'atment';
    verdict.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="machine-save-88"]')!.click();
    fixture.detectChanges();
    expect(api.scoreMachine).toHaveBeenCalledWith(88, [{ groupKey: 'hiba', passed: true }], null);
    expect(api.heatmap).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="machine-revert-88"]')).not.toBeNull();
    expect(el.querySelector<HTMLSelectElement>('[data-testid="machine-verdict-hiba"]')!.value).toBe('atment');

    // A kilépett diák dolgozatán nincs felülbírálás.
    api.snapshot.mockReturnValue(of({ ...clientPart(true, false), leftGroup: true }));
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-gepi-felulbiralas')).toBeNull();
  });

  it('a nem dolgozatból jövő cella a projekt osztály-nézetébe visz a diák kódjához; kiadás nélkül nem kattintható', async () => {
    const { el } = await setup();
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="cell-55-api"]')!;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/feladatsorok/projektek/kiadas/9?diak=55');
    expect(el.querySelector('[data-testid="cell-55-client"]')!.tagName).toBe('SPAN');
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    link.click();
    expect(nav).toHaveBeenCalled();
  });

  it('a dolgozat-cella a beadott pillanatképet nyitja: bírálat részenként és a kód vizsgarészenként, megjegyezhetően', async () => {
    const { fixture, el, api } = await setup();
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    fixture.detectChanges();
    expect(api.snapshot).toHaveBeenCalledWith(31);
    const section = el.querySelector('[data-testid="snapshot"]')!;
    expect(section.textContent).toContain('Kiss Anna – Könyvtár');
    expect(section.textContent).toContain('30/65 pont');
    expect(section.textContent).toContain('megfelelt');
    const parts = section.querySelector('[data-testid="snapshot-parts"]')!.textContent!;
    expect(parts).toContain('8/15');
    expect(parts).toContain('Hibás átlag');
    expect(parts).toContain('bírálat folyamatban');
    expect(section.querySelector('[data-testid="code-view"]')!.textContent).toContain('// BEADOTT');
    // A diák saját fájlja megjegyezhető (sorszám-gomb); a fülek a vizsgarészek.
    expect(section.querySelector('.code-ln--action')).not.toBeNull();
    expect(section.querySelector('[data-testid="part-tab-console"]')!.getAttribute('aria-selected')).toBe('true');
    expect(api.comments).toHaveBeenCalledWith(31);
    [...section.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Bezárás')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="snapshot"]')).toBeNull();
  });

  it('közzététel: siker után „közzétéve”, a már közzétett dolgozatnál nincs gomb', async () => {
    const { fixture, el, api, toast } = await setup();
    expect(el.querySelector('[data-testid="technikum-test-8"] button')).toBeNull();
    expect(el.querySelector('[data-testid="technikum-test-8"]')!.textContent).toContain('Eredmény közzétéve');
    el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.click();
    await settle();
    fixture.detectChanges();
    expect(api.publish).toHaveBeenCalledWith(7);
    expect(toast.success).toHaveBeenCalled();
    expect(el.querySelector('[data-testid="technikum-test-7"]')!.textContent).toContain('Eredmény közzétéve');
    expect(el.querySelector('[data-testid="publish-warning"]')).toBeNull();
  });

  it('közzététel előtt megerősítést kér: a beadott dolgozatok száma, a 0 pontos és a nem értékelt részek; mégsem → nem tesz közzé', async () => {
    const cells = heatmap.students[0].cells;
    cells.push(cell({ partKey: 'gui', points: 4, maxPoints: 10, ratio: 0.4, aiNotEvaluatedPoints: 6 }));
    try {
      const { fixture, el, api, confirm } = await setup(undefined, false);
      el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.click();
      await settle();
      fixture.detectChanges();
      const message = confirm.ask.mock.calls[0]![0].message;
      expect(message).toContain('4 beadott dolgozat');
      expect(message).toContain('1 rész bírálata végleg sikertelen');
      expect(message).toContain('1 részben nem értékelt MI-szempontok');
      expect(api.publish).not.toHaveBeenCalled();
      expect(el.querySelector('[data-testid="technikum-test-7"] button')).not.toBeNull();
    } finally {
      cells.pop();
    }
  });

  it('másik csoportra váltva újratölt, és a nyitott pillanatkép a vázlatokkal együtt bezárul', async () => {
    const { fixture, el, api } = await setup();
    el.querySelector<HTMLButtonElement>('[data-testid="cell-55-console"]')!.click();
    fixture.detectChanges();
    fixture.componentInstance.setDraft(1, 'k', '3');
    fixture.componentRef.setInput('groupId', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.heatmap).toHaveBeenLastCalledWith(13);
    expect(el.querySelector('[data-testid="snapshot"]')).toBeNull();
    expect(fixture.componentInstance.drafts()).toEqual({});
  });

  it('közzététel: ha egyes részek bírálata végleg sikertelen, figyelmeztet (0 pont)', async () => {
    const { fixture, el } = await setup(vi.fn(() => of({ published: 4, sessionsWithFailedParts: 2 })));
    el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.click();
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="publish-warning"]')!.textContent).toContain('2 dolgozat egy vagy több részének bírálata végleg sikertelen');
  });

  it('közzététel: a BE 400-as üzenete változatlanul látszik (pl. még tart a bírálat)', async () => {
    const message = '2 dolgozat bírálata még folyamatban van - néhány perc múlva teheted közzé az eredményt.';
    const publish = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 400, error: { errorType: 'Validation', errorMessage: message } })));
    const { fixture, el } = await setup(publish);
    el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.click();
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="publish-error"]')!.textContent!.trim()).toBe(message);
    expect(el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.disabled).toBe(false);
  });

  it('a betöltés hibája (pl. kikapcsolt modul) üzenetként jelenik meg', async () => {
    const api = { heatmap: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404, error: { errorType: 'FeatureDisabled', errorMessage: 'A technikumi modul nincs bekapcsolva.' } }))) };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A technikumi modul nincs bekapcsolva.');
    expect(fixture.nativeElement.querySelector('[data-testid="heatmap"]')).toBeNull();
  });

  it('kikapcsolt modulnál (404 FeatureDisabled) jelzi a szülőnek, más hibánál nem', () => {
    const run = (status: number, errorType: string) => {
      TestBed.resetTestingModule();
      const api = { heatmap: vi.fn(() => throwError(() => new HttpErrorResponse({ status, error: { errorType, errorMessage: 'x' } }))) };
      TestBed.configureTestingModule({ imports: [VizsgareszTerkepComponent], providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }] });
      const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
      const spy = vi.fn();
      fixture.componentInstance.unavailable.subscribe(spy);
      fixture.componentRef.setInput('groupId', 3);
      fixture.detectChanges();
      return spy;
    };
    expect(run(404, 'FeatureDisabled')).toHaveBeenCalledTimes(1);
    expect(run(404, 'NotFound')).not.toHaveBeenCalled();
    expect(run(500, 'Unknown')).not.toHaveBeenCalled();
  });
});
