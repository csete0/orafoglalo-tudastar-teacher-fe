import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { CsapatReszletekComponent } from './csapat-reszletek.component';
import { TeacherTeamService } from '../../services/team/teacher-team.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ReportService } from '../../services/report/report.service';
import { Team, TeamActivity, TeamMilestone } from '../../models/team.model';

const team: Team = {
  id: 3, name: 'Büfé', kind: 'school', status: 'active', groupId: 7, groupName: '13.T', projectTitle: 'Iskolai büfé', examDate: '2027-05-20',
  members: [{ userId: 1, name: 'Kiss Anna', role: 'backend', joinedAt: '', isFounder: false }],
  repo: { id: 5, name: 't3-c-bufe', cloneUrl: 'x', sizeKb: 100, quotaKb: 51200, locked: false }, viewer: 'teacher', canManage: true, rejectReason: null, createdAt: '',
};
const ms: TeamMilestone = {
  id: 11, kind: 'docs', title: 'Dokumentáció', sortOrder: 5, dueDate: null, effectiveDueDate: null, overdue: false, requiredPaths: ['README*|**/README*'], testPreset: null,
  testDir: null, lastCheck: null, tickedAt: null, tickedByName: null, teacherNote: null, canEdit: true, canTick: true,
};

describe('CsapatReszletekComponent', () => {
  function setup() {
    const api = {
      get: vi.fn(() => of(team)),
      activity: vi.fn((): Observable<TeamActivity> => of({ hasRepo: true, pendingPushes: 0, branches: [], weeks: [], members: [{ userId: 1, name: 'Kiss Anna', active: true, commits: 4, additions: 90, deletions: 10, merges: 0, lastPushAt: null }] })),
      milestones: vi.fn(() => of([ms])), tickMilestone: vi.fn(() => of([{ ...ms, tickedAt: '2027-03-12T10:00:00Z', teacherNote: 'Rendben' }])),
      reviews: vi.fn(() => of({ used: 0, limit: 4, month: '2027-03', items: [] })), requestReview: vi.fn(() => of({ id: 1 })),
      tree: vi.fn(() => of({ ref: 'main', truncated: false, entries: [{ path: 'README.md', type: 'blob', size: 10 }] })),
      file: vi.fn(() => of({ path: 'README.md', content: '# Büfé', binary: false, tooLarge: false })),
      github: vi.fn(() => of({ enabled: true, linked: false, branches: [] })),
    };
    TestBed.configureTestingModule({
      imports: [CsapatReszletekComponent],
      providers: [provideRouter([]), { provide: TeacherTeamService, useValue: api }, { provide: ConfirmService, useValue: { ask: vi.fn().mockResolvedValue(true) } },
        { provide: ReportService, useValue: { getAiHelperQuota: vi.fn(() => of({ repoReview: { used: 2, limit: 40 } })) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '3' }) } } }],
    });
    const fixture = TestBed.createComponent(CsapatReszletekComponent);
    return { fixture, c: fixture.componentInstance, api, el: fixture.nativeElement as HTMLElement };
  }

  it('csapatmunka: tagonként commit és sorok; a pipa megjegyzéssel megy; a fájl a kódolvasóban', async () => {
    const { fixture, c, api, el } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Kiss Anna');
    expect(el.textContent).toContain('+90');
    c.setTab('merfoldkovek');
    await fixture.whenStable();
    c.note.set('Rendben');
    await c.tick(ms, true);
    expect(api.tickMilestone).toHaveBeenCalledWith(3, 11, true, 'Rendben');
    c.setTab('fajlok');
    await fixture.whenStable();
    await c.openFile('README.md');
    expect(c.openFiles()).toEqual({ 'README.md': '# Büfé' });
  });

  it('MI-átnézés a tanár kérésére (a tanári keretből)', async () => {
    const { fixture, c, api } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    c.setTab('mi');
    await fixture.whenStable();
    await c.requestReview();
    expect(api.requestReview).toHaveBeenCalledWith(3, null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('most 2/40');
  });

  it('csapatmunka: a törölt felhasználó és az import külön sor és külön heti kulcs (deleted / import)', async () => {
    const { fixture, api, el } = setup();
    api.activity.mockReturnValue(of({
      hasRepo: true, pendingPushes: 0, branches: [{ name: 'main', sha: 'a' }],
      weeks: [{ weekStart: '2027-03-08', commits: { '1': 2, deleted: 1, import: 3 } }],
      members: [
        { userId: 1, name: 'Kiss Anna', active: true, commits: 2, additions: 5, deletions: 0, merges: 0, lastPushAt: null },
        { userId: null, name: 'Törölt felhasználó', active: false, commits: 1, additions: 1, deletions: 0, merges: 0, lastPushAt: null },
        { userId: null, name: 'Importált (GitHub)', active: false, commits: 3, additions: 9, deletions: 0, merges: 0, lastPushAt: null },
      ],
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="activity-row-deleted"]')?.textContent).toContain('Törölt felhasználó');
    expect(el.querySelector('[data-testid="activity-row-import"]')?.textContent).toContain('Importált (GitHub)');
    expect(el.querySelectorAll('svg rect').length).toBe(3);
  });
});
