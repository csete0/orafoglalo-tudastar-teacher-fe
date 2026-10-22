import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { CsapatReszletekComponent } from './csapat-reszletek.component';
import { TeacherTeamService } from '../../services/team/teacher-team.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ReportService } from '../../services/report/report.service';
import { Team, TeamActivity, TeamMilestone, TeamRepoReview, TeamReviews, TestRunnerOption } from '../../models/team.model';

const team: Team = {
  id: 3, name: 'Büfé', kind: 'school', status: 'active', groupId: 7, groupName: '13.T', projectTitle: 'Iskolai büfé', examDate: '2027-05-20',
  members: [{ userId: 1, name: 'Kiss Anna', role: 'backend', joinedAt: '', isFounder: false }],
  repo: { id: 5, name: 't3-c-bufe', cloneUrl: 'x', sizeKb: 100, quotaKb: 51200, locked: false }, viewer: 'teacher', canManage: true, rejectReason: null, createdAt: '',
};
const ms: TeamMilestone = {
  id: 11, kind: 'docs', title: 'Dokumentáció', sortOrder: 5, dueDate: null, effectiveDueDate: null, overdue: false, requiredPaths: ['README*|**/README*'], testPreset: null,
  testDir: null, lastCheck: null, tickedAt: null, tickedByName: null, teacherNote: null, canEdit: true, canTick: true,
};

const RUNNERS: TestRunnerOption[] = [
  { key: 'python-unittest', label: 'Python unittest', language: 'Python', available: true },
  { key: 'node-test', label: 'Node.js (node --test)', language: 'JavaScript', available: true },
  { key: 'nunit', label: 'NUnit (C#, NUnitLite)', language: 'C#', available: true },
  { key: 'junit', label: 'JUnit 5 (Java)', language: 'Java', available: false },
];

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
      testRunners: vi.fn(() => of(RUNNERS)), updateMilestone: vi.fn(() => of([ms])),
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

  it('MI-átnézés: a dokumentáció 7 kötelező eleme ✔/✘ megjegyzéssel; a régi (lista nélküli) eredmény hibátlanul', async () => {
    const { fixture, c, api, el } = setup();
    const result = { summary: 'Jó.', criteria: [{ key: 'docs' as const, label: 'Dokumentáció', score: 2, text: 'Hiányos.' }], suggestions: [], reviewedPaths: ['README.md'],
      truncatedPaths: [], skippedFiles: 0 };
    api.reviews.mockReturnValue(of({ used: 1, limit: 4, month: '2027-03', items: [
      review({ result: { ...result, docsChecklist: [{ key: 'cel', label: 'A projekt célja', present: true, note: 'Világos.' },
        { key: 'dump', label: 'Adatbázis-dump', present: false, note: 'Nincs .sql.' }] } }),
      review({ id: 2, result }),
    ] }));
    fixture.detectChanges();
    await fixture.whenStable();
    await c.setTab('mi');
    fixture.detectChanges();
    const rows = Array.from(el.querySelectorAll('[data-testid="review-1"] [data-testid="review-docs"] li'));
    expect(rows.map((r) => r.querySelector('span')?.className)).toEqual(['text-success', 'text-danger']);
    expect(rows[0].textContent).toContain('✔ A projekt célja – megvan');
    expect(rows[1].textContent).toContain('✘ Adatbázis-dump – hiányzik');
    expect(rows[1].textContent).toContain('Nincs .sql.');
    expect(el.querySelector('[data-testid="review-2"]')?.textContent).toContain('Dokumentáció: 2/5');
    expect(el.querySelector('[data-testid="review-2"] [data-testid="review-docs"]')).toBeNull();
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

  it('tesztfuttató-legördülő a szerver listájából: a nem elérhető tiltva „(hamarosan)”, mentés a választott presettel; súgó presetenként', async () => {
    const { fixture, c, api, el } = setup();
    api.milestones.mockReturnValue(of([{ ...ms, kind: 'tests', testPreset: 'junit', testDir: 'backend' }]));
    fixture.detectChanges();
    await fixture.whenStable();
    await c.setTab('merfoldkovek');
    fixture.detectChanges();
    const select = el.querySelector('[data-testid="ms-11"] select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => [o.value, o.textContent?.trim(), o.disabled])).toEqual([
      ['', 'nincs (csak a fájlok megléte)', false],
      ['python-unittest', 'Python unittest', false],
      ['node-test', 'Node.js (node --test)', false],
      ['nunit', 'NUnit (C#, NUnitLite)', false],
      ['junit', 'JUnit 5 (Java) (hamarosan)', true],
    ]);
    expect(select.value).toBe('junit');
    expect(el.querySelector('[data-testid="test-help"]')?.textContent).toContain('a Maven/Gradle modul gyökere');
    select.value = 'nunit';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(api.updateMilestone).toHaveBeenCalledWith(3, 11, { testPreset: 'nunit', testDir: 'backend' });
    expect(c.testHelp('nunit')).toContain('a tesztprojekt mappája, pl. backend/Api.Tests');
    await c.setTab('merfoldkovek');
    expect(api.testRunners).toHaveBeenCalledTimes(1); // a lista egyszer töltődik
  });

  it('docs mérföldkő: a dokumentáció 7 eleme ✔/~/✘ a fájllal és a tippel; a régi (docs nélküli) ellenőrzés hibátlanul', async () => {
    const { fixture, c, api, el } = setup();
    const check = { at: '2027-03-12T10:00:00Z', branch: 'main', truncated: false, items: [{ pattern: 'README*|**/README*', matched: true, example: 'README.md' }],
      allMatched: true, test: null };
    const docs = {
      at: '2027-03-12T10:00:00Z', sources: ['README.md'], warnings: ['docs/leiras.pdf: kimaradt (túl nagy fájl).'],
      items: [
        { key: 'cel', label: 'A projekt célja', status: 'found' as const, where: 'README.md', hint: '' },
        { key: 'db-diagram', label: 'Adatbázis-diagram', status: 'mentioned' as const, where: 'README.md', hint: 'Tedd fel a képet.' },
        { key: 'dump', label: 'Adatbázis-dump', status: 'missing' as const, where: null, hint: 'Tedd a tárolóba a dumpot.' },
      ],
    };
    api.milestones.mockReturnValue(of([{ ...ms, lastCheck: { ...check, docs } }, { ...ms, id: 12, kind: 'db', lastCheck: check }]));
    fixture.detectChanges();
    await fixture.whenStable();
    await c.setTab('merfoldkovek');
    fixture.detectChanges();
    const rows = Array.from(el.querySelectorAll('[data-testid="ms-11"] [data-testid="docs-check"] li'));
    expect(rows.map((r) => r.querySelector('span')?.className)).toEqual(['text-success', 'text-warning', 'text-danger']);
    expect(rows[0].textContent).toContain('✔ A projekt célja – megvan (README.md)');
    expect(rows[1].textContent).toContain('~ Adatbázis-diagram – csak említve (README.md)');
    expect(rows[1].textContent).toContain('Tedd fel a képet.');
    expect(rows[2].textContent).toContain('✘ Adatbázis-dump – hiányzik');
    const row = el.querySelector('[data-testid="ms-11"]')?.textContent ?? '';
    expect(row).toContain('Átnézett dokumentumok: README.md');
    expect(row).toContain('docs/leiras.pdf: kimaradt (túl nagy fájl).');
    expect(el.querySelector('[data-testid="ms-12"] [data-testid="docs-check"]')).toBeNull();
    expect(el.querySelector('[data-testid="ms-12"]')?.textContent).toContain('README*|**/README* – megvan (README.md)');
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
