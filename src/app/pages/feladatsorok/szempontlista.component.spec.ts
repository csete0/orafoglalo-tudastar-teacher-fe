import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { SzempontlistaComponent } from './szempontlista.component';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  GradingQualityDto,
  RubricQuotaDto,
  TeacherRubricDto,
  TeacherRubricItemDto,
  TeacherTaskDto,
} from '../../models/teacher-content.model';

function makeTask(): TeacherTaskDto {
  return {
    id: 7,
    title: 'Levél',
    description: 'd',
    maxPoints: 10,
    taskOrder: 1,
    taskTypeIds: [1],
    subTasks: [
      { id: 101, label: '1. részfeladat', points: 4, snippets: [] },
      { id: 102, label: '2. részfeladat', points: 6, snippets: [] },
    ],
    completeSolutionSnippets: [],
  };
}

function item(overrides: Partial<TeacherRubricItemDto>): TeacherRubricItemDto {
  return {
    id: 1,
    order: 1,
    subTaskId: 101,
    section: null,
    text: 'A cím félkövér',
    points: 1,
    machine: false,
    gate: null,
    gateReason: null,
    ...overrides,
  };
}

function makeRubric(overrides: Partial<TeacherRubricDto> = {}): TeacherRubricDto {
  return {
    id: 5,
    status: 'draft',
    rawTotal: 10,
    examPoints: 10,
    model: 'claude-opus',
    createdAt: '2026-10-07T10:00:00Z',
    items: [
      item({ id: 1, order: 1, subTaskId: 101, text: 'A cím félkövér', points: 4, machine: true, gate: 'ok' }),
      item({ id: 2, order: 2, subTaskId: 102, text: 'A táblázat 3 oszlopos', points: 6, gate: 'failed', gateReason: 'a megoldásban 4 oszlop van' }),
    ],
    problems: [],
    ...overrides,
  };
}

