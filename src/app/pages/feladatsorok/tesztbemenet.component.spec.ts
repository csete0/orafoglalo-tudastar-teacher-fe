import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { readsKeyboardInput, TesztbemenetComponent } from './tesztbemenet.component';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { TeacherRunInputDto, TeacherTaskDto } from '../../models/teacher-content.model';
import { ToastService } from '../../shared/toast/toast.service';

function makeTask(code: string, overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto {
  return {
    id: 7,
    title: 'F1',
    description: 'd',
    maxPoints: 10,
    taskOrder: 1,
    taskTypeIds: [6],
    subTasks: [],
    completeSolutionSnippets: [{ programmingLanguageId: 2, code }],
    ...overrides,
  };
}

describe('TesztbemenetComponent', () => {
  let serviceMock: { getRunInput: ReturnType<typeof vi.fn>; saveRunInput: ReturnType<typeof vi.fn> };

  function create(stored: TeacherRunInputDto, task = makeTask('x = input()\nprint(x)')) {
    serviceMock = {
      getRunInput: vi.fn(() => of(stored)),
      // A BE a végére sortörést tesz - a szerkesztő ezt nem mutatja üres sorként.
      saveRunInput: vi.fn((_: number, __: number, input: TeacherRunInputDto) =>
        of({ stdin: input.stdin === null ? null : input.stdin + '\n', isRandom: input.isRandom }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [TesztbemenetComponent],
      providers: [{ provide: TeacherRubricService, useValue: serviceMock }],
    });
    const fixture = TestBed.createComponent(TesztbemenetComponent);
    fixture.componentRef.setInput('taskSetId', 1);
    fixture.componentRef.setInput('task', task);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('a billentyűzetes beolvasást nyelvenként felismeri, a fájlbeolvasást nem', () => {
    for (const code of ['n = int(input("Szám: "))', 'var s = Console.ReadLine();', 'Scanner sc = new Scanner(System.in);', 'cin >> n;', 'scanf("%d", &n);', "const rl = require('readline');"])
      expect(readsKeyboardInput(makeTask(code))).toBe(true);
    expect(readsKeyboardInput(makeTask('with open("adat.txt") as f:\n    sor = f.readline()'))).toBe(false);
  });

  it('beolvasó megoldásnál nyitva indul, és betölti a tárolt bemenetet (záró sortörés nélkül)', () => {
    const fixture = create({ stdin: 'Anna\n17\n', isRandom: false });

    expect(serviceMock.getRunInput).toHaveBeenCalledWith(1, 7);
    expect(fixture.componentInstance.stdin()).toBe('Anna\n17');
    expect(q(fixture, 'run-input-stdin')).not.toBeNull();
    expect(q(fixture, 'run-input-summary')!.textContent).toContain('2 sor mentve');
  });

  it('beolvasás és tárolt bemenet nélkül csukva indul; a fejléccel kinyitható', () => {
    const fixture = create({ stdin: null, isRandom: false }, makeTask('print(42)'));

    expect(q(fixture, 'run-input-stdin')).toBeNull();
    q(fixture, 'run-input-toggle')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'run-input-stdin')).not.toBeNull();
  });

  it('beolvasás nélkül is nyitva indul, ha van mentett véletlenszám-jelölés', async () => {
    const fixture = create({ stdin: null, isRandom: true }, makeTask('import random\nprint(random.randint(1, 6))'));
    // Az ngModel a jelölőt aszinkron írja.
    await fixture.whenStable();
    fixture.detectChanges();

    expect((q(fixture, 'run-input-random') as HTMLInputElement).checked).toBe(true);
    expect(q(fixture, 'run-input-summary')!.textContent).toContain('véletlenszámos');
  });

  it('mentéskor elküldi a bemenetet és a jelölést, majd jelez a szülőnek', () => {
    const fixture = create({ stdin: null, isRandom: false });
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    const success = vi.spyOn(TestBed.inject(ToastService), 'success');

    fixture.componentInstance.stdin.set('5\n7');
    fixture.componentInstance.isRandom.set(true);
    q(fixture, 'run-input-save')!.click();
    fixture.detectChanges();

    expect(serviceMock.saveRunInput).toHaveBeenCalledWith(1, 7, { stdin: '5\n7', isRandom: true });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith('Tesztbemenet mentve.');
    expect(fixture.componentInstance.stdin()).toBe('5\n7');
  });

  it('üres bemenetet null-ként küld (a BE ekkor törli a tárolt bemenetet)', () => {
    const fixture = create({ stdin: '5\n', isRandom: false });
    const success = vi.spyOn(TestBed.inject(ToastService), 'success');

    fixture.componentInstance.stdin.set('   ');
    fixture.componentInstance.save();

    expect(serviceMock.saveRunInput).toHaveBeenCalledWith(1, 7, { stdin: null, isRandom: false });
    expect(success).toHaveBeenCalledWith('Tesztbemenet törölve.');
  });

  it('64 KB fölött nem menthető', () => {
    const fixture = create({ stdin: null, isRandom: false });

    fixture.componentInstance.stdin.set('1'.repeat(64 * 1024 + 1));
    fixture.detectChanges();

    expect((q(fixture, 'run-input-save') as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('legfeljebb 64 KB');
    fixture.componentInstance.save();
    expect(serviceMock.saveRunInput).not.toHaveBeenCalled();
  });

  it('mentési hibánál a hibaüzenetet mutatja, és nem jelez a szülőnek', () => {
    const fixture = create({ stdin: null, isRandom: false });
    serviceMock.saveRunInput.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Élő vizsga van a feladaton.' } })));
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    fixture.componentInstance.stdin.set('5');
    fixture.componentInstance.save();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Élő vizsga van a feladaton.');
    expect(saved).not.toHaveBeenCalled();
  });

  it('a feladat újratöltése (új objektum, azonos id) nem írja felül a még nem mentett bemenetet', () => {
    const fixture = create({ stdin: null, isRandom: false });
    fixture.componentInstance.stdin.set('gépelés alatt');

    fixture.componentRef.setInput('task', makeTask('x = input()\nprint(x)', { title: 'F1 módosítva' }));
    fixture.detectChanges();

    expect(serviceMock.getRunInput).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.stdin()).toBe('gépelés alatt');
  });
});
