import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { SqlLekerdezesekComponent } from './sql-lekerdezesek.component';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { SqlQueryApplyResultDto, SqlQueryItemDto, SqlQueryResultDto, TeacherTaskDto } from '../../models/teacher-content.model';
import { ToastService } from '../../shared/toast/toast.service';

function task(overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto {
  return {
    id: 95,
    title: 'Települések',
    description: '',
    maxPoints: 10,
    taskOrder: 3,
    taskTypeIds: [5],
    completeSolutionSnippets: [],
    subTasks: [
      { id: 123, label: '2. feladat', snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }] },
      { id: 124, label: '3. feladat', snippets: [] },
    ],
    ...overrides,
  };
}

function item(overrides: Partial<SqlQueryItemDto> = {}): SqlQueryItemDto {
  return {
    subTaskId: 124,
    label: '3. feladat',
    hadSnippet: false,
    sql: 'SELECT varmegye, COUNT(*) AS db\nFROM telepules\nGROUP BY varmegye\nORDER BY varmegye;',
    status: 'ok',
    error: null,
    warnings: [],
    preview: { columns: ['varmegye', 'db'], rows: [['Baranya', '1'], ['Somogy', null]], totalRows: 25, truncated: true },
    ...overrides,
  };
}

function result(queries: SqlQueryItemDto[] = [item()], overrides: Partial<SqlQueryResultDto> = {}): SqlQueryResultDto {
  return { taskId: 95, model: 'openai/gpt-4o', queries, warnings: [], validationStatus: 'ok', canApply: true, aiNotes: null, ...overrides };
}

