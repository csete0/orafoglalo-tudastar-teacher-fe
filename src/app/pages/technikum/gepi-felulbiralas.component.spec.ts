import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { GepiFelulbiralasComponent, caseGroups } from './gepi-felulbiralas.component';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { CaseDetailDto, ExamPartResultDto, ExamSessionSnapshotDto } from '../../models/technikum.model';

const kase = (over: Partial<CaseDetailDto>): CaseDetailDto => ({
  key: 'betoltes', title: 'Lista betöltése', passed: true, reason: null, points: 3, rubricItemKey: null, groupKey: 'betoltes', ...over,
});

const result = (cases: CaseDetailDto[], machineReview: ExamPartResultDto['detail']['machineReview'] = null): ExamPartResultDto => ({
  id: 41, partKey: 'client', status: 'graded', points: 6, maxPoints: 15, source: 'exam', sessionId: 31, gradedAt: '',
  detail: { message: null, ai: null, machineReview,
    machine: { status: 'done', points: 6, maxPoints: 10, compileOutput: null, cases } },
});

const machineOnly = [
  kase({}),
  kase({ key: 'szures-1', title: 'Szűrés: regény', groupKey: 'szures' }),
  kase({ key: 'szures-2', title: 'Szűrés: vers', groupKey: 'szures', passed: false, reason: 'a lista nem frissült', points: 2 }),
  kase({ key: 'hiba', title: 'Hibaüzenet', groupKey: 'hiba', passed: false, reason: 'hiányzó elem', points: 4 }),
];

describe('GepiFelulbiralasComponent', () => {
  async function setup(r: ExamPartResultDto) {
    const fresh = { sessionId: 31 } as ExamSessionSnapshotDto;
    const api = { scoreMachine: vi.fn(() => of(fresh)), revertMachine: vi.fn(() => of(fresh)) };
    const toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GepiFelulbiralasComponent],
      providers: [{ provide: TeacherTechnikumService, useValue: api }, { provide: ToastService, useValue: toast }],
    });
    const fixture = TestBed.createComponent(GepiFelulbiralasComponent);
    fixture.componentRef.setInput('result', r);
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, api, toast, saved, fresh };
  }

  const select = (el: HTMLElement, group: string) => el.querySelector<HTMLSelectElement>(`[data-testid="machine-verdict-${group}"]`)!;
  const choose = (el: HTMLElement, group: string, value: string) => {
    const s = select(el, group);
    s.value = value;
    s.dispatchEvent(new Event('change'));
  };

  it('caseGroups: csoportonként a gépi ítélet (mind átment), a pont és a mentett kézi ítélet; csoport nélkül az eset a saját csoportja', () => {
    const groups = caseGroups([
      ...machineOnly.slice(0, 3),
      kase({ key: 'hiba', title: 'Hibaüzenet', groupKey: null, passed: true, machinePassed: false, points: 4 }),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.points, g.machinePassed, g.saved, g.single])).toEqual([
      ['betoltes', 'Lista betöltése', 3, true, 'gepi', true],
      ['szures', 'szures', 5, false, 'gepi', false],
      ['hiba', 'Hibaüzenet', 4, false, 'atment', true],
    ]);
  });

  it('csoportonkénti kézi ítélet + megjegyzés: a mentés a teljes felülbírálást küldi, a friss pillanatkép a szülőhöz megy', async () => {
    const { fixture, el, api, toast, saved, fresh } = await setup(result(machineOnly));
    expect(el.querySelectorAll('[data-testid^="machine-group-"]').length).toBe(3);
    expect(el.querySelector('[data-testid="machine-group-szures"]')!.textContent).toContain('Szűrés: vers');
    expect(el.querySelector('[data-testid="machine-group-szures"]')!.textContent).toContain('a lista nem frissült');
    expect(select(el, 'szures').value).toBe('gepi');
    const save = el.querySelector<HTMLButtonElement>('[data-testid="machine-save-41"]')!;
    expect(save.disabled).toBe(true);
    expect(el.querySelector('[data-testid="machine-revert-41"]')).toBeNull();

    choose(el, 'szures', 'atment');
    choose(el, 'hiba', 'elbukott');
    const note = el.querySelector<HTMLTextAreaElement>('[data-testid="machine-note-41"]')!;
    note.value = '  A böngészőben frissül a lista.  ';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(save.disabled).toBe(false);
    save.click();
    expect(api.scoreMachine).toHaveBeenCalledWith(41, [{ groupKey: 'szures', passed: true }, { groupKey: 'hiba', passed: false }],
      'A böngészőben frissül a lista.');
    expect(saved).toHaveBeenCalledWith(fresh);
    expect(toast.success).toHaveBeenCalled();
  });

  it('mentett felülbírálás: a kézi ítélet és a megjegyzés betöltve; a „Gépi ítélet” mindenhol = visszavonás; külön Visszavonás gomb', async () => {
    const overridden = [machineOnly[0], { ...machineOnly[1] }, { ...machineOnly[2], passed: true, machinePassed: false }, machineOnly[3]];
    const { fixture, el, api } = await setup(result(overridden, { reviewedAt: '2026-10-20T09:00:00', teacherProfileId: 3, note: 'Mérőhiba.' }));
    expect(select(el, 'szures').value).toBe('atment');
    expect(el.querySelector('[data-testid="machine-group-szures"] [data-testid="group-teacher-judged"]')).not.toBeNull();
    expect(el.querySelector<HTMLTextAreaElement>('[data-testid="machine-note-41"]')!.value).toBe('Mérőhiba.');
    expect(el.textContent).toContain('kézzel felülbírálva: 2026.10.20.');

    choose(el, 'szures', 'gepi');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="machine-save-41"]')!.click();
    expect(api.scoreMachine).not.toHaveBeenCalled();
    expect(api.revertMachine).toHaveBeenCalledWith(41);

    el.querySelector<HTMLButtonElement>('[data-testid="machine-revert-41"]')!.click();
    expect(api.revertMachine).toHaveBeenCalledTimes(2);
  });

  it('a BE hibaüzenete (pl. 409 böngészős beadás) a gomb alatt; a szülő nem kap pillanatképet', async () => {
    const { fixture, el, api, saved } = await setup(result(machineOnly));
    api.scoreMachine.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409,
      error: { errorMessage: 'A gépi esetek kézi felülbírálata csak saját gépes (build) beadásnál lehetséges.' } })));
    choose(el, 'hiba', 'atment');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="machine-save-41"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="machine-error"]')!.textContent).toContain('csak saját gépes (build) beadásnál');
    expect(saved).not.toHaveBeenCalled();
  });

  it('csak megjegyzés felülbírálás nélkül: nem küld kérést, kézi ítéletet kér', async () => {
    const { fixture, el, api } = await setup(result(machineOnly));
    const note = el.querySelector<HTMLTextAreaElement>('[data-testid="machine-note-41"]')!;
    note.value = 'Csak megjegyzés';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="machine-save-41"]')!.click();
    fixture.detectChanges();
    expect(api.scoreMachine).not.toHaveBeenCalled();
    expect(api.revertMachine).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="machine-error"]')!.textContent).toContain('legalább egy csoportnál');
  });
});
