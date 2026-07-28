import {
  computeTaskWeakness,
  weakestTasks,
  WEAK_THRESHOLD_PERCENT,
} from './task-weakness';
import {
  StudentTaskSetResultRowDto,
  TaskResultCellDto,
  TeacherTaskColumnDto,
  TeacherTaskSetResultsDto,
} from '../../models/report.model';

// 5. fázis: a gyengepont-elemzés értéke a NEVEZŐN áll vagy bukik. Egy be nem
// fejezett vagy ki nem értékelt beadás nullaként bevéve minden feladatot
// mesterségesen gyengének mutatna, és a tanár olyat tanítana újra, amit
// valójában senki nem rontott el.

function makeTask(overrides: Partial<TeacherTaskColumnDto> = {}): TeacherTaskColumnDto {
  return { taskId: 1, title: 'Feladat', maxPoints: 10, taskOrder: 1, ...overrides };
}

function makeCell(overrides: Partial<TaskResultCellDto> = {}): TaskResultCellDto {
  return { taskId: 1, isCompleted: true, earnedPoints: 5, maxPoints: 10, isOverridden: false, ...overrides };
}

function makeStudent(
  cells: TaskResultCellDto[],
  overrides: Partial<StudentTaskSetResultRowDto> = {},
): StudentTaskSetResultRowDto {
  return {
    userId: 1,
    name: 'Teszt Diák',
    hasSession: true,
    isCompleted: true,
    taskResults: cells,
    ...overrides,
  };
}

function makeResults(
  tasks: TeacherTaskColumnDto[],
  students: StudentTaskSetResultRowDto[],
): TeacherTaskSetResultsDto {
  return { taskSetId: 1, title: 'Feladatsor', tasks, students };
}

describe('computeTaskWeakness', () => {
  it('üres adathalmazon null-t ad, nem 0%-ot', () => {
    const task = makeTask();
    expect(computeTaskWeakness(task, makeResults([task], []))).toBeNull();
  });

  it('ha MINDEN beadás befejezetlen, null-t ad — a befejezetlen nem 0 pont', () => {
    const task = makeTask();
    const results = makeResults(
      [task],
      [
        makeStudent([makeCell({ isCompleted: false, earnedPoints: 0 })], { userId: 1 }),
        makeStudent([makeCell({ isCompleted: false, earnedPoints: 2 })], { userId: 2 }),
      ],
    );

    expect(computeTaskWeakness(task, results)).toBeNull();
  });

  it('a befejezetlen beadást kihagyja az átlagból, a befejezettet beveszi', () => {
    const task = makeTask();
    const results = makeResults(
      [task],
      [
        makeStudent([makeCell({ isCompleted: true, earnedPoints: 8 })], { userId: 1 }),
        // Ha ez a 0 pontos, BEFEJEZETLEN beadás beszámítana, az átlag 40% lenne.
        makeStudent([makeCell({ isCompleted: false, earnedPoints: 0 })], { userId: 2 }),
      ],
    );

    const weakness = computeTaskWeakness(task, results)!;
    expect(weakness.averagePercent).toBe(80);
    expect(weakness.evaluatedCount).toBe(1);
  });

  it('a ki nem értékelt (null pontszámú) beadást kihagyja, nem veszi nullának', () => {
    const task = makeTask();
    const results = makeResults(
      [task],
      [
        makeStudent([makeCell({ earnedPoints: 10 })], { userId: 1 }),
        // Az AI nem értékelt (token-limit): ISMERETLEN, nem rossz. Nullaként
        // bevéve az átlag 50% lenne 100% helyett.
        makeStudent([makeCell({ earnedPoints: undefined })], { userId: 2 }),
      ],
    );

    const weakness = computeTaskWeakness(task, results)!;
    expect(weakness.averagePercent).toBe(100);
    expect(weakness.evaluatedCount).toBe(1);
  });

  it('maxPoints = 0 esetén null-t ad, nem NaN-t és nem 0-t', () => {
    const task = makeTask({ maxPoints: 0 });
    const results = makeResults(
      [task],
      [makeStudent([makeCell({ earnedPoints: 0, maxPoints: 0 })])],
    );

    const weakness = computeTaskWeakness(task, results);
    expect(weakness).toBeNull();
    expect(weakness?.averagePercent).not.toBeNaN();
  });

  it('a küszöb alatti beadásokat megszámolja', () => {
    const task = makeTask();
    const results = makeResults(
      [task],
      [
        makeStudent([makeCell({ earnedPoints: 2 })], { userId: 1 }), // 20% — alatta
        makeStudent([makeCell({ earnedPoints: 4 })], { userId: 2 }), // 40% — alatta
        makeStudent([makeCell({ earnedPoints: 9 })], { userId: 3 }), // 90% — felette
      ],
    );

    const weakness = computeTaskWeakness(task, results)!;
    expect(weakness.belowThresholdCount).toBe(2);
    expect(weakness.evaluatedCount).toBe(3);
  });

  it('a küszöböt pontosan elérő beadás NEM számít gyengének', () => {
    const task = makeTask();
    const results = makeResults(
      [task],
      [makeStudent([makeCell({ earnedPoints: WEAK_THRESHOLD_PERCENT / 10 })])],
    );

    expect(computeTaskWeakness(task, results)!.belowThresholdCount).toBe(0);
  });

  it('a cella saját maxPoints-át használja, ha van, egyébként a feladat oszlopáét', () => {
    const task = makeTask({ maxPoints: 10 });
    const results = makeResults(
      [task],
      [makeStudent([makeCell({ earnedPoints: 5, maxPoints: 20 })])],
    );

    // 5/20 = 25%, nem 5/10 = 50%.
    expect(computeTaskWeakness(task, results)!.averagePercent).toBe(25);
  });
});

