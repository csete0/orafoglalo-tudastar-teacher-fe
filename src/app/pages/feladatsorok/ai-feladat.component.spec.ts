import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AiFeladatComponent, POLL_MS, PREMIUM_REQUIRED_MESSAGE } from './ai-feladat.component';
import { RememberedAiJob, TeacherAiCodeTaskService } from '../../services/teacher-ai-code-task/teacher-ai-code-task.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  AiCodeTaskJobDto,
  AiCodeTaskProposal,
  AiCodeTaskQuotaDto,
  AiCodeTaskReport,
  AiCodeTaskValidateResult,
} from '../../models/ai-code-task.model';
import { TeacherTaskDto } from '../../models/teacher-content.model';

function proposal(overrides: Partial<AiCodeTaskProposal> = {}): AiCodeTaskProposal {
  return {
    title: 'Kártyajáték',
    description: 'Egy kártyajáték pontjai a kartyak.txt fájlban.',
    subtasks: [
      { subTaskId: null, label: '1.', text: 'Olvasd be!', points: 2, existing: false, pointsExisting: false },
      { subTaskId: null, label: '2.', text: 'Hány lap van?', points: 3, existing: false, pointsExisting: false },
    ],
    dataFile: { fileName: 'kartyak.txt', generatorPython: 'import random\nrandom.seed(7)\nprint(1)\n', content: 'a 1\nb 2\n' },
    existingInputFiles: [],
    stdin: null,
    stdinExisting: false,
    languages: [
      {
        language: 'python',
        solution: 'print("1. feladat")\n',
        solutionExisting: false,
        snippets: [{ code: 'f = open("kartyak.txt")', existing: false }, { code: 'print(len(lines))', existing: false }],
      },
      {
        language: 'csharp',
        solution: 'Console.WriteLine("1. feladat");\n',
        solutionExisting: false,
        snippets: [{ code: 'var f = File.ReadAllLines("kartyak.txt");', existing: false }, { code: 'Console.WriteLine(f.Length);', existing: false }],
      },
    ],
    ...overrides,
  };
}

function report(overrides: Partial<AiCodeTaskReport> = {}): AiCodeTaskReport {
  return {
    status: 'ok',
    canSave: true,
    errors: [],
    warnings: [],
    dataFile: { fileName: 'kartyak.txt', sizeBytes: 8, lineCount: 2, preview: 'a 1\nb 2\n', generated: true },
    languages: [
      {
        language: 'python',
        status: 'ok',
        error: null,
        deterministic: true,
        sections: [
          { order: 1, label: '1.', section: 1, status: 'ok', preview: 'beolvasva' },
          { order: 2, label: '2.', section: 2, status: 'ok', preview: '2' },
        ],
      },
      {
        language: 'csharp',
        status: 'ok',
        error: null,
        deterministic: null,
        sections: [
          { order: 1, label: '1.', section: 1, status: 'ok', preview: 'beolvasva' },
          { order: 2, label: '2.', section: 2, status: 'ok', preview: '2' },
        ],
      },
    ],
    ...overrides,
  };
}

function job(overrides: Partial<AiCodeTaskJobDto> = {}): AiCodeTaskJobDto {
  return {
    jobId: 77,
    mode: 'new',
    taskId: null,
    status: 'queued',
    progressText: 'Sorban áll…',
    error: null,
    createdAt: '',
    updatedAt: '',
    expiresAt: '',
    appliedTaskId: null,
    result: null,
    ...overrides,
  };
}

const doneJob = (o: Partial<AiCodeTaskJobDto> = {}) =>
  job({ status: 'done', progressText: 'Kész', result: { proposal: proposal(), report: report(), model: 'm', notes: 'Rendezéssel.', reasked: false }, ...o });

