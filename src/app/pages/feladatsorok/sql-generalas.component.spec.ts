import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { MAX_EDIT_BYTES, SqlGeneralasComponent } from './sql-generalas.component';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { SqlGenerationResultDto, TeacherFileDto, TeacherFileKind } from '../../models/teacher-content.model';
import { ToastService } from '../../shared/toast/toast.service';

function file(id: string, kind: TeacherFileKind, name: string): TeacherFileDto {
  return { id, kind, originalFileName: name, contentType: 'text/plain', sizeBytes: 10, createdAt: '2026-10-15T10:00:00Z', url: `/api/teacher-files/${id}`, taskId: null };
}

function result(overrides: Partial<SqlGenerationResultDto> = {}): SqlGenerationResultDto {
  return {
    source: 'createSql',
    model: 'm',
    files: [{ kind: 'CreateLiteSql', fileName: 'create_lite.sql', content: 'PRAGMA foreign_keys = ON;\nCREATE TABLE t (id INTEGER PRIMARY KEY);\n', sizeBytes: 60 }],
    tables: [{ name: 't', source: 't', columns: [{ name: 'id', type: 'INTEGER', primaryKey: true, notNull: true, references: null }], expectedRows: 3, actualRows: 3 }],
    warnings: ['A forrás CHECK/DEFAULT megszorításai nem kerülnek át.'],
    validation: { status: 'ok', errors: [] },
    referenceChecks: [{ taskId: 5, taskTitle: 'SQL', subtasks: [{ label: '1. feladat', status: 'match', rows: 2, message: null }] }],
    aiNotes: 'Az id a kulcs.',
    canSave: true,
    ...overrides,
  };
}