describe('weakestTasks', () => {
  it('növekvő átlag szerint rendez, a leggyengébb elöl', () => {
    const easy = makeTask({ taskId: 1, taskOrder: 1, title: 'Könnyű' });
    const hard = makeTask({ taskId: 2, taskOrder: 2, title: 'Nehéz' });
    const mid = makeTask({ taskId: 3, taskOrder: 3, title: 'Közepes' });

    const results = makeResults(
      [easy, hard, mid],
      [
        makeStudent([
          makeCell({ taskId: 1, earnedPoints: 9 }),
          makeCell({ taskId: 2, earnedPoints: 2 }),
          makeCell({ taskId: 3, earnedPoints: 5 }),
        ]),
      ],
    );

    expect(weakestTasks(results).map((w) => w.title)).toEqual(['Nehéz', 'Közepes', 'Könnyű']);
  });

  it('legfeljebb a megadott számú feladatot adja vissza', () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => makeTask({ taskId: n, taskOrder: n, title: `F${n}` }));
    const results = makeResults(
      tasks,
      [makeStudent(tasks.map((t) => makeCell({ taskId: t.taskId, earnedPoints: t.taskId })))],
    );

    expect(weakestTasks(results)).toHaveLength(3);
  });

  it('a null adathalmazra üres tömböt ad (a hívó ilyenkor elrejti a blokkot)', () => {
    expect(weakestTasks(null)).toEqual([]);
  });

  it('beadás nélküli feladatsorra üres tömböt ad, nem 0%-os sorokat', () => {
    const tasks = [makeTask({ taskId: 1 }), makeTask({ taskId: 2, taskOrder: 2 })];
    const results = makeResults(tasks, [
      makeStudent([], { hasSession: false, isCompleted: false }),
    ]);

    expect(weakestTasks(results)).toEqual([]);
  });

  it('csak az értékelt feladatokat sorolja fel, a többit kihagyja', () => {
    const scored = makeTask({ taskId: 1, taskOrder: 1, title: 'Értékelt' });
    const unscored = makeTask({ taskId: 2, taskOrder: 2, title: 'Nem értékelt' });

    const results = makeResults(
      [scored, unscored],
      [
        makeStudent([
          makeCell({ taskId: 1, earnedPoints: 3 }),
          makeCell({ taskId: 2, earnedPoints: undefined }),
        ]),
      ],
    );

    expect(weakestTasks(results).map((w) => w.title)).toEqual(['Értékelt']);
  });
});
