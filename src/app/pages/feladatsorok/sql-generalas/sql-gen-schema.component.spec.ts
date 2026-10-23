import { TestBed } from '@angular/core/testing';
import { ReferenceSubtaskCheckDto, SqlGenerationResultDto } from '../../../models/teacher-content.model';
import { SqlGenSchemaComponent } from './sql-gen-schema.component';

function result(referenceChecks: SqlGenerationResultDto['referenceChecks']): SqlGenerationResultDto {
  return {
    source: 'createSql',
    model: 'm',
    files: [],
    tables: [
      {
        name: 'diak',
        source: 'diak.txt',
        columns: [
          { name: 'id', type: 'INTEGER', primaryKey: true, notNull: true, references: null },
          { name: 'osztaly', type: 'VARCHAR', primaryKey: false, notNull: false, references: 'osztaly.id' },
        ],
        expectedRows: 3,
        actualRows: 2,
      },
    ],
    warnings: [],
    validation: { status: 'ok', errors: [] },
    referenceChecks,
    aiNotes: null,
    canSave: true,
  };
}

describe('SqlGenSchemaComponent', () => {
  function create(value: SqlGenerationResultDto) {
    TestBed.configureTestingModule({ imports: [SqlGenSchemaComponent] });
    const fixture = TestBed.createComponent(SqlGenSchemaComponent);
    fixture.componentRef.setInput('result', value);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a táblát oszlopokkal, magyar típusnévvel, kulccsal, hivatkozással és eltérő sorszámmal mutatja', () => {
    const fixture = create(result([]));
    const table = fixture.nativeElement.querySelector('[data-testid="sql-gen-table-diak"]') as HTMLElement;
    const text = table.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('forrás: diak.txt');
    expect(text).toContain('id egész kulcs');
    // Ismeretlen típus: kisbetűvel, ahogy jött.
    expect(text).toContain('osztaly varchar → osztaly.id');
    expect(table.querySelector('.text-danger')!.textContent!.trim()).toBe('2 / 3 sor');
    expect(fixture.nativeElement.querySelector('[data-testid="sql-gen-reference-checks"]')).toBeNull();
  });

  it('a megoldások futtatását állapot-jelvénnyel, sorszámmal és hibával listázza', () => {
    const subtasks: ReferenceSubtaskCheckDto[] = [
      { label: '1.', status: 'match', rows: 4, message: null },
      { label: '2.', status: 'error', rows: null, message: 'no such column' },
    ];
    const fixture = create(result([{ taskId: 5, taskTitle: 'Iskola', subtasks }]));
    const items = [...fixture.nativeElement.querySelectorAll('[data-testid="sql-gen-reference-checks"] li')] as HTMLElement[];
    const parts = (li: HTMLElement) => [...li.children].map((el) => el.textContent!.trim());
    expect(items.map(parts)).toEqual([
      ['Iskola – 1.', 'ugyanazt adja, mint eddig', '4 sor'],
      ['Iskola – 2.', 'hiba', 'no such column'],
    ]);
    expect(items[0].querySelector('.badge')!.classList).toContain('badge-success');
    expect(items[1].querySelector('.badge')!.classList).toContain('badge-danger');
  });
});