describe('SzempontlistaComponent', () => {
  let service: {
    getRubric: ReturnType<typeof vi.fn>;
    getRubricQuota: ReturnType<typeof vi.fn>;
    createRubricDraft: ReturnType<typeof vi.fn>;
    updateRubricItem: ReturnType<typeof vi.fn>;
    deleteRubricItem: ReturnType<typeof vi.fn>;
    approveRubric: ReturnType<typeof vi.fn>;
  };
  let confirmMock: { ask: ReturnType<typeof vi.fn>; pending: ReturnType<typeof signal<null>>; resolve: ReturnType<typeof vi.fn> };
  let toastMock: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  function create(rubric: TeacherRubricDto | null, opts: { quota?: RubricQuotaDto; quality?: GradingQualityDto | null } = {}) {
    service = {
      getRubric: vi.fn(() => of(rubric)),
      getRubricQuota: vi.fn(() => of(opts.quota ?? { used: 3, limit: 30, month: '2026-10' })),
      createRubricDraft: vi.fn(),
      updateRubricItem: vi.fn(),
      deleteRubricItem: vi.fn(),
      approveRubric: vi.fn(),
    };
    confirmMock = { ask: vi.fn().mockResolvedValue(true), pending: signal(null), resolve: vi.fn() };
    toastMock = { success: vi.fn(), danger: vi.fn(), warning: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SzempontlistaComponent],
      providers: [
        { provide: TeacherRubricService, useValue: service },
        { provide: ConfirmService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
    const fixture = TestBed.createComponent(SzempontlistaComponent);
    fixture.componentRef.setInput('taskSetId', 1);
    fixture.componentRef.setInput('task', makeTask());
    fixture.componentRef.setInput('quality', opts.quality ?? null);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: { nativeElement: HTMLElement }, testId: string) =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  const all = (fixture: { nativeElement: HTMLElement }, testId: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)) as HTMLElement[];

  it('lista nélkül a „Szempontlista készítése” gombot és ELŐRE a költséget/keretet mutatja', () => {
    const fixture = create(null);

    expect(el(fixture, 'rubric-draft-button')!.textContent).toContain('Szempontlista készítése');
    expect(el(fixture, 'rubric-cost')!.textContent).toContain('1 egység a havi keretedből');
    expect(el(fixture, 'rubric-cost')!.textContent).toContain('30 egységből még 27 maradt');
  });

  it('elfogyott keretnél a gomb letiltva, magyarázattal', () => {
    const fixture = create(null, { quota: { used: 30, limit: 30, month: '2026-10' } });

    expect((el(fixture, 'rubric-draft-button') as HTMLButtonElement).disabled).toBe(true);
    expect(el(fixture, 'rubric-draft-blocked')!.textContent).toContain('Elfogyott a havi keret');
  });

  it('irodai feladatnál megoldásfájl nélkül a gomb letiltva, a feltöltést kéri', () => {
    const fixture = create(null, {
      quality: {
        kind: 'office',
        level: 'red',
        checks: [{ key: 'solutionFile', ok: false, label: 'Nincs megoldásfájl' }],
        rubric: { status: 'none', itemCount: 0, machineCount: 0 },
      },
    });

    expect((el(fixture, 'rubric-draft-button') as HTMLButtonElement).disabled).toBe(true);
    expect(el(fixture, 'rubric-draft-blocked')!.textContent).toContain('töltsd fel a saját megoldásodat');
  });

  it('készítés közben töltés-állapotot mutat, utána a vázlatot és frissíti a keretet', () => {
    const fixture = create(null);
    const response = new Subject<TeacherRubricDto>();
    service.createRubricDraft.mockReturnValue(response);
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);

    fixture.componentInstance.createDraft();
    fixture.detectChanges();
    expect(el(fixture, 'rubric-generating')!.textContent).toContain('1–2 percig');
    expect(el(fixture, 'rubric-draft-button')).toBeNull();

    response.next(makeRubric());
    fixture.detectChanges();

    expect(el(fixture, 'rubric-generating')).toBeNull();
    expect(all(fixture, 'rubric-item')).toHaveLength(2);
    expect(service.getRubricQuota).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalled();
  });

  it('keret-hiba (RubricDraftQuotaExceeded) és hiányzó megoldás (RubricDraftNeedsSolution) érthető üzenettel', () => {
    const fixture = create(null);
    service.createRubricDraft.mockReturnValue(throwError(() => ({ error: { errorType: 'RubricDraftQuotaExceeded', errorMessage: 'x' } })));
    fixture.componentInstance.createDraft();
    fixture.detectChanges();
    expect(el(fixture, 'rubric-draft-error')!.textContent).toContain('Elfogyott a havi szempontlista-keret');

    service.createRubricDraft.mockReturnValue(throwError(() => ({ error: { errorType: 'RubricDraftNeedsSolution', errorMessage: 'x' } })));
    fixture.componentInstance.createDraft();
    fixture.detectChanges();
    expect(el(fixture, 'rubric-draft-error')!.textContent).toContain('töltsd fel a saját megoldásodat');
  });

  it('a vázlat részfeladatonként csoportosítva, gépi/MI jelöléssel és a kapu eredményével jelenik meg', () => {
    const fixture = create(makeRubric());

    const groups = all(fixture, 'rubric-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].textContent).toContain('1. részfeladat');
    expect(groups[1].textContent).toContain('2. részfeladat');
    const kinds = all(fixture, 'rubric-item-kind').map((k) => k.textContent!.trim());
    expect(kinds).toEqual(['gépi', 'MI']);
    const gates = all(fixture, 'rubric-item-gate').map((g) => g.textContent!.replace(/\s+/g, ' ').trim());
    expect(gates[0]).toContain('teljesült a megoldásodon');
    expect(gates[1]).toBe('nem teljesült a megoldásodon – MI-re állítva: a megoldásban 4 oszlop van');
    expect(el(fixture, 'rubric-status')!.textContent).toContain('Vázlat');
  });

  it('hosszú listánál a csoportok alapból összecsukva, kattintásra nyílnak', () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ id: i + 1, order: i + 1, subTaskId: i < 5 ? 101 : 102, points: 1 }));
    const fixture = create(makeRubric({ items }));

    expect(all(fixture, 'rubric-item')).toHaveLength(0);
    (all(fixture, 'rubric-group')[0].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(all(fixture, 'rubric-item')).toHaveLength(5);
  });

  it('a tétel szövege és pontja szerkeszthető (gépi tételé is), mentéskor a PUT a módosított értéket küldi', () => {
    const fixture = create(makeRubric());
    const component = fixture.componentInstance;
    service.updateRubricItem.mockReturnValue(of(makeRubric()));

    component.setItemText(1, 'A cím félkövér és középre zárt');
    component.setItemPoints(1, 3);
    fixture.detectChanges();
    expect(el(fixture, 'rubric-approve-blocked')!.textContent).toContain('mentsd el');
    (el(fixture, 'rubric-item-save') as HTMLButtonElement).click();

    expect(service.updateRubricItem).toHaveBeenCalledWith(1, 7, 1, { text: 'A cím félkövér és középre zárt', points: 3 });
    // A gépi szabályhoz nincs mező - csak a magyarázat, hogy nem szerkeszthető.
    expect(fixture.nativeElement.textContent).toContain('A gépi ellenőrzés szabálya nem szerkeszthető');
  });

  it('gépi tétel is törölhető, megerősítés után', async () => {
    const fixture = create(makeRubric());
    service.deleteRubricItem.mockReturnValue(of(makeRubric({ items: [makeRubric().items[1]] })));

    await fixture.componentInstance.deleteItem(makeRubric().items[0]);
    fixture.detectChanges();

    expect(confirmMock.ask.mock.calls[0][0].message).toContain('gépi tételt');
    expect(service.deleteRubricItem).toHaveBeenCalledWith(1, 7, 1);
    expect(all(fixture, 'rubric-item')).toHaveLength(1);
  });

  it('problémánál a jóváhagyás letiltva, a problémák és a magyarázat kiírva', () => {
    const fixture = create(makeRubric({ problems: ['A 2. részfeladatnak nincs tétele.'] }));

    expect(el(fixture, 'rubric-problems')!.textContent).toContain('A 2. részfeladatnak nincs tétele.');
    expect((el(fixture, 'rubric-approve') as HTMLButtonElement).disabled).toBe(true);
    expect(el(fixture, 'rubric-approve-blocked')!.textContent).toContain('javítsd a fenti problémákat');
  });

  it('jóváhagyás után „Jóváhagyva” jelölés, a tételek csak olvashatók, „Új vázlat” kérhető', () => {
    const fixture = create(makeRubric());
    service.approveRubric.mockReturnValue(of(makeRubric({ status: 'approved' })));

    (el(fixture, 'rubric-approve') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.approveRubric).toHaveBeenCalledWith(1, 7);
    expect(el(fixture, 'rubric-status')!.textContent).toContain('Jóváhagyva');
    expect(el(fixture, 'rubric-item-delete')).toBeNull();
    expect(el(fixture, 'rubric-approve')).toBeNull();
    expect(el(fixture, 'rubric-draft-button')!.textContent).toContain('Új vázlat');
  });

  it('meglévő lista mellett az új vázlat előtt megerősítést kér (a költséggel)', async () => {
    const fixture = create(makeRubric({ status: 'approved' }));
    confirmMock.ask.mockResolvedValue(false);

    await fixture.componentInstance.createDraft();

    expect(confirmMock.ask.mock.calls[0][0].message).toContain('1 egység a havi keretedből');
    expect(service.createRubricDraft).not.toHaveBeenCalled();
  });
});
