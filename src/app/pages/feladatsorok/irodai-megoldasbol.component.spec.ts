import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { IrodaiMegoldasbolComponent, MAX_FILE_BYTES, OFFICE_POLL_MS, OFFICE_PREMIUM_MESSAGE } from './irodai-megoldasbol.component';
import { TeacherOfficeTaskService } from '../../services/teacher-office-task/teacher-office-task.service';
import { ToastService } from '../../shared/toast/toast.service';
import { AiHelperQuotaDto } from '../../shared/ai-helper-quota.util';
import {
  OfficeTaskJobDto,
  OfficeTaskProposal,
  OfficeTaskReport,
  OfficeTaskValidateResult,
  OfficeUndoOp,
} from '../../models/office-task.model';

const op = (o: Partial<OfficeUndoOp> = {}): OfficeUndoOp => ({
  op: 'clearFormulas',
  sheet: 'Adatok',
  range: 'B5',
  name: null,
  index: null,
  columns: null,
  parts: null,
  enabled: true,
  result: 'ok',
  message: null,
  ...o,
});

function proposal(overrides: Partial<OfficeTaskProposal> = {}): OfficeTaskProposal {
  return {
    title: 'Pontverseny',
    description: 'A kupa.xlsx munkafüzetben…',
    sourceMode: 'derived',
    subtasks: [
      {
        label: '1.',
        text: 'A B5 cellában számold ki az összeget!',
        points: 3,
        undo: [op(), op({ op: 'resetStyle', range: 'A1:D1', parts: ['font', 'fill'], result: 'noop', message: 'nem volt formázás' })],
        rubric: [
          { key: 'r1', text: 'B5: SUM függvény.', points: 2, machine: true, gate: 'ok', gateReason: null },
          { key: 'r2', text: 'Félkövér fejléc.', points: 1, machine: false, gate: 'source', gateReason: 'a kiinduló fájlon is teljesül' },
        ],
      },
      {
        label: '2.',
        text: 'Készíts diagramot!',
        points: 2,
        undo: [op({ op: 'removeChart', range: null, index: 0 })],
        rubric: [
          { key: 'r3', text: 'Oszlopdiagram.', points: 1, machine: false, gate: 'failed', gateReason: 'a megoldáson sem teljesül' },
          { key: null, text: 'Igényes kivitel.', points: 1, machine: false, gate: null, gateReason: null },
        ],
      },
    ],
    ...overrides,
  };
}

function report(overrides: Partial<OfficeTaskReport> = {}): OfficeTaskReport {
  return {
    status: 'ok',
    canSave: true,
    errors: [],
    warnings: ['1.: a visszacsinálás hiányos - a(z) „Félkövér fejléc.” szempont gépi szabálya a kiinduló fájlon is teljesül, ezért MI-szempont lett.'],
    sourceFileName: 'kupa.xlsx',
    solutionFileName: 'kupa_megoldas.xlsx',
    recalculated: true,
    machineItems: 1,
    aiItems: 3,
    preview: { source: ['data:image/png;base64,AAA'], solution: ['data:image/png;base64,BBB'] },
    ...overrides,
  };
}

function job(overrides: Partial<OfficeTaskJobDto> = {}): OfficeTaskJobDto {
  return {
    jobId: 12,
    fileKind: 'excel',
    fileName: 'kupa_megoldas.xlsx',
    status: 'queued',
    progressText: 'Sorban áll…',
    error: null,
    createdAt: '',
    updatedAt: '',
    expiresAt: '',
    appliedTaskId: null,
    hasOwnSource: false,
    result: null,
    ...overrides,
  };
}

const doneJob = (o: Partial<OfficeTaskJobDto> = {}, r: Partial<OfficeTaskReport> = {}) =>
  job({ status: 'done', progressText: 'Kész', result: { proposal: proposal(), report: report(r), model: 'm', notes: 'Két lap.', reasked: false }, ...o });

const QUOTA: AiHelperQuotaDto = {
  month: '2026-10',
  premium: true,
  quizSource: { used: 0, limit: 60 },
  testFeedback: { used: 0, limit: 600 },
  codeComments: { used: 0, limit: 100 },
  officeTask: { used: 3, limit: 20 },
};

