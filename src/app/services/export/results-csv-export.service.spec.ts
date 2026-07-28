import { TestBed } from '@angular/core/testing';
import { ResultsCsvExportService } from './results-csv-export.service';
import { TeacherTaskSetResultsDto } from '../../models/report.model';

function makeResults(overrides: Partial<TeacherTaskSetResultsDto> = {}): TeacherTaskSetResultsDto {
  return {
    taskSetId: 1,
    title: 'Teszt feladatsor',
    tasks: [
      { taskId: 1, title: 'Első feladat', maxPoints: 10, taskOrder: 1 },
      { taskId: 2, title: 'Második feladat', maxPoints: 10, taskOrder: 2 },
    ],
    students: [
      {
        userId: 1,
        name: 'Kiss Anna',
        hasSession: true,
        isCompleted: true,
        totalEarnedPoints: 15,
        totalMaxPoints: 20,
        taskResults: [
          { taskId: 1, attemptId: 101, isCompleted: true, earnedPoints: 10, maxPoints: 10, isOverridden: false },
          { taskId: 2, attemptId: 102, isCompleted: true, earnedPoints: 5, maxPoints: 10, isOverridden: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ResultsCsvExportService', () => {
  let service: ResultsCsvExportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ResultsCsvExportService);
  });

  it('a kimenet UTF-8 BOM-mal kezdődik (enélkül az Excel elrontja az ő/ű betűket)', () => {
    const csv = service.buildCsv(makeResults());

    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('a magyar ékezetes karakterek épségben maradnak', () => {
    const csv = service.buildCsv(makeResults());

    expect(csv).toContain('Első feladat');
    expect(csv).toContain('Második feladat');
  });

  it('képlettel kezdődő diáknév aposztróffal előzve kerül a kimenetbe (formula-injection)', () => {
    const results = makeResults();
    results.students[0].name = '=SUM(A1)';

    const csv = service.buildCsv(results);

    expect(csv).toContain("'=SUM(A1)");
    // A nyers, aposztróf nélküli forma nem szerepelhet cella-kezdetként.
    expect(csv).not.toMatch(/(^|;|\n)=SUM\(A1\)/);
  });

  it('a +, - és @ kezdetű értékek is aposztróffal védettek', () => {
    for (const dangerous of ['+1+1', '-2-2', '@SUM(A1)']) {
      const results = makeResults();
      results.students[0].name = dangerous;

      const csv = service.buildCsv(results);

      expect(csv).toContain(`'${dangerous}`);
    }
  });

  it('a pontosvesszőt, idézőjelet vagy újsort tartalmazó név helyesen escape-elve kerül ki', () => {
    const results = makeResults();
    results.students[0].name = 'Kiss; Anna "A" \n második sor';

    const csv = service.buildCsv(results);

    // Idézőjelbe zárva, a belső idézőjelek duplázva.
    expect(csv).toContain('"Kiss; Anna ""A"" \n második sor"');
  });

  it('a hiányzó (null) pontszám nem 0-ként, hanem – jelként jelenik meg', () => {
    const results = makeResults();
    results.students[0].taskResults[0].earnedPoints = undefined;

    const csv = service.buildCsv(results);
    const studentLine = csv.split('\r\n')[1];

    expect(studentLine).toContain('–/10');
    expect(studentLine).not.toContain('0/10');
  });

  it('a felülbírált cella * jelölést kap, a nem felülbírált nem', () => {
    const csv = service.buildCsv(makeResults());
    const studentLine = csv.split('\r\n')[1];

    // 1. feladat: nem felülbírált → 10/10, 2. feladat: felülbírált → 5/10*
    expect(studentLine).toContain('10/10');
    expect(studentLine).toContain('5/10*');
  });

  it('a fejléc a feladatokat sorrendben, maximummal együtt tartalmazza', () => {
    const csv = service.buildCsv(makeResults());
    const header = csv.split('\r\n')[0];

    expect(header).toBe('﻿Diák;Összesen;Százalék;1. Első feladat (max 10);2. Második feladat (max 10)');
  });

  it('a százalék magyar tizedesvesszővel jelenik meg', () => {
    const csv = service.buildCsv(makeResults());
    const studentLine = csv.split('\r\n')[1];

    // 15/20 = 75%
    expect(studentLine).toContain('75');
    expect(studentLine).not.toContain('75.0');
  });

  it('a tizedes százalék vesszőt használ, nem pontot', () => {
    const results = makeResults();
    results.students[0].totalEarnedPoints = 1;
    results.students[0].totalMaxPoints = 3;

    const csv = service.buildCsv(results);

    expect(csv).toContain('33,3');
    expect(csv).not.toContain('33.3');
  });

  it('a feladatsort el nem kezdő diák sora nem hazudik 0 pontot', () => {
    const results = makeResults();
    results.students[0].hasSession = false;
    results.students[0].totalEarnedPoints = undefined;
    results.students[0].totalMaxPoints = undefined;
    results.students[0].taskResults = [
      { taskId: 1, isCompleted: false, isOverridden: false },
      { taskId: 2, isCompleted: false, isOverridden: false },
    ];

    const csv = service.buildCsv(results);
    const studentLine = csv.split('\r\n')[1];

    expect(studentLine).toContain('nem kezdte el');
    expect(studentLine).not.toContain('0');
  });

  it('a még folyamatban lévő diák nem exportálódik 0 pontként', () => {
    const results = makeResults();
    results.students[0].isCompleted = false;
    // A backend a már megkísérelt feladatokból összegez — ez egy FÉLKÉSZ részeredmény.
    results.students[0].totalEarnedPoints = 2;
    results.students[0].totalMaxPoints = 20;

    const csv = service.buildCsv(results);
    const cells = csv.split('\r\n')[1].split(';');

    expect(cells[1]).toBe('folyamatban');
    expect(cells[2]).toBe('–');
    // A félrevezető részösszeg és a belőle számolt százalék nem kerülhet ki.
    expect(cells[1]).not.toContain('2 / 20');
    expect(cells[2]).not.toBe('10');
  });

  it('a folyamatban lévő diák részeredménye a feladat-oszlopokban megmarad', () => {
    const results = makeResults();
    results.students[0].isCompleted = false;
    results.students[0].taskResults = [
      { taskId: 1, attemptId: 101, isCompleted: true, earnedPoints: 2, maxPoints: 10, isOverridden: false },
      { taskId: 2, isCompleted: false, isOverridden: false },
    ];

    const cells = service.buildCsv(results).split('\r\n')[1].split(';');

    // Csak az összesítőt hallgatjuk el, a cellánkénti valóságot nem.
    expect(cells[3]).toBe('2/10');
    expect(cells[4]).toBe('–');
  });

  it('a befejezett, de 0 pontot elért diák VALÓDI 0-t kap, nem "folyamatban"-t', () => {
    const results = makeResults();
    results.students[0].isCompleted = true;
    results.students[0].totalEarnedPoints = 0;
    results.students[0].totalMaxPoints = 20;

    const cells = service.buildCsv(results).split('\r\n')[1].split(';');

    // Ez a lényeg: a "nem tudjuk még" és a "tényleg nullát ért el" két külön állapot.
    expect(cells[1]).toBe('0 / 20');
    expect(cells[2]).toBe('0');
    expect(cells[1]).not.toContain('folyamatban');
  });

  it('az oszlopok a fejléc sorrendjét követik akkor is, ha a taskResults sorrendje eltér', () => {
    const results = makeResults();
    // Fordított sorrendű cellák — az exportnak taskId szerint kell párosítania.
    results.students[0].taskResults = [
      { taskId: 2, attemptId: 102, isCompleted: true, earnedPoints: 5, maxPoints: 10, isOverridden: false },
      { taskId: 1, attemptId: 101, isCompleted: true, earnedPoints: 10, maxPoints: 10, isOverridden: false },
    ];

    const csv = service.buildCsv(results);
    const cells = csv.split('\r\n')[1].split(';');

    // …;Százalék-oszlop után: 1. feladat, majd 2. feladat
    expect(cells[3]).toBe('10/10');
    expect(cells[4]).toBe('5/10');
  });
});
