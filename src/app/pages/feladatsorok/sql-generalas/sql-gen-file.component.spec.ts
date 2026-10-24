import { TestBed } from '@angular/core/testing';
import { GeneratedSqlFileDto } from '../../../models/teacher-content.model';
import { MAX_EDIT_BYTES, SqlGenFileComponent } from './sql-gen-file.component';

const FILE: GeneratedSqlFileDto = { kind: 'CreateLiteSql', fileName: 'create_lite.sql', content: 'CREATE TABLE t (id INTEGER);', sizeBytes: 28 };

describe('SqlGenFileComponent', () => {
  function create(inputs: { file?: GeneratedSqlFileDto; text?: string; editing?: boolean; replaces?: boolean } = {}) {
    TestBed.configureTestingModule({ imports: [SqlGenFileComponent] });
    const fixture = TestBed.createComponent(SqlGenFileComponent);
    const file = inputs.file ?? FILE;
    fixture.componentRef.setInput('file', file);
    fixture.componentRef.setInput('text', inputs.text ?? file.content);
    fixture.componentRef.setInput('editing', inputs.editing ?? false);
    fixture.componentRef.setInput('replaces', inputs.replaces ?? false);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const summary = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.querySelector('summary')!.textContent!.replace(/\s+/g, ' ').trim();

  afterEach(() => TestBed.resetTestingModule());

  it('elkészített szövegnél a kapott méretet és a csere-jelzést mutatja, „módosítva” és Visszaállítás nélkül', () => {
    const fixture = create({ replaces: true });
    expect(summary(fixture)).toBe('create_lite.sql (28 bájt – a meglévő fájl lecserélődik)');
    expect(q(fixture, 'sql-gen-restore-CreateLiteSql')).toBeNull();
    expect(fixture.nativeElement.querySelector('pre')!.textContent).toBe(FILE.content);
  });

  it('szerkesztett szövegnél a szöveg UTF-8 méretét mutatja, „módosítva” jelzéssel; a gombok a szülőnek jeleznek', () => {
    const fixture = create({ text: 'á'.repeat(1024) });
    expect(summary(fixture)).toContain('create_lite.sql (2 KB)');
    expect(fixture.nativeElement.querySelector('summary .badge')!.textContent).toBe('módosítva');
    const restore = vi.fn();
    const download = vi.fn();
    const toggle = vi.fn();
    fixture.componentInstance.restore.subscribe(restore);
    fixture.componentInstance.download.subscribe(download);
    fixture.componentInstance.editToggle.subscribe(toggle);
    q(fixture, 'sql-gen-restore-CreateLiteSql')!.click();
    q(fixture, 'sql-gen-download-CreateLiteSql')!.click();
    q(fixture, 'sql-gen-edit-CreateLiteSql')!.click();
    expect([restore, download, toggle].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('szerkesztés közben a szövegmező a szöveget mutatja, és a gépelést továbbítja', async () => {
    const fixture = create({ editing: true });
    await fixture.whenStable();
    const editor = q(fixture, 'sql-gen-editor-CreateLiteSql') as HTMLTextAreaElement;
    expect(editor.value).toBe(FILE.content);
    expect(q(fixture, 'sql-gen-edit-CreateLiteSql')!.getAttribute('aria-pressed')).toBe('true');
    const changed = vi.fn();
    fixture.componentInstance.textChange.subscribe(changed);
    editor.value = 'X';
    editor.dispatchEvent(new Event('input'));
    expect(changed).toHaveBeenCalledWith('X');
  });

  it('a határon még szerkeszthető, fölötte csak letölthető', () => {
    const atLimit = create({ file: { ...FILE, sizeBytes: MAX_EDIT_BYTES } });
    expect(q(atLimit, 'sql-gen-edit-CreateLiteSql')).not.toBeNull();
    expect(q(atLimit, 'sql-gen-large-CreateLiteSql')).toBeNull();
    TestBed.resetTestingModule();
    const big = create({ file: { ...FILE, sizeBytes: MAX_EDIT_BYTES + 1 } });
    expect(q(big, 'sql-gen-edit-CreateLiteSql')).toBeNull();
    expect(q(big, 'sql-gen-large-CreateLiteSql')).not.toBeNull();
  });

  it('az előnézet 200 sor után levág, és jelzi a maradékot', () => {
    const text = Array.from({ length: 205 }, (_, i) => `sor${i + 1}`).join('\n');
    const fixture = create({ text });
    const pre = fixture.nativeElement.querySelector('pre')!.textContent!;
    expect(pre).toContain('sor200\n… (további 5 sor - a mentés a teljes fájlt tartalmazza)');
    expect(pre).not.toContain('sor201');
  });
});
