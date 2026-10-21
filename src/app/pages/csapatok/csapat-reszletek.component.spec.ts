import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { CsapatReszletekComponent } from './csapat-reszletek.component';
import { TeacherTeamService } from '../../services/team/teacher-team.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ReportService } from '../../services/report/report.service';
import { Team, TeamActivity, TeamMilestone, TeamRepoReview, TeamReviews } from '../../models/team.model';

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
  const review = (over: Partial<TeamRepoReview>): TeamRepoReview => ({
    id: 1, status: 'done', branch: 'main', commitSha: null, requestedByName: null, payerKind: 'teacher', createdAt: '2027-03-12T10:00:00Z', finishedAt: null,
    error: null, counted: true, result: null, ...over,
  });

  afterEach(() => vi.useRealTimers());

  function setup() {
    const api = {
      get: vi.fn(() => of(team)),
      activity: vi.fn((): Observable<TeamActivity> => of({ hasRepo: true, pendingPushes: 0, branches: [], weeks: [], members: [{ userId: 1, name: 'Kiss Anna', active: true, commits: 4, additions: 90, deletions: 10, merges: 0, lastPushAt: null }] })),
      milestones: vi.fn(() => of([ms])), tickMilestone: vi.fn(() => of([{ ...ms, tickedAt: '2027-03-12T10:00:00Z', teacherNote: 'Rendben' }])),
      reviews: vi.fn((): Observable<TeamReviews> => of({ used: 0, limit: 4, month: '2027-03', items: [] })), requestReview: vi.fn(() => of({ id: 1 })),
      tree: vi.fn(() => of({ ref: 'main', truncated: false, entries: [{ path: 'README.md', type: 'blob', size: 10 }] })),
      file: vi.fn(() => of({ path: 'README.md', content: '# Büfé', binary: false, tooLarge: false })),
      github: vi.fn(() => of({ enabled: true, linked: false, branches: [] })),
    };
    const reports = { getAiHelperQuota: vi.fn(() => of({ repoReview: { used: 2, limit: 40 } })) };
    TestBed.configureTestingModule({
      imports: [CsapatReszletekComponent],
      providers: [provideRouter([]), { provide: TeacherTeamService, useValue: api }, { provide: ConfirmService, useValue: { ask: vi.fn().mockResolvedValue(true) } },
        { provide: ReportService, useValue: reports },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '3' }) } } }],
    });
    const fixture = TestBed.createComponent(CsapatReszletekComponent);
    return { fixture, c: fixture.componentInstance, api, reports, el: fixture.nativeElement as HTMLElement };
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
    expect(fixture.nativeElement.textContent.replace(/\s+/g, ' ')).toContain('is fogy (most 2/40); a sikertelen');
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

  it('archivált csapat: nincs szerkesztés, pipa, határidő-mező és MI-kérés', async () => {
    const { fixture, c, api, el } = setup();
    api.get.mockReturnValue(of({ ...team, status: 'archived' }));
    api.milestones.mockReturnValue(of([{ ...ms, canEdit: false, canTick: false }]));
    fixture.detectChanges();
    await fixture.whenStable();
    await c.setTab('merfoldkovek');
    fixture.detectChanges();
    expect(el.textContent).toContain('csak olvashatók');
    expect(el.textContent).not.toContain('Csapatadatok szerkesztése');
    expect(el.querySelector('[data-testid="ms-11"] input')).toBeNull();
    expect(el.textContent).not.toContain('Felvétel');
    expect((Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Gépi ellenőrzés')) as HTMLButtonElement).disabled).toBe(true);
    await c.setTab('mi');
    fixture.detectChanges();
    expect(el.textContent).not.toContain('MI-átnézés kérése');
  });

  it('sikertelen pipa: hibaüzenet, és a mérföldkövek a szerverről újratöltődnek', async () => {
    const { fixture, c, api } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    await c.setTab('merfoldkovek');
    api.tickMilestone.mockReturnValue(throwError(() => ({ error: { message: 'A csapat archivált.' } })));
    c.note.set('Rendben');
    await c.tick(ms, true);
    expect(api.milestones).toHaveBeenCalledTimes(2);
    expect(c.error()).toBeTruthy();
    expect(c.note()).toBe('Rendben'); // a megjegyzés nem vész el
  });

  it('futó átnézés: 5 mp-enként legfeljebb 36-szor frissül, utána kézi frissítés; másik fülön leáll; a végén a keret újratöltődik', async () => {
    vi.useFakeTimers();
    const { fixture, c, api, reports } = setup();
    api.reviews.mockReturnValue(of({ used: 1, limit: 4, month: '2027-03', items: [review({ status: 'running' })] }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    await c.setTab('mi');
    await vi.advanceTimersByTimeAsync(5000 * 40);
    expect(api.reviews).toHaveBeenCalledTimes(37);
    expect(c.stalled()).toBe(true);

    await c.refreshReviews();
    await c.setTab('munka');
    const calls = api.reviews.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000 * 5);
    expect(api.reviews).toHaveBeenCalledTimes(calls);

    await c.setTab('mi'); // visszatérve újra frissít
    const quotaCalls = reports.getAiHelperQuota.mock.calls.length;
    api.reviews.mockReturnValue(of({ used: 2, limit: 4, month: '2027-03', items: [review({ status: 'failed', counted: false })] }));
    reports.getAiHelperQuota.mockReturnValue(of({ repoReview: { used: 40, limit: 40 } }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(reports.getAiHelperQuota).toHaveBeenCalledTimes(quotaCalls + 1); // a lefutott átnézés után a keret újratöltődik
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="review-1"]')?.textContent).toContain('nem számít bele a keretbe');
    expect(el.querySelector('[data-testid="quota-full"]')).toBeTruthy();
    expect((Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('MI-átnézés kérése')) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a csoportra mutató vissza-link a csoportoldal Technikum fülének Csapatok szakaszára visz', async () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const back = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('13.T'))!;
    expect(back.getAttribute('href')).toBe('/csoportok/7?tab=technikum#csapatok');
  });
});
