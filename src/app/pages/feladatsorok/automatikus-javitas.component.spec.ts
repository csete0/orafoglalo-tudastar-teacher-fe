import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AutomatikusJavitasComponent } from './automatikus-javitas.component';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { GradingQualityDto, TeacherTaskDto } from '../../models/teacher-content.model';

function makeTask(overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto {
  return {
    id: 7,
    title: 'F1',
    description: 'd',
    maxPoints: 10,
    taskOrder: 1,
    taskTypeIds: [6],
    subTasks: [],
    completeSolutionSnippets: [],
    ...overrides,
  };
}

function makeQuality(overrides: Partial<GradingQualityDto> = {}): GradingQualityDto {
  return {
    kind: 'code',
    level: 'green',
    checks: [{ key: 'reference', ok: true, label: 'Van teljes referencia-megoldás', hint: null }],
    rubric: { status: 'approved', itemCount: 3, machineCount: 0 },
    ...overrides,
  };
}

describe('AutomatikusJavitasComponent', () => {
  let rubricServiceMock: { getGradingQuality: ReturnType<typeof vi.fn> };

  function create(quality: GradingQualityDto | Error, task = makeTask()) {
    rubricServiceMock = {
      getGradingQuality: vi.fn(() => (quality instanceof Error ? throwError(() => ({ error: { errorMessage: quality.message } })) : of(quality))),
    };
    TestBed.configureTestingModule({
      imports: [AutomatikusJavitasComponent],
      providers: [{ provide: TeacherRubricService, useValue: rubricServiceMock }],
    });
    const fixture = TestBed.createComponent(AutomatikusJavitasComponent);
    fixture.componentRef.setInput('taskSetId', 1);
    fixture.componentRef.setInput('task', task);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('zöld állapotnál „Pontos automatikus javítás”, a feltétel pipával', () => {
    const fixture = create(makeQuality());

    expect(rubricServiceMock.getGradingQuality).toHaveBeenCalledWith(1, 7);
    const level = fixture.nativeElement.querySelector('[data-testid="auto-grading-level"]');
    expect(level.getAttribute('data-level')).toBe('green');
    expect(text(fixture)).toContain('Pontos automatikus javítás');
    const check = fixture.nativeElement.querySelector('[data-testid="auto-grading-check"]');
    expect(check.getAttribute('data-ok')).toBe('true');
  });

  it('sárga állapotnál szempontlista-készítésre biztat, a hiányzó feltétel teendőjét kiírja', () => {
    const fixture = create(
      makeQuality({
        level: 'yellow',
        checks: [
          { key: 'reference', ok: true, label: 'Van teljes referencia-megoldás' },
          { key: 'rubric', ok: false, label: 'Nincs jóváhagyott szempontlista', hint: 'Készíts szempontlistát a feladathoz.' },
        ],
      }),
    );

    expect(text(fixture)).toContain('Működik, de pontatlanabb – készíts szempontlistát');
    expect(text(fixture)).toContain('Készíts szempontlistát a feladathoz.');
  });

  it('irodai feladatnál megoldásfájl nélkül a saját megoldás feltöltését kéri (a backend hint-jétől függetlenül)', () => {
    const fixture = create(
      makeQuality({
        kind: 'office',
        level: 'red',
        checks: [{ key: 'solutionFile', ok: false, label: 'Nincs megoldásfájl', hint: 'x' }],
        rubric: { status: 'none', itemCount: 0, machineCount: 0 },
      }),
    );

    expect(text(fixture)).toContain('Nem lesz automatikus javítás');
    expect(text(fixture)).toContain('Töltsd fel a saját megoldásodat – ebből készül a szempontlista.');
  });

  it('a feladat változásakor (újratöltött feladatsor) újra lekéri az állapotot', () => {
    const fixture = create(makeQuality());
    fixture.componentRef.setInput('task', makeTask({ title: 'F1 módosítva' }));
    fixture.detectChanges();

    expect(rubricServiceMock.getGradingQuality).toHaveBeenCalledTimes(2);
  });

  it('lekérési hibánál a hibaüzenetet mutatja', () => {
    const fixture = create(new Error('Nem található feladat.'));
    expect(text(fixture)).toContain('Nem található feladat.');
  });
});