const xlsx = (name = 'kupa_megoldas.xlsx', size?: number) => {
  const f = new File(['PK'], name);
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('IrodaiMegoldasbolComponent', () => {
  let service: Record<'getQuota' | 'startJob' | 'getJob' | 'getActiveJob' | 'dismiss' | 'validate' | 'apply' | 'downloadFile', ReturnType<typeof vi.fn>>;
  let toast: { success: ReturnType<typeof vi.fn> };
  let jobQueue: (() => Observable<OfficeTaskJobDto>)[];

  function create(opts: { quota?: AiHelperQuotaDto; active?: Observable<OfficeTaskJobDto | null>; jobs?: (() => Observable<OfficeTaskJobDto>)[] } = {}) {
    jobQueue = opts.jobs ?? [() => of(doneJob())];
    service = {
      getQuota: vi.fn(() => of(opts.quota ?? QUOTA)),
      startJob: vi.fn(() => of({ jobId: 12, status: 'queued', quota: { used: 4, limit: 20, month: '2026-10', isPremium: true } })),
      getJob: vi.fn(() => (jobQueue.length > 1 ? jobQueue.shift()! : jobQueue[0])()),
      getActiveJob: vi.fn(() => opts.active ?? of(null)),
      dismiss: vi.fn(() => of(undefined)),
      validate: vi.fn((_: number, __: number, p: OfficeTaskProposal) => of<OfficeTaskValidateResult>({ proposal: p, report: report() })),
      apply: vi.fn(() => of({ taskId: 345, saved: ['feladat', '2 részfeladat'] })),
      downloadFile: vi.fn(() => of(new Blob(['x']))),
    };
    toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [IrodaiMegoldasbolComponent],
      providers: [
        { provide: TeacherOfficeTaskService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(IrodaiMegoldasbolComponent);
    fixture.componentRef.setInput('taskSetId', 9);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function pick(fixture: ReturnType<typeof create>, file: File) {
    fixture.componentInstance.pickFile({ target: { files: [file] } } as unknown as Event);
    fixture.detectChanges();
  }

  function startWith(fixture: ReturnType<typeof create>) {
    pick(fixture, xlsx());
    q(fixture, 'io-start')!.click();
    fixture.detectChanges();
  }

  /** Előnézetig: indítás → kész job. */
  function preview(jobOverrides: Partial<OfficeTaskJobDto> = {}, reportOverrides: Partial<OfficeTaskReport> = {}) {
    const fixture = create({ jobs: [() => of(doneJob(jobOverrides, reportOverrides))] });
    startWith(fixture);
    return fixture;
  }

  function tab(fixture: ReturnType<typeof create>, id: string) {
    q(fixture, `io-tab-${id}`)!.click();
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  describe('kérés', () => {
    it('az irodai keretet mutatja (N/20) a közös MI-segítség keretből; fájl nélkül nem indítható', () => {
      const fixture = create();
      expect(service.getQuota).toHaveBeenCalled();
      expect(q(fixture, 'io-quota')!.textContent).toContain('17 / 20');
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(true);
      pick(fixture, xlsx());
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(false);
    });

    it('nem prémium tanárnak a prémium-üzenet látszik, és nem indítható', () => {
      const fixture = create({ quota: { ...QUOTA, premium: false } });
      pick(fixture, xlsx());
      expect(q(fixture, 'io-premium')!.textContent).toContain(OFFICE_PREMIUM_MESSAGE);
      expect(q(fixture, 'io-quota')).toBeNull();
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(true);
    });

    it('elfogyott keretnél jelzi, és nem indítható', () => {
      const fixture = create({ quota: { ...QUOTA, officeTask: { used: 20, limit: 20 } } });
      pick(fixture, xlsx());
      expect(q(fixture, 'io-quota')!.textContent).toContain('Elfogyott a havi kereted (20/20)');
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(true);
    });

    it('csak .xlsx és legfeljebb 20 MB tölthető fel', () => {
      const fixture = create();
      pick(fixture, xlsx('kupa.docx'));
      expect(q(fixture, 'io-file-error')!.textContent).toContain('.xlsx');
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(true);
      pick(fixture, xlsx('kupa.xlsx', MAX_FILE_BYTES + 1));
      expect(q(fixture, 'io-file-error')!.textContent).toContain('20 MB');
      pick(fixture, xlsx('KUPA.XLSX', MAX_FILE_BYTES));
      expect(q(fixture, 'io-file-error')).toBeNull();
    });

    it('a kérés: fájl, szint, részfeladat-szám, megjegyzés; a keret a válaszból frissül', () => {
      const fixture = create({ jobs: [() => of(job({ status: 'generating' }))] });
      const file = xlsx();
      pick(fixture, file);
      fixture.componentInstance.level.set('emelt');
      fixture.componentInstance.subtaskCount.set(7);
      fixture.componentInstance.notesInput.set('  legyen diagram  ');
      fixture.detectChanges();
      q(fixture, 'io-start')!.click();
      fixture.detectChanges();
      expect(service.startJob).toHaveBeenCalledWith(9, { file, level: 'emelt', subtaskCount: 7, notes: 'legyen diagram' });
      expect(fixture.componentInstance.quota()).toEqual({ used: 4, limit: 20 });
      expect(q(fixture, 'io-running')).not.toBeNull();
    });

    it('a szerver prémium- és keret-elutasítását magyarul mutatja; keretnél újratölti a keretet', () => {
      let fixture = create();
      service.startJob.mockReturnValue(throwError(() => ({ status: 403, error: { errorType: 'AiHelperPremiumRequired' } })));
      startWith(fixture);
      expect(q(fixture, 'io-premium')).not.toBeNull();
      expect(q(fixture, 'io-error')!.textContent).toContain(OFFICE_PREMIUM_MESSAGE);

      TestBed.resetTestingModule();
      fixture = create();
      service.startJob.mockReturnValue(
        throwError(() => ({ status: 400, error: { errorType: 'AiHelperQuotaExceeded', errorMessage: 'Elfogyott a havi kereted (20 irodai feladat / hó).' } })),
      );
      startWith(fixture);
      expect(q(fixture, 'io-error')!.textContent).toContain('20 irodai feladat / hó');
      expect(service.getQuota).toHaveBeenCalledTimes(2);
    });

    it('a kikapcsolt funkciót és a gyakorisági korlátot érthetően jelzi', () => {
      const fixture = create();
      service.startJob.mockReturnValue(throwError(() => ({ status: 400, error: { errorType: 'FeatureDisabled' } })));
      startWith(fixture);
      expect(q(fixture, 'io-error')!.textContent).toContain('nincs bekapcsolva');
      service.startJob.mockReturnValue(throwError(() => ({ status: 429 })));
      q(fixture, 'io-start')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-error')!.textContent).toContain('Túl sok kérés');
    });
  });

  describe('háttérfeladat', () => {
    it('2 mp-enként lekérdezi az állapotot, mutatja a haladást, és a kész eredménynél leáll', () => {
      vi.useFakeTimers();
      const fixture = create({
        jobs: [
          () => of(job({ status: 'queued', progressText: 'Sorban áll…' })),
          () => of(job({ status: 'generating', progressText: 'Az MI írja a feladatot…' })),
          () => of(job({ status: 'running', progressText: 'Kiinduló fájl előállítása…' })),
          () => of(doneJob()),
        ],
      });
      startWith(fixture);
      expect(service.getJob).toHaveBeenCalledWith(9, 12);
      expect(q(fixture, 'io-running')!.textContent).toContain('Sorban áll…');
      vi.advanceTimersByTime(OFFICE_POLL_MS);
      fixture.detectChanges();
      expect(q(fixture, 'io-running')!.textContent).toContain('Az MI írja a feladatot…');
      vi.advanceTimersByTime(OFFICE_POLL_MS * 2);
      fixture.detectChanges();
      expect(service.getJob).toHaveBeenCalledTimes(4);
      expect(q(fixture, 'io-preview')).not.toBeNull();
      expect(q(fixture, 'io-valid')!.textContent).toContain('1 gépi és 3 AI-szempont');
      expect(fixture.nativeElement.textContent).toContain('Két lap.');
      vi.advanceTimersByTime(OFFICE_POLL_MS * 5);
      expect(service.getJob).toHaveBeenCalledTimes(4);
    });

    it('bezáráskor a folyamatban lévő állapot-kérést megszakítja', () => {
      const pending = new Subject<OfficeTaskJobDto>();
      const fixture = create({ jobs: [() => pending] });
      const closed = vi.fn();
      fixture.componentInstance.closed.subscribe(closed);
      startWith(fixture);
      expect(pending.observed).toBe(true);
      q(fixture, 'io-close')!.click();
      expect(pending.observed).toBe(false);
      expect(closed).toHaveBeenCalled();
    });

    it('sikertelen jobnál vissza a kéréshez a szerver üzenetével, a keret újratöltődik', () => {
      const fixture = create({ jobs: [() => of(job({ status: 'failed', error: 'Az MI válasza használhatatlan volt.' }))] });
      startWith(fixture);
      expect(q(fixture, 'io-input')).not.toBeNull();
      expect(q(fixture, 'io-error')!.textContent!.trim()).toBe('Az MI válasza használhatatlan volt.');
      expect(service.getQuota).toHaveBeenCalledTimes(2);
    });

    it('lejárt (404) jobnál vissza a kéréshez; már mentett jobnál jelzi', () => {
      let fixture = create({ jobs: [() => throwError(() => ({ status: 404 }))] });
      startWith(fixture);
      expect(q(fixture, 'io-error')!.textContent).toContain('már nem érhető el');

      TestBed.resetTestingModule();
      fixture = create({ jobs: [() => of(doneJob({ appliedTaskId: 345 }))] });
      startWith(fixture);
      expect(q(fixture, 'io-error')!.textContent).toContain('már elmentetted');
    });

    it('nyitáskor a futó jobhoz kapcsolódik vissza (jobs/active), és lekérdezi, amíg kész', () => {
      vi.useFakeTimers();
      const fixture = create({
        active: of(job({ status: 'running' })),
        jobs: [() => of(job({ status: 'running', progressText: 'Kapu…' })), () => of(doneJob())],
      });
      expect(service.getActiveJob).toHaveBeenCalledWith(9);
      expect(q(fixture, 'io-running')!.textContent).toContain('Kapu…');
      vi.advanceTimersByTime(OFFICE_POLL_MS);
      fixture.detectChanges();
      expect(q(fixture, 'io-preview')).not.toBeNull();
      expect(q(fixture, 'io-dialog')!.textContent).toContain('kupa_megoldas.xlsx');
    });

    it('amíg az aktív job lekérdezése tart, nem indítható', () => {
      const active = new Subject<OfficeTaskJobDto | null>();
      const fixture = create({ active });
      pick(fixture, xlsx());
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(true);
      active.next(null);
      active.complete();
      fixture.detectChanges();
      expect((q(fixture, 'io-start') as HTMLButtonElement).disabled).toBe(false);
    });

    it('„már készül” elutasításnál ugyanezen a feladatsoron a futó jobhoz kapcsolódik, máshol csak jelzi', () => {
      let fixture = create({ jobs: [() => of(job({ jobId: 5, status: 'generating' }))] });
      service.startJob.mockReturnValue(throwError(() => ({ status: 400, error: { errorType: 'OfficeTaskAlreadyRunning', details: { jobId: 5, taskSetId: 9 } } })));
      startWith(fixture);
      expect(service.getJob).toHaveBeenCalledWith(9, 5);
      expect(q(fixture, 'io-running')).not.toBeNull();

      TestBed.resetTestingModule();
      fixture = create();
      service.startJob.mockReturnValue(throwError(() => ({ status: 400, error: { errorType: 'OfficeTaskAlreadyRunning', details: { jobId: 5, taskSetId: 3 } } })));
      startWith(fixture);
      expect(service.getJob).not.toHaveBeenCalled();
      expect(q(fixture, 'io-error')!.textContent).toContain('másik feladatsorodon');
    });
  });

  describe('előnézet', () => {
    it('a Feladat fülön a cím, leírás és a részfeladatok szerkeszthetők; a Mentés a módosítás után tiltott', () => {
      const fixture = preview();
      expect(q(fixture, 'io-panel-feladat')).not.toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(false);
      fixture.componentInstance.setSubtask(0, { points: 4 });
      fixture.detectChanges();
      expect(q(fixture, 'io-dirty')).not.toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(true);
      expect(q(fixture, 'io-panel-feladat')!.textContent).toContain('Összesen 6 pont');
    });

    it('a Visszacsinálás fül magyarul írja le a műveleteket az eredményükkel', () => {
      const fixture = preview();
      tab(fixture, 'visszacsinalas');
      expect(q(fixture, 'io-undo-text-0-0')!.textContent).toContain('Adatok!B5: képletek törlése (a formázás marad)');
      expect(q(fixture, 'io-undo-text-0-1')!.textContent).toContain('Adatok!A1:D1: formázás alapra (betű, kitöltés)');
      expect(q(fixture, 'io-undo-text-1-0')!.textContent).toContain('a(z) 1. diagram törlése');
      expect(q(fixture, 'io-undo-result-0-0')!.textContent).toContain('végrehajtva');
      expect(q(fixture, 'io-undo-result-0-1')!.textContent).toContain('nem talált');
      expect(q(fixture, 'io-undo-0-1')!.textContent).toContain('nem volt formázás');
    });

    it('hibás tartomány: a művelet mellett és a listában jelzi, az Újraellenőrzés tiltott; javítva a szerkesztett műveletet küldi', () => {
      const fixture = preview();
      tab(fixture, 'visszacsinalas');
      q(fixture, 'io-undo-edit-0-0')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-undo-editor-0-0')).not.toBeNull();
      fixture.componentInstance.setUndo(0, 0, { range: 'B5:' });
      fixture.detectChanges();
      expect(q(fixture, 'io-undo-error-0-0')!.textContent).toContain('hibás tartomány');
      expect(q(fixture, 'io-client-errors')!.textContent).toContain('1.: 1. visszacsinálási művelet - hibás tartomány');
      expect((q(fixture, 'io-revalidate') as HTMLButtonElement).disabled).toBe(true);

      fixture.componentInstance.setUndo(0, 0, { range: '$b$5:$b$9' });
      q(fixture, 'io-undo-toggle-0-1')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-undo-error-0-0')).toBeNull();
      q(fixture, 'io-revalidate')!.click();
      fixture.detectChanges();
      const [taskSetId, jobId, sent, file] = service.validate.mock.calls[0];
      expect([taskSetId, jobId, file]).toEqual([9, 12, null]);
      expect(sent.subtasks[0].undo[0]).toMatchObject({ op: 'clearFormulas', range: '$b$5:$b$9', enabled: true });
      expect(sent.subtasks[0].undo[1].enabled).toBe(false);
      expect(q(fixture, 'io-dirty')).toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(false);
    });

    it('műveletváltáskor a nem megengedett paraméterek törlődnek; új művelet hozzáadható; a stílus-részek váltogathatók', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.changeKind(0, 1, 'resetColumnWidth');
      expect(c.proposal()!.subtasks[0].undo[1]).toMatchObject({ op: 'resetColumnWidth', range: null, parts: null });
      expect(c.clientErrors().some((e) => e.includes('oszloptartomány'))).toBe(true);
      c.setUndo(0, 1, { columns: 'B:D' });
      expect(c.clientErrors()).toEqual([]);

      c.addUndo(1);
      expect(c.proposal()!.subtasks[1].undo[1]).toMatchObject({ op: 'clearFormulas', sheet: 'Adatok', range: null, enabled: true });
      expect(c.isEditing(1, 1)).toBe(true);
      expect(c.clientErrors().some((e) => e.includes('hiányzó tartomány'))).toBe(true);
      c.removeUndo(1, 1);
      expect(c.proposal()!.subtasks[1].undo).toHaveLength(1);

      c.changeKind(0, 0, 'resetStyle');
      c.togglePart(0, 0, 'border');
      c.togglePart(0, 0, 'numberFormat');
      expect(c.proposal()!.subtasks[0].undo[0].parts).toEqual(['numberFormat', 'border']);
      c.togglePart(0, 0, 'border');
      c.togglePart(0, 0, 'numberFormat');
      expect(c.proposal()!.subtasks[0].undo[0].parts).toBeNull();
    });

    it('diagram: a felület 1-től számoz, a szerződés 0-alapú; név ÉS sorszám együtt hiba', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.setChartNumber(1, 0, 3);
      expect(c.proposal()!.subtasks[1].undo[0].index).toBe(2);
      c.setUndo(1, 0, { name: 'Diagram 1' });
      expect(c.clientErrors().some((e) => e.includes('névvel VAGY sorszámmal'))).toBe(true);
      c.setChartNumber(1, 0, '');
      expect(c.proposal()!.subtasks[1].undo[0].index).toBeNull();
      expect(c.clientErrors()).toEqual([]);
    });

    it('saját kiinduló fájl: a fájl az Újraellenőrzéssel megy fel, „own” módban; utána fájl nélkül is maradhat saját', () => {
      const fixture = preview();
      tab(fixture, 'visszacsinalas');
      const own = xlsx('kupa_kiindulo.xlsx');
      fixture.componentInstance.loadOwnSource({ target: { files: [own], value: 'x' } } as unknown as Event);
      fixture.detectChanges();
      expect(q(fixture, 'io-own-pending')!.textContent).toContain('kupa_kiindulo.xlsx');
      expect(q(fixture, 'io-undo-skipped')).not.toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(true);

      service.validate.mockImplementation((_: number, __: number, p: OfficeTaskProposal) =>
        of({ proposal: { ...p, subtasks: p.subtasks.map((s) => ({ ...s, undo: s.undo.map((o) => ({ ...o, result: null })) })) }, report: report() }),
      );
      q(fixture, 'io-revalidate')!.click();
      fixture.detectChanges();
      const [, , sent, file] = service.validate.mock.calls[0];
      expect(sent.sourceMode).toBe('own');
      expect(file).toBe(own);
      expect(fixture.componentInstance.hasOwnSource()).toBe(true);
      expect(q(fixture, 'io-own-pending')).toBeNull();
      expect(q(fixture, 'io-dirty')).toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(false);

      fixture.componentInstance.setSourceMode('derived');
      fixture.componentInstance.setSourceMode('own');
      expect(fixture.componentInstance.clientErrors()).toEqual([]);
    });

    it('saját módban fájl nélkül (és még fel nem töltött saját fájllal) nem ellenőrizhető; rossz fájltípust jelez', () => {
      const fixture = preview();
      tab(fixture, 'visszacsinalas');
      q(fixture, 'io-source-own')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-client-errors')!.textContent).toContain('tölts fel egy .xlsx fájlt');
      fixture.componentInstance.loadOwnSource({ target: { files: [xlsx('kupa.ods')], value: 'x' } } as unknown as Event);
      fixture.detectChanges();
      expect(q(fixture, 'io-own-error')!.textContent).toContain('.xlsx');
      expect(fixture.componentInstance.pendingOwnSource()).toBeNull();
    });

    it('Szempontok: gépi jelvény és kapu-állapot tételenként (ok / kiinduló fájlon is / sikertelen / AI)', () => {
      const fixture = preview();
      tab(fixture, 'szempontok');
      expect(q(fixture, 'io-item-machine-0-0')!.textContent).toContain('gépi');
      expect(q(fixture, 'io-item-gate-0-0')!.textContent).toContain('rendben');
      expect(q(fixture, 'io-item-gate-0-0')!.className).toContain('badge-success');
      expect(q(fixture, 'io-item-machine-0-1')).toBeNull();
      expect(q(fixture, 'io-item-gate-0-1')!.textContent).toContain('a kiinduló fájlon is teljesül → AI-szempont');
      expect(q(fixture, 'io-item-gate-0-1')!.className).toContain('badge-warning');
      expect(q(fixture, 'io-item-0-1')!.textContent).toContain('a kiinduló fájlon is teljesül');
      expect(q(fixture, 'io-item-gate-1-0')!.className).toContain('badge-danger');
      expect(q(fixture, 'io-item-gate-1-1')!.textContent).toContain('AI-szempont');
    });

    it('Szempontok: szöveg/pont szerkeszthető, törölhető, új tétel kulcs nélkül (AI) vehető fel - ez megy az újraellenőrzésre', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.setRubric(0, 0, { text: 'B5: SZUM függvény.' });
      c.removeRubric(1, 1);
      c.addRubric(1);
      expect(c.clientErrors().some((e) => e.includes('2. szempont szövege üres'))).toBe(true);
      c.setRubric(1, 1, { text: 'Tengelyfelirat.', points: 2 });
      c.setRubric(0, 1, { points: Number.NaN });
      expect(c.clientErrors().some((e) => e.includes('2. szempont pontja'))).toBe(true);
      c.setRubric(0, 1, { points: 1 });
      fixture.detectChanges();
      q(fixture, 'io-revalidate')!.click();
      const sent = service.validate.mock.calls[0][2] as OfficeTaskProposal;
      expect(sent.subtasks[0].rubric[0]).toMatchObject({ key: 'r1', text: 'B5: SZUM függvény.' });
      expect(sent.subtasks[1].rubric[1]).toMatchObject({ key: null, text: 'Tengelyfelirat.', points: 2 });
    });

    it('Előnézet: a két fájl oldalképei egymás mellett; konvertáló nélkül megjegyzés', () => {
      let fixture = preview();
      tab(fixture, 'elonezet');
      expect(q(fixture, 'io-preview-source')!.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AAA');
      expect(q(fixture, 'io-preview-solution')!.querySelector('img')!.getAttribute('alt')).toBe('Megoldás, 1. oldal');

      TestBed.resetTestingModule();
      fixture = preview({}, { preview: null });
      tab(fixture, 'elonezet');
      expect(q(fixture, 'io-preview-unavailable')).not.toBeNull();
    });

    it('hibás ellenőrzésnél az Ellenőrzés fül nyílik, a hibák látszanak, nem menthető', () => {
      const fixture = preview({}, { status: 'failed', canSave: false, errors: ['1.: a(z) clearFormulas(Nincs, B5) nem hajtható végre'], recalculated: false });
      expect(q(fixture, 'io-panel-ellenorzes')).not.toBeNull();
      expect(q(fixture, 'io-invalid')!.textContent).toContain('nem hajtható végre');
      expect(q(fixture, 'io-warnings')!.textContent).toContain('a visszacsinálás hiányos');
      expect(q(fixture, 'io-not-recalculated')).not.toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(true);
    });

    it('a kiinduló és a megoldás fájl letölthető (blob, a jelentés fájlnevével)', () => {
      const fixture = preview();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const createUrl = vi.fn(() => 'blob:x');
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
      q(fixture, 'io-download-source')!.click();
      expect(service.downloadFile).toHaveBeenCalledWith(9, 12, 'source');
      q(fixture, 'io-download-solution')!.click();
      expect(service.downloadFile).toHaveBeenCalledWith(9, 12, 'solution');
      expect(click).toHaveBeenCalledTimes(2);
      click.mockRestore();

      service.downloadFile.mockReturnValue(throwError(() => ({ status: 404 })));
      q(fixture, 'io-download-source')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-download-error')!.textContent).toContain('még nem készült el');
    });

    it('Mentés: az utoljára ellenőrzött változatot küldi, toast, az új feladat azonosítója, bezárás', () => {
      const fixture = preview();
      const saved = vi.fn();
      const closed = vi.fn();
      fixture.componentInstance.saved.subscribe(saved);
      fixture.componentInstance.closed.subscribe(closed);
      q(fixture, 'io-save')!.click();
      expect(service.apply).toHaveBeenCalledWith(9, 12, proposal());
      expect(toast.success).toHaveBeenCalledWith('Elmentve: feladat, 2 részfeladat.');
      expect(saved).toHaveBeenCalledWith(345);
      expect(closed).toHaveBeenCalled();
    });

    it('sikertelen mentésnél az előnézet marad, a hiba olvasható; prémium-elutasításnál a prémium-üzenet', () => {
      const fixture = preview();
      service.apply.mockReturnValue(throwError(() => ({ status: 403, error: { errorType: 'AiHelperPremiumRequired' } })));
      q(fixture, 'io-save')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-save-error')!.textContent).toContain(OFFICE_PREMIUM_MESSAGE);
      expect(q(fixture, 'io-preview')).not.toBeNull();
    });

    it('Visszaállítás: a generált változat vissza, újra menthető', () => {
      const fixture = preview();
      fixture.componentInstance.setField('title', 'Más');
      fixture.componentInstance.loadOwnSource({ target: { files: [xlsx('k.xlsx')], value: 'x' } } as unknown as Event);
      fixture.detectChanges();
      q(fixture, 'io-restore')!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.proposal()!.title).toBe('Pontverseny');
      expect(fixture.componentInstance.pendingOwnSource()).toBeNull();
      expect(q(fixture, 'io-restore')).toBeNull();
      expect((q(fixture, 'io-save') as HTMLButtonElement).disabled).toBe(false);
    });

    it('egy szerkesztés visszavonása nem marad „módosított” (a ★ mezők nem számítanak)', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.toggleUndo(0, 0);
      expect(c.dirty()).toBe(true);
      c.toggleUndo(0, 0);
      expect(c.dirty()).toBe(false);
    });

    it('ha a tanár az újraellenőrzés közben tovább ír, a módosítása megmarad és újra ellenőrizni kell', () => {
      const fixture = preview();
      const pending = new Subject<OfficeTaskValidateResult>();
      service.validate.mockReturnValue(pending);
      fixture.componentInstance.setField('title', 'A');
      fixture.detectChanges();
      q(fixture, 'io-revalidate')!.click();
      fixture.componentInstance.setField('title', 'AB');
      pending.next({ proposal: { ...proposal(), title: 'A' }, report: report() });
      fixture.detectChanges();
      expect(fixture.componentInstance.proposal()!.title).toBe('AB');
      expect(q(fixture, 'io-dirty')).not.toBeNull();
    });

    it('az elavult újraellenőrzés-választ (Elvetés után) eldobja; Elvetés után új kérés indítható', () => {
      const fixture = preview();
      const pending = new Subject<OfficeTaskValidateResult>();
      service.validate.mockReturnValue(pending);
      fixture.componentInstance.setField('title', 'A');
      fixture.detectChanges();
      q(fixture, 'io-revalidate')!.click();
      q(fixture, 'io-discard')!.click();
      fixture.detectChanges();
      expect(service.dismiss).toHaveBeenCalledWith(9, 12);
      expect(pending.observed).toBe(false);
      expect(q(fixture, 'io-input')).not.toBeNull();
      expect(fixture.componentInstance.proposal()).toBeNull();
    });

    it('sikertelen elvetésnél az előnézet marad; 404-nél vissza a kéréshez', () => {
      let fixture = preview();
      service.dismiss.mockReturnValue(throwError(() => ({ status: 400, error: { errorMessage: 'Futó jobot nem lehet elvetni.' } })));
      q(fixture, 'io-discard')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-save-error')!.textContent).toContain('Futó jobot');
      expect(q(fixture, 'io-preview')).not.toBeNull();

      TestBed.resetTestingModule();
      fixture = preview();
      service.dismiss.mockReturnValue(throwError(() => ({ status: 404 })));
      q(fixture, 'io-discard')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'io-input')).not.toBeNull();
    });

    it('a füleken nyilakkal lehet lépkedni', () => {
      vi.useFakeTimers();
      const fixture = preview();
      q(fixture, 'io-tab-feladat')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      fixture.detectChanges();
      expect(q(fixture, 'io-panel-ellenorzes')).not.toBeNull();
      expect(q(fixture, 'io-tab-ellenorzes')!.getAttribute('aria-selected')).toBe('true');
    });
  });
});