const codeTask = (o: Partial<TeacherTaskDto> = {}): TeacherTaskDto => ({
  id: 5,
  title: 'Régi érettségi',
  description: 'd',
  maxPoints: 10,
  taskOrder: 1,
  taskTypeIds: [6],
  subTasks: [{ id: 1, description: 'Olvasd be', points: 2, label: '1.', snippets: [] }],
  completeSolutionSnippets: [{ programmingLanguageId: 10, code: 'class A {}' }],
  ...o,
});

describe('AiFeladatComponent', () => {
  let service: {
    getQuota: ReturnType<typeof vi.fn>;
    startJob: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
    rememberedJob: ReturnType<typeof vi.fn>;
    remember: ReturnType<typeof vi.fn>;
    forget: ReturnType<typeof vi.fn>;
  };
  let toast: { success: ReturnType<typeof vi.fn> };
  /** A getJob egymás utáni válaszai (az utolsó ismétlődik). */
  let jobQueue: (() => Observable<AiCodeTaskJobDto>)[];

  function create(opts: { mode?: 'complete' | 'new'; task?: TeacherTaskDto | null; quota?: AiCodeTaskQuotaDto; remembered?: RememberedAiJob | null } = {}) {
    jobQueue = [() => of(doneJob())];
    service = {
      getQuota: vi.fn(() => of(opts.quota ?? { used: 3, limit: 30, month: '2026-10', isPremium: true })),
      startJob: vi.fn(() => of({ jobId: 77, status: 'queued', quota: { used: 4, limit: 30, month: '2026-10', isPremium: true } })),
      getJob: vi.fn(() => (jobQueue.length > 1 ? jobQueue.shift()! : jobQueue[0])()),
      validate: vi.fn((_: number, __: number, p: AiCodeTaskProposal) => of<AiCodeTaskValidateResult>({ proposal: p, report: report() })),
      apply: vi.fn(() => of({ taskId: 456, created: true, saved: ['feladat', '2 részfeladat kódrészletekkel'] })),
      rememberedJob: vi.fn(() => opts.remembered ?? null),
      remember: vi.fn(),
      forget: vi.fn(),
    };
    toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AiFeladatComponent],
      providers: [
        { provide: TeacherAiCodeTaskService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(AiFeladatComponent);
    fixture.componentRef.setInput('taskSetId', 9);
    fixture.componentRef.setInput('startMode', opts.mode ?? 'new');
    fixture.componentRef.setInput('task', opts.task ?? null);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function startNew(fixture: ReturnType<typeof create>) {
    fixture.componentInstance.topic.set('Kártyajáték pontszámai');
    fixture.detectChanges();
    q(fixture, 'ai-task-start')!.click();
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('mutatja a havi keretet; téma nélkül nem indítható', () => {
    const fixture = create();
    expect(q(fixture, 'ai-task-quota')!.textContent).toContain('még 27 / 30 maradt');
    expect((q(fixture, 'ai-task-start') as HTMLButtonElement).disabled).toBe(true);
    fixture.componentInstance.topic.set('Valami');
    fixture.detectChanges();
    expect((q(fixture, 'ai-task-start') as HTMLButtonElement).disabled).toBe(false);
  });

  it('nem prémium tanárnak a prémium-üzenet látszik, és nem indítható', () => {
    const fixture = create({ quota: { used: 0, limit: 30, month: '2026-10', isPremium: false } });
    fixture.componentInstance.topic.set('Valami');
    fixture.detectChanges();
    expect(q(fixture, 'ai-task-premium')!.textContent).toContain(PREMIUM_REQUIRED_MESSAGE);
    expect(q(fixture, 'ai-task-quota')).toBeNull();
    expect((q(fixture, 'ai-task-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('elfogyott keretnél jelzi, és nem indítható', () => {
    const fixture = create({ quota: { used: 30, limit: 30, month: '2026-10', isPremium: true } });
    fixture.componentInstance.topic.set('Valami');
    fixture.detectChanges();
    expect(q(fixture, 'ai-task-quota')!.textContent).toContain('Elfogyott a havi kereted (30/30)');
    expect((q(fixture, 'ai-task-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a szerver prémium-elutasítását (errorType) a prémium-üzenetre fordítja', () => {
    const fixture = create();
    service.startJob.mockReturnValue(throwError(() => ({ status: 400, error: { errorType: 'AiCodeTaskPremiumRequired', errorMessage: 'x' } })));
    startNew(fixture);
    expect(q(fixture, 'ai-task-error')!.textContent).toContain(PREMIUM_REQUIRED_MESSAGE);
    expect(q(fixture, 'ai-task-premium')).not.toBeNull();
  });

  it('a keret- és a gyakorisági korlát hibáját magyarul mutatja', () => {
    const fixture = create();
    service.startJob.mockReturnValue(throwError(() => ({ status: 400, error: { errorType: 'AiCodeTaskQuotaExceeded', errorMessage: 'x' } })));
    startNew(fixture);
    expect(q(fixture, 'ai-task-error')!.textContent).toContain('Elfogyott a havi AI-feladat kereted');
    expect(service.getQuota).toHaveBeenCalledTimes(2);

    service.startJob.mockReturnValue(throwError(() => ({ status: 429, error: null })));
    q(fixture, 'ai-task-start')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'ai-task-error')!.textContent).toContain('Túl sok kérés');
  });

  it('2. mód: a kérés téma, szint, darabszám, nyelvek (Python mindig) és ötlet; a jobot megjegyzi', () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.topic.set('  Kártyajáték  ');
    c.level.set('emelt');
    c.subtaskCount.set(6);
    c.idea.set('legyen rendezés');
    c.toggleLanguage('cpp');
    c.toggleLanguage('python'); // a Python nem vehető ki
    fixture.detectChanges();
    expect((q(fixture, 'ai-task-language-python') as HTMLInputElement).disabled).toBe(true);
    q(fixture, 'ai-task-start')!.click();

    expect(service.startJob).toHaveBeenCalledWith(9, {
      mode: 'new',
      topic: 'Kártyajáték',
      level: 'emelt',
      subtaskCount: 6,
      languages: ['python', 'cpp'],
      idea: 'legyen rendezés',
    });
    expect(service.remember).toHaveBeenCalledWith(9, { jobId: 77, mode: 'new', taskId: null, taskTitle: null });
  });

  it('1. mód: a feladat azonosítójával kér; a meglévő megoldás nyelvei alapból bejelölve; újraírás kérhető', () => {
    const fixture = create({ mode: 'complete', task: codeTask() });
    expect(fixture.nativeElement.textContent).toContain('Régi érettségi');
    expect((q(fixture, 'ai-task-language-java') as HTMLInputElement).checked).toBe(true);
    (q(fixture, 'ai-task-regenerate') as HTMLInputElement).click();
    fixture.detectChanges();
    q(fixture, 'ai-task-start')!.click();
    expect(service.startJob).toHaveBeenCalledWith(9, { mode: 'complete', taskId: 5, regenerateSolution: true, languages: ['python', 'java'] });
  });

  it('1. mód: részfeladat nélküli feladatnál nem indítható', () => {
    const fixture = create({ mode: 'complete', task: codeTask({ subTasks: [] }) });
    expect(q(fixture, 'ai-task-no-subtasks')).not.toBeNull();
    expect((q(fixture, 'ai-task-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('2 mp-enként lekérdezi az állapotot, mutatja a haladást, és a kész eredménynél leáll', () => {
    vi.useFakeTimers();
    const fixture = create();
    jobQueue = [
      () => of(job({ status: 'queued', progressText: 'Sorban áll…' })),
      () => of(job({ status: 'generating', progressText: 'Az MI írja a feladatot…' })),
      () => of(job({ status: 'running', progressText: 'Lefuttatás a Judge0-n…' })),
      () => of(doneJob()),
    ];
    startNew(fixture);
    expect(service.getJob).toHaveBeenCalledTimes(1);
    expect(service.getJob).toHaveBeenCalledWith(9, 77);
    expect(q(fixture, 'ai-task-running')!.textContent).toContain('Sorban áll…');

    vi.advanceTimersByTime(POLL_MS - 1);
    expect(service.getJob).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(service.getJob).toHaveBeenCalledTimes(2);
    expect(q(fixture, 'ai-task-running')!.textContent).toContain('Az MI írja a feladatot…');

    vi.advanceTimersByTime(POLL_MS * 2);
    fixture.detectChanges();
    expect(service.getJob).toHaveBeenCalledTimes(4);
    expect(q(fixture, 'ai-task-preview')).not.toBeNull();
    expect(q(fixture, 'ai-task-valid')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Rendezéssel.');

    vi.advanceTimersByTime(POLL_MS * 5);
    expect(service.getJob).toHaveBeenCalledTimes(4);
  });

  it('bezáráskor a lekérdezés leáll (a job a háttérben fut tovább, megjegyezve marad)', () => {
    vi.useFakeTimers();
    const fixture = create();
    jobQueue = [() => of(job({ status: 'generating' }))];
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    startNew(fixture);
    vi.advanceTimersByTime(POLL_MS);
    expect(service.getJob).toHaveBeenCalledTimes(2);

    q(fixture, 'ai-task-close')!.click();
    expect(closed).toHaveBeenCalled();
    vi.advanceTimersByTime(POLL_MS * 5);
    expect(service.getJob).toHaveBeenCalledTimes(2);
    expect(service.forget).not.toHaveBeenCalled();
  });

  it('bezáráskor a folyamatban lévő állapot-kérést is megszakítja', () => {
    const fixture = create();
    const pending = new Subject<AiCodeTaskJobDto>();
    jobQueue = [() => pending];
    startNew(fixture);
    expect(pending.observed).toBe(true);
    q(fixture, 'ai-task-close')!.click();
    expect(pending.observed).toBe(false);
  });

  it('sikertelen jobnál vissza a kéréshez a hibával, a keret visszajár, a megjegyzés törlődik', () => {
    const fixture = create();
    jobQueue = [() => of(job({ status: 'failed', error: 'Az MI válasza használhatatlan volt.' }))];
    startNew(fixture);
    expect(q(fixture, 'ai-task-input')).not.toBeNull();
    expect(q(fixture, 'ai-task-error')!.textContent).toContain('Az MI válasza használhatatlan volt. A havi keretedből nem vonódott le.');
    expect(service.forget).toHaveBeenCalledWith(9, 77);
  });

  it('lejárt (404) jobnál vissza a kéréshez', () => {
    const fixture = create();
    jobQueue = [() => throwError(() => ({ status: 404 }))];
    startNew(fixture);
    expect(q(fixture, 'ai-task-error')!.textContent).toContain('már nem érhető el');
    expect(service.forget).toHaveBeenCalledWith(9, 77);
  });

  it('ugyanarra a célra megjegyzett jobot újranyitáskor folytatja; másikat felkínál', () => {
    let fixture = create({ remembered: { jobId: 77, mode: 'new', taskId: null, taskTitle: null } });
    expect(service.getJob).toHaveBeenCalledWith(9, 77);
    expect(q(fixture, 'ai-task-preview')).not.toBeNull();

    TestBed.resetTestingModule();
    fixture = create({ mode: 'complete', task: codeTask(), remembered: { jobId: 70, mode: 'new', taskId: null, taskTitle: null } });
    expect(service.getJob).not.toHaveBeenCalled();
    expect(q(fixture, 'ai-task-remembered')!.textContent).toContain('új feladat');
    q(fixture, 'ai-task-resume')!.click();
    fixture.detectChanges();
    expect(service.getJob).toHaveBeenCalledWith(9, 70);
  });

  describe('előnézet', () => {
    function preview(result = doneJob()) {
      const fixture = create();
      jobQueue = [() => of(result)];
      startNew(fixture);
      return fixture;
    }

    it('a füleken látszik a feladat, az adatfájl, a megoldás és az ellenőrzés', async () => {
      const fixture = preview();
      await fixture.whenStable();
      expect((q(fixture, 'ai-task-p-title') as HTMLInputElement).value).toBe('Kártyajáték');
      expect(q(fixture, 'ai-task-tab-feladat')!.getAttribute('aria-selected')).toBe('true');

      q(fixture, 'ai-task-tab-adatfajl')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect((q(fixture, 'ai-task-df-generator') as HTMLTextAreaElement).value).toContain('random.seed(7)');
      expect(q(fixture, 'ai-task-df-content')!.textContent).toContain('a 1');

      q(fixture, 'ai-task-tab-megoldas')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect((q(fixture, 'ai-task-solution-python') as HTMLTextAreaElement).value).toContain('1. feladat');
      q(fixture, 'ai-task-lang-csharp')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect((q(fixture, 'ai-task-solution-csharp') as HTMLTextAreaElement).value).toContain('Console.WriteLine');

      q(fixture, 'ai-task-tab-ellenorzes')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(q(fixture, 'ai-task-check-python')!.textContent).toContain('kétszer futtatva azonos kimenet');
      expect(q(fixture, 'ai-task-check-csharp')!.textContent).toContain('✔');
    });

    it('hibás ellenőrzésnél az Ellenőrzés fül nyílik: eltérés, nem determinisztikus figyelmeztetés, nem menthető', () => {
      const bad = report({
        status: 'failed',
        canSave: false,
        errors: ['csharp: a(z) „2.” részfeladat kimenete eltér a Python-megoldásétól.'],
        warnings: ['A Python-megoldás kétszer futtatva más kimenetet adott (nem determinisztikus).'],
        languages: [
          { ...report().languages[0], deterministic: false },
          { ...report().languages[1], status: 'mismatch', sections: [report().languages[1].sections[0], { order: 2, label: '2.', section: 2, status: 'mismatch', preview: '3' }] },
        ],
      });
      const fixture = preview(doneJob({ result: { proposal: proposal(), report: bad, model: 'm', notes: null, reasked: true } }));
      expect(q(fixture, 'ai-task-invalid')!.textContent).toContain('eltér a Python-megoldásétól');
      expect(q(fixture, 'ai-task-tab-ellenorzes')!.getAttribute('aria-selected')).toBe('true');
      expect(q(fixture, 'ai-task-warnings')!.textContent).toContain('nem determinisztikus');
      expect(q(fixture, 'ai-task-nondeterministic')).not.toBeNull();
      expect(q(fixture, 'ai-task-check-csharp')!.textContent).toContain('✘');
      expect(q(fixture, 'ai-task-check-csharp')!.textContent).toContain('eltérés');
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(true);
    });

    it('módosítás után a Mentés tiltott, amíg az újraellenőrzés nem sikerül; utána a normalizált változat menthető', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(false);

      c.setSubtask(1, { points: 5 });
      fixture.detectChanges();
      expect(q(fixture, 'ai-task-dirty')).not.toBeNull();
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(true);

      const normalized = proposal({ subtasks: c.proposal()!.subtasks, stdin: null, description: 'normalizált' });
      service.validate.mockReturnValue(of({ proposal: normalized, report: report() }));
      q(fixture, 'ai-task-revalidate')!.click();
      fixture.detectChanges();

      expect(service.validate).toHaveBeenCalledWith(9, 77, expect.objectContaining({ subtasks: expect.arrayContaining([expect.objectContaining({ label: '2.', points: 5 })]) }));
      expect(q(fixture, 'ai-task-dirty')).toBeNull();
      expect(c.proposal()).toBe(normalized);
      q(fixture, 'ai-task-save')!.click();
      expect(service.apply).toHaveBeenCalledWith(9, 77, normalized);
    });

    it('sikertelen újraellenőrzés után sem menthető', () => {
      const fixture = preview();
      fixture.componentInstance.setField('description', 'új leírás');
      service.validate.mockReturnValue(of({ proposal: fixture.componentInstance.proposal()!, report: report({ status: 'failed', canSave: false, errors: ['hiba'] }) }));
      fixture.detectChanges();
      q(fixture, 'ai-task-revalidate')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'ai-task-dirty')).toBeNull();
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(true);
    });

    it('ha a tanár az újraellenőrzés közben tovább ír, a módosítása megmarad és újra ellenőrizni kell', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      const pending = new Subject<AiCodeTaskValidateResult>();
      service.validate.mockReturnValue(pending);
      c.setField('description', 'első');
      c.revalidate();
      c.setField('description', 'második');
      pending.next({ proposal: proposal({ description: 'első' }), report: report() });
      fixture.detectChanges();
      expect(c.proposal()!.description).toBe('második');
      expect(c.dirty()).toBe(true);
      expect(c.canSave()).toBe(false);
    });

    it('a generáló szkript átírása törli a fájltartalmat (az újraellenőrzés futtatja)', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.tab.set('adatfajl');
      c.setGenerator('import random\nrandom.seed(7)\nfor i in range(500): print(i)\n');
      fixture.detectChanges();
      expect(c.proposal()!.dataFile!.content).toBeNull();
      expect((q(fixture, 'ai-task-df-download') as HTMLButtonElement).disabled).toBe(true);
      expect(q(fixture, 'ai-task-df-content')!.textContent).toContain('az Újraellenőrzés futtatja le');
    });

    it('2. mód: részfeladat hozzáadása minden nyelvhez kódrészletet ad, a törlés elveszi', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      q(fixture, 'ai-task-add-subtask')!.click();
      expect(c.proposal()!.subtasks.map((s) => s.label)).toEqual(['1.', '2.', '3.']);
      expect(c.proposal()!.languages.every((l) => l.snippets.length === 3)).toBe(true);
      c.removeSubtask(0);
      expect(c.proposal()!.subtasks.map((s) => s.label)).toEqual(['2.', '3.']);
      expect(c.proposal()!.languages[1].snippets[0].code).toBe('Console.WriteLine(f.Length);');
    });

    it('Visszaállítás: a generált változat és ellenőrzés vissza, újra menthető', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.setField('title', 'Más cím');
      fixture.detectChanges();
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(true);
      q(fixture, 'ai-task-restore')!.click();
      fixture.detectChanges();
      expect(c.proposal()!.title).toBe('Kártyajáték');
      expect(q(fixture, 'ai-task-restore')).toBeNull();
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(false);
    });

    it('Visszaállítás egy közben újraellenőrzött változat után: a szerver már mást ismer, újra kell ellenőrizni', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      c.setField('title', 'Más cím');
      c.revalidate();
      c.restore();
      fixture.detectChanges();
      expect(c.dirty()).toBe(true);
      expect((q(fixture, 'ai-task-save') as HTMLButtonElement).disabled).toBe(true);
    });

    it('az elavult újraellenőrzés-választ (Elvetés után) eldobja', () => {
      const fixture = preview();
      const c = fixture.componentInstance;
      const pending = new Subject<AiCodeTaskValidateResult>();
      service.validate.mockReturnValue(pending);
      c.setField('title', 'x');
      c.revalidate();
      q(fixture, 'ai-task-discard')!.click();
      fixture.detectChanges();
      expect(pending.observed).toBe(false);
      expect(service.forget).toHaveBeenCalledWith(9, 77);
      expect(q(fixture, 'ai-task-input')).not.toBeNull();
      expect(c.report()).toBeNull();
    });

    it('a 413-at és a futtató-kiesést érthetően jelzi', () => {
      const fixture = preview();
      fixture.componentInstance.setField('title', 'x');
      service.validate.mockReturnValue(throwError(() => ({ status: 413 })));
      fixture.detectChanges();
      q(fixture, 'ai-task-revalidate')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'ai-task-revalidate-error')!.textContent).toContain('legfeljebb 3 MB');

      service.validate.mockReturnValue(of({ proposal: fixture.componentInstance.proposal()!, report: report({ status: 'unavailable', canSave: false, errors: ['időtúllépés'] }) }));
      q(fixture, 'ai-task-revalidate')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'ai-task-unavailable')!.textContent).toContain('próbáld újra');
      expect(q(fixture, 'ai-task-revalidate')).not.toBeNull();
    });

    it('Mentés: toast a mentett részekkel, saved a feladat azonosítójával, bezárás, megjegyzés törlése', () => {
      const fixture = preview();
      const saved = vi.fn();
      const closed = vi.fn();
      fixture.componentInstance.saved.subscribe(saved);
      fixture.componentInstance.closed.subscribe(closed);
      q(fixture, 'ai-task-save')!.click();
      expect(service.apply).toHaveBeenCalledWith(9, 77, proposal());
      expect(toast.success).toHaveBeenCalledWith('Elmentve: feladat, 2 részfeladat kódrészletekkel.');
      expect(saved).toHaveBeenCalledWith(456);
      expect(closed).toHaveBeenCalled();
      expect(service.forget).toHaveBeenCalledWith(9, 77);
    });

    it('sikertelen mentésnél a hiba látszik, az ablak nyitva marad', () => {
      const fixture = preview();
      const closed = vi.fn();
      fixture.componentInstance.closed.subscribe(closed);
      service.apply.mockReturnValue(throwError(() => ({ status: 400, error: { errorMessage: 'Mentés előtt futtasd le az újraellenőrzést.' } })));
      q(fixture, 'ai-task-save')!.click();
      fixture.detectChanges();
      expect(q(fixture, 'ai-task-save-error')!.textContent).toContain('futtasd le az újraellenőrzést');
      expect(closed).not.toHaveBeenCalled();
    });
  });

  describe('1. mód előnézet', () => {
    it('a meglévő részek csak olvashatók, a hiányzó pont szerkeszthető; mentési hibánál is frissül a szerkesztő', () => {
      const existing = proposal({
        title: null,
        description: null,
        subtasks: [{ subTaskId: 1, label: '1.', text: 'Olvasd be', points: null, existing: true, pointsExisting: false }],
        stdin: '5\n',
        stdinExisting: true,
        languages: [{ language: 'python', solution: 'x', solutionExisting: true, snippets: [{ code: 'y', existing: false }] }],
      });
      const fixture = create({ mode: 'complete', task: codeTask() });
      jobQueue = [() => of(doneJob({ mode: 'complete', taskId: 5, result: { proposal: existing, report: report(), model: 'm', notes: null, reasked: false } }))];
      q(fixture, 'ai-task-start')!.click();
      fixture.detectChanges();

      expect(q(fixture, 'ai-task-p-title')).toBeNull();
      expect((q(fixture, 'ai-task-st-text-0') as HTMLTextAreaElement).readOnly).toBe(true);
      expect((q(fixture, 'ai-task-st-points-0') as HTMLInputElement).readOnly).toBe(false);
      expect(q(fixture, 'ai-task-add-subtask')).toBeNull();
      fixture.componentInstance.tab.set('megoldas');
      fixture.detectChanges();
      expect((q(fixture, 'ai-task-solution-python') as HTMLTextAreaElement).readOnly).toBe(true);
      expect((q(fixture, 'ai-task-stdin') as HTMLTextAreaElement).readOnly).toBe(true);

      const saved = vi.fn();
      fixture.componentInstance.saved.subscribe(saved);
      service.apply.mockReturnValue(throwError(() => ({ status: 400, error: { errorMessage: 'Élő vizsga fut.' } })));
      q(fixture, 'ai-task-save')!.click();
      expect(saved).toHaveBeenCalledWith(5);
    });
  });
});