describe('SqlGeneralasComponent', () => {
  let serviceMock: { generateSqlFiles: ReturnType<typeof vi.fn>; uploadFile: ReturnType<typeof vi.fn>; validateSqlFiles: ReturnType<typeof vi.fn> };
  let toastMock: { success: ReturnType<typeof vi.fn> };

  function create(files: TeacherFileDto[], generated: unknown = of(result())) {
    serviceMock = {
      generateSqlFiles: vi.fn(() => generated),
      uploadFile: vi.fn(() => of({})),
      validateSqlFiles: vi.fn(() => of(result({ source: 'validate' }))),
    };
    toastMock = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SqlGeneralasComponent],
      providers: [
        { provide: TeacherTaskSetService, useValue: serviceMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
    const fixture = TestBed.createComponent(SqlGeneralasComponent);
    fixture.componentRef.setInput('taskSetId', 9);
    fixture.componentRef.setInput('files', files);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('alapból a hiányzó fájlt kínálja; a forrás nélküli lehetőség tiltott', () => {
    const fixture = create([file('a', 'CreateSql', 'create.sql')]);

    expect(fixture.componentInstance.source()).toBe('createSql');
    expect((q(fixture, 'sql-gen-source-createSql') as HTMLInputElement).checked).toBe(true);
    expect((q(fixture, 'sql-gen-source-createLiteSql') as HTMLInputElement).disabled).toBe(true);
    expect((q(fixture, 'sql-gen-source-dataFiles') as HTMLInputElement).disabled).toBe(true);
    expect(q(fixture, 'sql-gen-input')!.textContent).toContain('Ehhez előbb töltsd fel a create_lite.sql fájlt.');
  });

  it('csak create_lite.sql esetén a create.sql elkészítését kínálja', () => {
    const fixture = create([file('b', 'CreateLiteSql', 'create_lite.sql')]);
    expect(fixture.componentInstance.source()).toBe('createLiteSql');
  });

  it('adatfájlokból: a kiválasztott fájlokkal, fejléccel és leírással kér, közben töltés-jelzés', () => {
    const pending = new Subject<SqlGenerationResultDto>();
    const fixture = create([file('f1', 'InputTxt', 'versenyzok.txt'), file('f2', 'InputTxt', 'eredmenyek.txt')], pending);
    expect(fixture.componentInstance.source()).toBe('dataFiles');
    expect(q(fixture, 'sql-gen-data-options')).not.toBeNull();

    q(fixture, 'sql-gen-file-option-f2')!.click();
    fixture.componentInstance.description.set('  Az azon a kulcs.  ');
    fixture.componentInstance.hasHeader.set(false);
    fixture.detectChanges();
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();

    expect(serviceMock.generateSqlFiles).toHaveBeenCalledWith(9, { source: 'dataFiles', description: 'Az azon a kulcs.', fileIds: ['f1'], hasHeader: false });
    expect(fixture.nativeElement.textContent).toContain('Készül a fájl');

    pending.next(result({ source: 'dataFiles' }));
    fixture.detectChanges();
    expect(q(fixture, 'sql-gen-preview')).not.toBeNull();
  });

  it('bezáráskor a folyamatban lévő elkészítést megszakítja', () => {
    const pending = new Subject<SqlGenerationResultDto>();
    const fixture = create([file('a', 'CreateSql', 'create.sql')], pending);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();
    expect(pending.observed).toBe(true);

    q(fixture, 'sql-gen-close')!.click();
    expect(pending.observed).toBe(false);
    expect(closed).toHaveBeenCalled();
  });

  it('kiválasztott adatfájl nélkül nem indítható', () => {
    const fixture = create([file('f1', 'InputTxt', 'a.txt')]);
    q(fixture, 'sql-gen-file-option-f1')!.click();
    fixture.detectChanges();
    expect((q(fixture, 'sql-gen-generate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('az előnézet mutatja a táblákat, sorszámokat, figyelmeztetéseket, a megoldások eredményét és a fájlt', () => {
    const fixture = create([file('a', 'CreateSql', 'create.sql'), file('b', 'CreateLiteSql', 'create_lite.sql')]);
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();

    expect(q(fixture, 'sql-gen-valid')).not.toBeNull();
    expect(q(fixture, 'sql-gen-table-t')!.textContent).toContain('3 / 3 sor');
    expect(q(fixture, 'sql-gen-table-t')!.textContent).toContain('kulcs');
    expect(q(fixture, 'sql-gen-warnings')!.textContent).toContain('CHECK/DEFAULT');
    expect(q(fixture, 'sql-gen-reference-checks')!.textContent).toContain('ugyanazt adja, mint eddig');
    expect(q(fixture, 'sql-gen-file-CreateLiteSql')!.textContent).toContain('CREATE TABLE t');
    // A meglévő create_lite.sql cseréjét jelezzük.
    expect(q(fixture, 'sql-gen-file-CreateLiteSql')!.textContent).toContain('lecserélődik');
    expect(fixture.nativeElement.textContent).toContain('Az id a kulcs.');
  });

  it('hibás ellenőrzésnél a hibák látszanak, és nem menthető', () => {
    const fixture = create([file('a', 'CreateSql', 'create.sql')],
      of(result({ validation: { status: 'failed', errors: ['„t”: 1 sor töltődött be 3 helyett.'] }, canSave: false })));
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();

    expect(q(fixture, 'sql-gen-invalid')!.textContent).toContain('1 sor töltődött be 3 helyett');
    expect((q(fixture, 'sql-gen-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a BE hibaüzenetét (errorMessage) mutatja', () => {
    const fixture = create([file('a', 'CreateSql', 'create.sql')],
      throwError(() => ({ status: 400, error: { errorType: 'OrafoglaloException', errorMessage: 'A(z) „t” tábla 2. sorában nem literál érték áll.' } })));
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();

    expect(q(fixture, 'sql-gen-error')!.textContent).toContain('nem literál érték');
    expect(q(fixture, 'sql-gen-input')).not.toBeNull();
  });

  it('mentés: a szokásos feltöltéssel, fájlonként, majd jelez és bezár', async () => {
    const both = result({
      source: 'dataFiles',
      files: [
        { kind: 'CreateSql', fileName: 'create.sql', content: 'CREATE TABLE t (id INT);', sizeBytes: 24 },
        { kind: 'CreateLiteSql', fileName: 'create_lite.sql', content: 'CREATE TABLE t (id INTEGER);', sizeBytes: 28 },
      ],
    });
    const fixture = create([file('f1', 'InputTxt', 'a.txt')], of(both));
    const saved = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();
    q(fixture, 'sql-gen-save')!.click();
    fixture.detectChanges();

    expect(serviceMock.uploadFile).toHaveBeenCalledTimes(2);
    const [taskSetId, kind, uploaded] = serviceMock.uploadFile.mock.calls[0] as [number, string, File];
    expect([taskSetId, kind, uploaded.name]).toEqual([9, 'CreateSql', 'create.sql']);
    expect(await uploaded.text()).toBe('CREATE TABLE t (id INT);');
    expect(serviceMock.uploadFile.mock.calls[1][1]).toBe('CreateLiteSql');
    expect(toastMock.success).toHaveBeenCalledWith('A create.sql és a create_lite.sql elmentve.');
    expect(saved).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
  });

  it('mentési hiba (pl. élő vizsga) a párbeszédablakban látszik, nem zár be', () => {
    const fixture = create([file('a', 'CreateSql', 'create.sql')]);
    serviceMock.uploadFile.mockReturnValue(throwError(() => ({ status: 400, error: { errorMessage: 'A create.sql/create_lite.sql cseréje jelenleg nem lehetséges: 1 diáknak folyamatban lévő vizsgája van.' } })));
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();
    q(fixture, 'sql-gen-save')!.click();
    fixture.detectChanges();

    expect(q(fixture, 'sql-gen-save-error')!.textContent).toContain('folyamatban lévő vizsgája');
    expect(closed).not.toHaveBeenCalled();
  });

  it('a Vissza a forrás-választáshoz visz', () => {
    const fixture = create([file('a', 'CreateSql', 'create.sql')]);
    q(fixture, 'sql-gen-generate')!.click();
    fixture.detectChanges();
    q(fixture, 'sql-gen-back')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'sql-gen-input')).not.toBeNull();
  });

  describe('kézi javítás', () => {
    function generated(fixture: ReturnType<typeof create>) {
      q(fixture, 'sql-gen-generate')!.click();
      fixture.detectChanges();
    }

    function typeInto(fixture: ReturnType<typeof create>, kind: string, text: string) {
      q(fixture, `sql-gen-edit-${kind}`)!.click();
      fixture.detectChanges();
      const editor = q(fixture, `sql-gen-editor-${kind}`) as HTMLTextAreaElement;
      expect(editor.getAttribute('aria-label')).toContain('szerkesztése');
      editor.value = text;
      editor.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('a szerkesztés letiltja a mentést, az újraellenőrzés a javított szöveggel visszaengedi', () => {
      const fixture = create([file('a', 'CreateSql', 'create.sql')]);
      generated(fixture);
      expect((q(fixture, 'sql-gen-save') as HTMLButtonElement).disabled).toBe(false);

      typeInto(fixture, 'CreateLiteSql', 'CREATE TABLE t (id INTEGER);');
      expect((q(fixture, 'sql-gen-save') as HTMLButtonElement).disabled).toBe(true);
      expect(q(fixture, 'sql-gen-dirty')).not.toBeNull();

      q(fixture, 'sql-gen-revalidate')!.click();
      fixture.detectChanges();
      expect(serviceMock.validateSqlFiles).toHaveBeenCalledWith(9, { createSql: null, createLiteSql: 'CREATE TABLE t (id INTEGER);' });
      expect(q(fixture, 'sql-gen-dirty')).toBeNull();
      expect((q(fixture, 'sql-gen-save') as HTMLButtonElement).disabled).toBe(false);
    });

    it('sikertelen újraellenőrzés után nem menthető, a hibák látszanak', () => {
      const fixture = create([file('a', 'CreateSql', 'create.sql')]);
      serviceMock.validateSqlFiles.mockReturnValue(of(result({ source: 'validate', canSave: false, validation: { status: 'failed', errors: ['near "TABEL": syntax error'] } })));
      generated(fixture);
      typeInto(fixture, 'CreateLiteSql', 'CREATE TABEL t;');
      q(fixture, 'sql-gen-revalidate')!.click();
      fixture.detectChanges();

      expect(q(fixture, 'sql-gen-invalid')!.textContent).toContain('syntax error');
      expect((q(fixture, 'sql-gen-save') as HTMLButtonElement).disabled).toBe(true);
    });

    it('a mentés a javított szöveget tölti fel', async () => {
      const fixture = create([file('a', 'CreateSql', 'create.sql')]);
      generated(fixture);
      typeInto(fixture, 'CreateLiteSql', 'JAVÍTOTT');
      q(fixture, 'sql-gen-revalidate')!.click();
      fixture.detectChanges();
      q(fixture, 'sql-gen-save')!.click();
      fixture.detectChanges();

      const [, kind, uploaded] = serviceMock.uploadFile.mock.calls[0] as [number, string, File];
      expect(kind).toBe('CreateLiteSql');
      expect(await uploaded.text()).toBe('JAVÍTOTT');
    });

    it('a Visszaállítás az elkészített szöveget és az eredeti ellenőrzést hozza vissza', () => {
      const fixture = create([file('a', 'CreateSql', 'create.sql')]);
      generated(fixture);
      typeInto(fixture, 'CreateLiteSql', 'más');
      q(fixture, 'sql-gen-restore-CreateLiteSql')!.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.texts().CreateLiteSql).toBe(result().files[0].content);
      expect(q(fixture, 'sql-gen-dirty')).toBeNull();
      expect((q(fixture, 'sql-gen-save') as HTMLButtonElement).disabled).toBe(false);
    });

    it('a Letöltés a (javított) szöveget a fájl nevén menti', async () => {
      const blobs: Blob[] = [];
      const names: string[] = [];
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blobs.push(b as Blob); return 'blob:x'; });
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
      const fixture = create([file('a', 'CreateSql', 'create.sql')]);
      generated(fixture);
      typeInto(fixture, 'CreateLiteSql', 'Árvíztűrő');
      q(fixture, 'sql-gen-download-CreateLiteSql')!.click();

      expect(names).toEqual(['create_lite.sql']);
      expect(await blobs[0].text()).toBe('Árvíztűrő');
      [createUrl, revoke, click].forEach((m) => m.mockRestore());
    });

    it('nagy fájlnál nincs böngészős szerkesztés, csak letöltés és útmutatás', () => {
      const big = result({ files: [{ kind: 'CreateLiteSql', fileName: 'create_lite.sql', content: 'x', sizeBytes: MAX_EDIT_BYTES + 1 }] });
      const fixture = create([file('a', 'CreateSql', 'create.sql')], of(big));
      generated(fixture);

      expect(q(fixture, 'sql-gen-edit-CreateLiteSql')).toBeNull();
      expect(q(fixture, 'sql-gen-download-CreateLiteSql')).not.toBeNull();
      expect(q(fixture, 'sql-gen-large-CreateLiteSql')!.textContent).toContain('töltsd le, szerkeszd a gépeden');
    });
  });
});