describe('SqlLekerdezesekComponent', () => {
  let serviceMock: {
    generateSqlQueries: ReturnType<typeof vi.fn>;
    validateSqlQueries: ReturnType<typeof vi.fn>;
    applySqlQueries: ReturnType<typeof vi.fn>;
  };
  let toastMock: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  function create(opts: { task?: TeacherTaskDto; hasLite?: boolean; generated?: unknown } = {}) {
    serviceMock = {
      generateSqlQueries: vi.fn(() => opts.generated ?? of(result())),
      validateSqlQueries: vi.fn(() => of(result([item()], { model: '' }))),
      applySqlQueries: vi.fn(() => of<SqlQueryApplyResultDto>({ applied: [124], skipped: [] })),
    };
    toastMock = { success: vi.fn(), warning: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SqlLekerdezesekComponent],
      providers: [
        { provide: TeacherTaskSetService, useValue: serviceMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
    const fixture = TestBed.createComponent(SqlLekerdezesekComponent);
    fixture.componentRef.setInput('taskSetId', 9);
    fixture.componentRef.setInput('task', opts.task ?? task());
    fixture.componentRef.setInput('hasLiteSql', opts.hasLite ?? true);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function typeInto(fixture: { nativeElement: HTMLElement; detectChanges: () => void }, id: string, text: string) {
    const area = q(fixture, id) as HTMLTextAreaElement;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('create_lite.sql nélkül nem indítható, és az SQL-fájl generálóhoz vezet', () => {
    const fixture = create({ hasLite: false });
    const open = vi.fn();
    fixture.componentInstance.openSqlFiles.subscribe(open);

    expect(q(fixture, 'sql-q-no-lite')!.textContent).toContain('még nincs create_lite.sql');
    expect((q(fixture, 'sql-q-generate') as HTMLButtonElement).disabled).toBe(true);
    q(fixture, 'sql-q-open-sql-files')!.click();
    expect(open).toHaveBeenCalled();
  });

  it('részfeladat nélkül nem indítható', () => {
    const fixture = create({ task: task({ subTasks: [] }) });
    expect(q(fixture, 'sql-q-no-subtasks')).not.toBeNull();
    expect((q(fixture, 'sql-q-generate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('alapból csak a hiányzókra kér', () => {
    const fixture = create();
    expect(q(fixture, 'sql-q-summary')!.textContent).toContain('1');
    expect((q(fixture, 'sql-q-regenerate') as HTMLInputElement).checked).toBe(false);
    q(fixture, 'sql-q-generate')!.click();
    expect(serviceMock.generateSqlQueries).toHaveBeenCalledWith(9, 95, { regenerate: false });
  });

  it('bejelölve a meglévőket is újraíratja', () => {
    const second = create();
    q(second, 'sql-q-regenerate')!.click();
    second.detectChanges();
    q(second, 'sql-q-generate')!.click();
    expect(serviceMock.generateSqlQueries).toHaveBeenCalledWith(9, 95, { regenerate: true });
  });

  it('ha minden részfeladatnak van megoldása, az újraírás az alapértelmezés; kikapcsolva nem indítható', () => {
    const fixture = create({ task: task({ subTasks: [{ id: 123, label: '2.', snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }] }] }) });
    expect(fixture.componentInstance.regenerate()).toBe(true);
    fixture.componentInstance.regenerate.set(false);
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-nothing-missing')).not.toBeNull();
    expect((q(fixture, 'sql-q-generate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('elkészítés közben töltés-jelzés; a Mégse megszakítja és visszavisz', () => {
    const pending = new Subject<SqlQueryResultDto>();
    const fixture = create({ generated: pending });
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-generating')).not.toBeNull();
    expect(pending.observed).toBe(true);

    q(fixture, 'sql-q-cancel')!.click();
    fixture.detectChanges();
    expect(pending.observed).toBe(false);
    expect(q(fixture, 'sql-q-input')).not.toBeNull();
  });

  it('bezáráskor a folyamatban lévő elkészítést megszakítja', () => {
    const pending = new Subject<SqlQueryResultDto>();
    const fixture = create({ generated: pending });
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();

    q(fixture, 'sql-q-close')!.click();
    expect(pending.observed).toBe(false);
    expect(closed).toHaveBeenCalled();
  });

  it('a BE hibaüzenetét mutatja', () => {
    const fixture = create({ generated: throwError(() => ({ status: 400, error: { errorMessage: 'Az MI nem válaszolt időben.' } })) });
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-error')!.textContent).toContain('Az MI nem válaszolt időben.');
  });

  it('429-nél érthető szöveget mutat', () => {
    const limited = create({ generated: throwError(() => ({ status: 429, error: { message: 'Kérjük várjon' } })) });
    q(limited, 'sql-q-generate')!.click();
    limited.detectChanges();
    expect(q(limited, 'sql-q-error')!.textContent).toContain('Túl sok kérés');
  });

  it('az előnézet részfeladatonként mutatja az állapotot, a figyelmeztetéseket és az eredménytáblát', () => {
    const fixture = create({
      generated: of(
        result(
          [
            item({ subTaskId: 123, label: '2. feladat', hadSnippet: true, warnings: ['Nincs ORDER BY: a sorrend nem garantált.'] }),
            item({ subTaskId: 124, status: 'error', error: 'no such column: megye', preview: null }),
            item({ subTaskId: 125, label: '1. feladat', sql: null, status: 'missing', preview: null, warnings: ['Ez importálás, nem kell SQL.'] }),
          ],
          { aiNotes: 'A megye oszlop neve varmegye.', warnings: ['Összesített figyelmeztetés'] },
        ),
      ),
    });
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();

    expect(q(fixture, 'sql-q-status-123')!.textContent).toContain('✔');
    expect(q(fixture, 'sql-q-status-124')!.textContent).toContain('✘');
    expect(q(fixture, 'sql-q-status-125')!.textContent).toContain('⚠');
    expect(q(fixture, 'sql-q-status-124')!.getAttribute('aria-label')).toBe('Állapot: hiba');
    expect(q(fixture, 'sql-q-had-123')).not.toBeNull();
    expect(q(fixture, 'sql-q-item-warnings-123')!.textContent).toContain('Nincs ORDER BY');
    expect(q(fixture, 'sql-q-error-124')!.textContent).toContain('no such column');
    expect(q(fixture, 'sql-q-warnings')!.textContent).toContain('Összesített');
    expect(fixture.nativeElement.textContent).toContain('A megye oszlop neve varmegye.');

    const preview = q(fixture, 'sql-q-preview-123')!;
    expect(preview.textContent).toContain('25 sor – az első 2 látszik');
    expect(preview.querySelectorAll('th').length).toBe(2);
    expect(preview.textContent).toContain('NULL');
    expect(preview.querySelector('.overflow-x-auto')).not.toBeNull();

    // Alapból csak a hibátlanok vannak kijelölve; az üres nem jelölhető.
    expect((q(fixture, 'sql-q-select-123') as HTMLInputElement).checked).toBe(true);
    expect((q(fixture, 'sql-q-select-124') as HTMLInputElement).checked).toBe(false);
    expect((q(fixture, 'sql-q-select-125') as HTMLInputElement).disabled).toBe(true);
    expect(q(fixture, 'sql-q-save')!.textContent).toContain('Mentés (1)');
  });

  it('szerkesztés után a mentés tiltott, amíg újra nem ellenőrzöd; a Visszaállítás visszahozza az eredetit', () => {
    const fixture = create();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(false);

    typeInto(fixture, 'sql-q-editor-124', 'SELECT nev FROM telepules ORDER BY nev;');
    expect(q(fixture, 'sql-q-dirty')).not.toBeNull();
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(true);

    q(fixture, 'sql-q-restore-124')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-dirty')).toBeNull();
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('az újraellenőrzés a nem üres lekérdezéseket küldi, és a rendbe jött lekérdezést kijelöli', () => {
    const fixture = create({ generated: of(result([item({ subTaskId: 123, label: '2.' }), item({ status: 'error', error: 'hiba', preview: null })])) });
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    serviceMock.validateSqlQueries.mockReturnValue(of(result([item({ subTaskId: 123, label: '2.' }), item({ sql: 'SELECT 2;' })], { model: '' })));

    typeInto(fixture, 'sql-q-editor-124', 'SELECT 2;');
    q(fixture, 'sql-q-revalidate')!.click();
    fixture.detectChanges();

    expect(serviceMock.validateSqlQueries).toHaveBeenCalledWith(9, 95, [
      { subTaskId: 123, sql: item().sql },
      { subTaskId: 124, sql: 'SELECT 2;' },
    ]);
    expect(q(fixture, 'sql-q-dirty')).toBeNull();
    expect(q(fixture, 'sql-q-status-124')!.textContent).toContain('✔');
    expect((q(fixture, 'sql-q-select-124') as HTMLInputElement).checked).toBe(true);
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('az újraellenőrzés alatti újabb szerkesztés továbbra is piszkos marad', () => {
    const pending = new Subject<SqlQueryResultDto>();
    const fixture = create();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    serviceMock.validateSqlQueries.mockReturnValue(pending);

    typeInto(fixture, 'sql-q-editor-124', 'SELECT 2;');
    q(fixture, 'sql-q-revalidate')!.click();
    typeInto(fixture, 'sql-q-editor-124', 'SELECT 3;');
    pending.next(result([item({ sql: 'SELECT 2;' })], { model: '' }));
    fixture.detectChanges();

    expect(q(fixture, 'sql-q-dirty')).not.toBeNull();
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Vissza után az elavult újraellenőrzés-válasz nem ír az új előnézetbe', () => {
    const pending = new Subject<SqlQueryResultDto>();
    const fixture = create();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    serviceMock.validateSqlQueries.mockReturnValue(pending);
    typeInto(fixture, 'sql-q-editor-124', 'SELECT 2;');
    q(fixture, 'sql-q-revalidate')!.click();
    expect(pending.observed).toBe(true);

    q(fixture, 'sql-q-back')!.click();
    fixture.detectChanges();
    expect(pending.observed).toBe(false);
    expect(q(fixture, 'sql-q-input')).not.toBeNull();

    // Új elkészítés: tiszta állapot, a régi válasz (ha mégis jönne) nem számít.
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    pending.next(result([item({ status: 'error', error: 'régi' })]));
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-error-124')).toBeNull();
    expect(q(fixture, 'sql-q-dirty')).toBeNull();
  });

  it('hibás újraellenőrzésnél a hiba látszik, a mentés tiltott marad', () => {
    const fixture = create();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    serviceMock.validateSqlQueries.mockReturnValue(throwError(() => ({ status: 429, error: {} })));
    typeInto(fixture, 'sql-q-editor-124', 'SELECT 2;');
    q(fixture, 'sql-q-revalidate')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-revalidate-error')!.textContent).toContain('Túl sok kérés');
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('kijelölt hibás lekérdezéssel nem menthető', () => {
    const fixture = create({ generated: of(result([item({ status: 'error', error: 'x', preview: null })])) });
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    q(fixture, 'sql-q-select-124')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-error-selected')).not.toBeNull();
    expect((q(fixture, 'sql-q-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a mentés a kijelölt lekérdezéseket küldi a felülírás-engedéllyel, toastban sorolja a mentetteket', () => {
    const fixture = create({
      generated: of(result([item({ subTaskId: 123, label: '2. feladat', hadSnippet: true }), item(), item({ subTaskId: 126, label: '4. feladat' })])),
    });
    const saved = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    q(fixture, 'sql-q-regenerate')!.click();
    fixture.detectChanges();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    q(fixture, 'sql-q-select-126')!.click(); // kivéve
    fixture.detectChanges();
    serviceMock.applySqlQueries.mockReturnValue(of({ applied: [123, 124], skipped: [] }));

    q(fixture, 'sql-q-save')!.click();

    expect(serviceMock.applySqlQueries).toHaveBeenCalledWith(9, 95, {
      queries: [
        { subTaskId: 123, sql: item().sql },
        { subTaskId: 124, sql: item().sql },
      ],
      overwrite: true,
    });
    expect(toastMock.success).toHaveBeenCalledWith('SQL-megoldás mentve: 2. feladat, 3. feladat.');
    expect(saved).toHaveBeenCalledWith([123, 124]);
    expect(closed).toHaveBeenCalled();
  });

  it('kimaradt részfeladatot figyelmeztetésben jelez; ha semmi sem mentődött, az ablak nyitva marad', () => {
    const fixture = create();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    serviceMock.applySqlQueries.mockReturnValue(of({ applied: [], skipped: [{ subTaskId: 124, reason: 'Már van SQL-megoldása.' }] }));

    q(fixture, 'sql-q-save')!.click();
    fixture.detectChanges();
    expect(serviceMock.applySqlQueries.mock.calls[0][2].overwrite).toBe(false);
    expect(q(fixture, 'sql-q-save-error')!.textContent).toContain('3. feladat: Már van SQL-megoldása.');
    expect(closed).not.toHaveBeenCalled();
  });

  it('részleges mentésnél figyelmeztető toast a kimaradtakkal', () => {
    const fixture = create({ generated: of(result([item({ subTaskId: 123, label: '2. feladat' }), item()])) });
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    serviceMock.applySqlQueries.mockReturnValue(of({ applied: [124], skipped: [{ subTaskId: 123, reason: 'Már van.' }] }));
    q(fixture, 'sql-q-save')!.click();
    expect(toastMock.warning).toHaveBeenCalledWith('SQL-megoldás mentve: 3. feladat. Kimaradt – 2. feladat: Már van.', 8000);
  });

  it('mentési hibánál a BE üzenete látszik', () => {
    const fixture = create();
    q(fixture, 'sql-q-generate')!.click();
    fixture.detectChanges();
    serviceMock.applySqlQueries.mockReturnValue(throwError(() => ({ status: 400, error: { errorMessage: 'Folyamatban lévő vizsga.' } })));
    q(fixture, 'sql-q-save')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-q-save-error')!.textContent).toContain('Folyamatban lévő vizsga.');
  });

  it('az ablak dialógus szerepű, címkézett', () => {
    const fixture = create();
    const dialog = q(fixture, 'sql-queries-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(fixture.nativeElement.querySelector('#' + dialog.getAttribute('aria-labelledby'))!.textContent).toContain('SQL megoldó lekérdezések');
  });
});
