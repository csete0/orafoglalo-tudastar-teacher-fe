import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SzobeliTemakListaComponent } from './szobeli-temak-lista.component';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { GroupStore } from '../../services/group/group.store';
import { TeacherOralAssignmentDto, TeacherOralTopicListItemDto } from '../../models/teacher-oral-exam.model';

const TOPICS: TeacherOralTopicListItemDto[] = [
  { id: 3, title: 'A fotoszintézis', status: 'approved', itemCount: 5, assignmentCount: 2, createdAt: '2026-10-20T10:00:00' },
  { id: 4, title: 'Sejtlégzés', status: 'draft', itemCount: 4, assignmentCount: 0, createdAt: '2026-10-21T10:00:00' },
];
const ASSIGNMENT: TeacherOralAssignmentDto = {
  id: 9, topicId: 3, profileSlug: null, title: 'A fotoszintézis', groupId: 1, groupName: '9.A', mode: 'exam', voiceMinutes: 10,
  opensAt: null, dueAt: null, createdAt: '2026-10-22T08:00:00', revokedAt: null, resultsPublishedAt: null, studentCount: 1,
};

describe('SzobeliTemakListaComponent', () => {
  function setup(topics: unknown = of(TOPICS)) {
    const api = {
      available: signal(true),
      topics: vi.fn(() => topics),
      profiles: vi.fn(() => of([{ slug: 'digkult-kozep', title: 'Digitális kultúra – középszint', voiceMinuteOptions: [10, 15], defaultVoiceMinutes: 15 }])),
      assignments: vi.fn(() => of([ASSIGNMENT])),
      quota: vi.fn(() => of({ oralExam: { used: 0, limit: 15 } })),
    };
    TestBed.configureTestingModule({
      imports: [SzobeliTemakListaComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherOralExamService, useValue: api },
        { provide: GroupStore, useValue: { loadMine: vi.fn(), activeGroups: signal([{ id: 1, name: '9.A' }]) } },
      ],
    });
    const fixture = TestBed.createComponent(SzobeliTemakListaComponent);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a témák állapot-jelvénnyel, tételszámmal és kiadásszámmal; a téma a szerkesztőbe visz', () => {
    const { el } = setup();
    const topics = el.querySelector('[data-testid="oral-topics"]')!;
    expect(topics.textContent).toContain('A fotoszintézis');
    expect(topics.textContent).toContain('5 tétel · 2 kiadás');
    expect(topics.textContent).toContain('Jóváhagyva');
    expect(topics.textContent).toContain('Vázlat');
    expect(topics.querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/szobeli/3');
    expect(el.querySelector('[data-testid="oral-new"]')!.getAttribute('href')).toBe('/feladatsorok/szobeli/uj');
  });

  it('a kiadások az eredményoldalra visznek; a kész szóbeli kiadása megnyitja a párbeszédablakot, a kiadás a lista elejére kerül', () => {
    const { fixture, c, el } = setup();
    const assignments = el.querySelector('[data-testid="oral-assignments"]')!;
    expect(assignments.textContent).toContain('Szóbeli dolgozat');
    expect(assignments.querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/szobeli/kiadas/9');

    (el.querySelector('[data-testid="oral-profiles"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(c.assignTarget()).toEqual({
      topicId: null, profileSlug: 'digkult-kozep', title: 'Digitális kultúra – középszint', voiceMinuteOptions: [10, 15], defaultVoiceMinutes: 15,
    });
    expect(el.querySelector('[data-testid="oral-assign-dialog"]')).not.toBeNull();

    c.onAssigned({ ...ASSIGNMENT, id: 10, profileSlug: 'digkult-kozep', topicId: null });
    fixture.detectChanges();
    expect(c.assignTarget()).toBeNull();
    expect(c.assignments().map((a) => a.id)).toEqual([10, 9]);
  });

  it('üres lista: tájékoztató; hiba: hibaüzenet üres-állapot nélkül; kikapcsolt funkció: csak a tájékoztatás', () => {
    expect(setup(of([])).el.textContent).toContain('Még nincs szóbeli témád.');

    TestBed.resetTestingModule();
    const failing = setup(throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(failing.el.querySelector('[data-testid="oral-error"]')!.textContent).toContain('sikertelen');
    expect(failing.el.textContent).not.toContain('Még nincs szóbeli témád.');

    TestBed.resetTestingModule();
    const disabled = setup(throwError(() => new HttpErrorResponse({ status: 404, error: { errorType: 'FeatureDisabled' } })));
    expect(disabled.el.querySelector('[data-testid="oral-disabled"]')).not.toBeNull();
    expect(disabled.el.querySelector('[data-testid="oral-new"]')).toBeNull();
  });
});
