import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { VizsgareszTerkepComponent } from './vizsgaresz-terkep.component';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ExamSessionSnapshotDto, HeatmapCellDto, TechnikumHeatmapDto } from '../../models/technikum.model';

const cell = (over: Partial<HeatmapCellDto>): HeatmapCellDto => ({
  partKey: 'console', points: 8, maxPoints: 15, ratio: 8 / 15, source: 'exam', fromClassTest: true, projectSlug: 'konyvtar',
  projectTitle: 'Könyvtár', assignmentId: 7, sessionId: 31, gradedAt: '2026-10-10T10:00:00', ...over,
});

const heatmap: TechnikumHeatmapDto = {
  groupId: 12, groupName: '13.T', theoryMaxPoints: 40,
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
  async function setup(publish = vi.fn(() => of(undefined))) {
    const api = { heatmap: vi.fn(() => of(structuredClone(heatmap))), snapshot: vi.fn(() => of(snapshot)), publish };
    const toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [VizsgareszTerkepComponent],
      providers: [provideRouter([]), { provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: toast }],
    });
    const fixture = TestBed.createComponent(VizsgareszTerkepComponent);
    fixture.componentRef.setInput('groupId', 12);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api, toast };
  }

  it('diák × öt rész + elméleti teszt, színskála a pontarányból, üres cella eredmény nélkül', async () => {
    const { el, api } = await setup();
    expect(api.heatmap).toHaveBeenCalledWith(12);
    const headers = [...el.querySelectorAll('[data-testid="heatmap"] thead th')].map((th) => th.textContent!.trim());
    expect(headers[1]).toContain('Konzolos alkalmazás');
    expect(headers[6]).toContain('Elméleti teszt');
    const row = el.querySelector('[data-testid="heat-row-55"]')!;
    expect(row.querySelectorAll('td').length).toBe(7);
    expect(el.querySelector('[data-testid="cell-55-console"]')!.className).toContain('bg-warning-subtle');
    expect(el.querySelector('[data-testid="cell-55-api"]')!.className).toContain('bg-success-subtle');
    expect(el.querySelector('[data-testid="cell-55-client"]')!.className).toContain('bg-primary-subtle');
    expect(el.querySelector('[data-testid="theory-55"]')!.className).toContain('bg-danger-subtle');
    expect(el.querySelector('[data-testid="theory-55"]')!.textContent!.trim()).toBe('5/40');
    expect(row.querySelectorAll('.heat-cell--empty').length).toBe(2);
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

  it('a dolgozat-cella a beadott pillanatképet nyitja: bírálat részenként és a kód csak olvasva', async () => {
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
    expect(section.querySelector('.code-ln--action')).toBeNull();
    [...section.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Bezárás')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="snapshot"]')).toBeNull();
  });

  it('közzététel: siker után „közzétéve”, a már közzétett dolgozatnál nincs gomb', async () => {
    const { fixture, el, api, toast } = await setup();
    expect(el.querySelector('[data-testid="technikum-test-8"] button')).toBeNull();
    expect(el.querySelector('[data-testid="technikum-test-8"]')!.textContent).toContain('Eredmény közzétéve');
    el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.click();
    fixture.detectChanges();
    expect(api.publish).toHaveBeenCalledWith(7);
    expect(toast.success).toHaveBeenCalled();
    expect(el.querySelector('[data-testid="technikum-test-7"]')!.textContent).toContain('Eredmény közzétéve');
  });

  it('közzététel: a BE 400-as üzenete változatlanul látszik (pl. még tart a bírálat)', async () => {
    const message = '2 dolgozat bírálata még folyamatban van - néhány perc múlva teheted közzé az eredményt.';
    const publish = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 400, error: { errorType: 'Validation', errorMessage: message } })));
    const { fixture, el } = await setup(publish);
    el.querySelector<HTMLButtonElement>('[data-testid="technikum-test-7"] button')!.click();
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
});
