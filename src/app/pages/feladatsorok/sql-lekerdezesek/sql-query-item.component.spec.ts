import { TestBed } from '@angular/core/testing';
import { SqlQueryItemDto } from '../../../models/teacher-content.model';
import { SqlQueryItemComponent } from './sql-query-item.component';

function item(overrides: Partial<SqlQueryItemDto> = {}): SqlQueryItemDto {
  return {
    subTaskId: 3, label: '2. feladat', hadSnippet: false, willSave: true, sql: 'SELECT 1;', status: 'ok', error: null, warnings: [],
    preview: { columns: ['n', 'm'], rows: [['1', null]], totalRows: 25, truncated: true },
    ...overrides,
  };
}

describe('SqlQueryItemComponent', () => {
  function create(inputs: { item?: SqlQueryItemDto; check?: SqlQueryItemDto; text?: string; selected?: boolean; willSave?: boolean } = {}) {
    TestBed.configureTestingModule({ imports: [SqlQueryItemComponent] });
    const fixture = TestBed.createComponent(SqlQueryItemComponent);
    const value = inputs.item ?? item();
    fixture.componentRef.setInput('item', value);
    fixture.componentRef.setInput('check', 'check' in inputs ? inputs.check : value);
    fixture.componentRef.setInput('text', inputs.text ?? value.sql ?? '');
    fixture.componentRef.setInput('selected', inputs.selected ?? true);
    fixture.componentRef.setInput('willSave', inputs.willSave ?? true);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  afterEach(() => TestBed.resetTestingModule());

  it('ellenőrzés nélkül „nem ellenőrzött” semleges jelvény', () => {
    const fixture = create({ check: undefined });
    const badge = q(fixture, 'sql-q-status-3')!;
    expect(badge.getAttribute('aria-label')).toBe('Állapot: nem ellenőrzött');
    expect(badge.textContent!.replace(/\s+/g, ' ').trim()).toBe('⚠ nem ellenőrzött');
    expect(badge.classList).toContain('badge-neutral');
    expect(q(fixture, 'sql-q-preview-3')).toBeNull();
  });

  it('hibánál a hibát és a hiba-jelvényt mutatja; a „nem lesz mentve” figyelmeztetést nem ismétli a listában', () => {
    const check = item({ status: 'error', error: 'no such table: x', willSave: false, hadSnippet: true, preview: null,
      warnings: ['Nem lesz mentve: már van megoldás.', 'A rendezés nem egyértelmű.'] });
    const fixture = create({ check, willSave: false });
    expect(q(fixture, 'sql-q-status-3')!.classList).toContain('badge-danger');
    expect(q(fixture, 'sql-q-error-3')!.textContent).toBe('no such table: x');
    expect(q(fixture, 'sql-q-item-warnings-3')!.textContent!.trim()).toBe('A rendezés nem egyértelmű.');
    expect(q(fixture, 'sql-q-wont-save-3')).not.toBeNull();
    expect((q(fixture, 'sql-q-select-3') as HTMLInputElement).disabled).toBe(true);
  });

  it('az eredménytábla a sorszámot, az oszlopokat és a NULL-t mutatja', () => {
    const fixture = create();
    const preview = q(fixture, 'sql-q-preview-3')!;
    expect(preview.querySelector('p')!.textContent!.trim()).toBe('Eredmény: 25 sor – az első 1 látszik');
    expect([...preview.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['n', 'm']);
    expect([...preview.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['1', 'NULL']);
  });

  it('módosított szövegnél „módosítva” és Visszaállítás; üres szövegnél nem jelölhető; a változások a szülőnek mennek', async () => {
    const fixture = create({ text: '   ' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('módosítva');
    expect((q(fixture, 'sql-q-select-3') as HTMLInputElement).disabled).toBe(true);

    const restore = vi.fn();
    const toggled = vi.fn();
    const typed = vi.fn();
    fixture.componentInstance.restore.subscribe(restore);
    fixture.componentInstance.selectedToggle.subscribe(toggled);
    fixture.componentInstance.textChange.subscribe(typed);
    q(fixture, 'sql-q-restore-3')!.click();
    const editor = q(fixture, 'sql-q-editor-3') as HTMLTextAreaElement;
    editor.value = 'SELECT 2;';
    editor.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('text', 'SELECT 2;');
    fixture.detectChanges();
    q(fixture, 'sql-q-select-3')!.click();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(typed).toHaveBeenCalledWith('SELECT 2;');
    expect(toggled).toHaveBeenCalledTimes(1);
  });
});
