import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NEVER, of, throwError } from 'rxjs';
import { CsoportReszletekComponent } from './csoport-reszletek.component';
import { LEGACY_TAB, resolveCsoportTab } from './fulek/csoport-fulek';
import { GroupStore } from '../../services/group/group.store';
import { GroupSeatStore } from '../../services/group/group-seat.store';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { ReportService } from '../../services/report/report.service';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { MockExamService } from '../../services/mock-exam/mock-exam.service';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { TeacherTeamService } from '../../services/team/teacher-team.service';
import { GroupService } from '../../services/group/group.service';
import { GroupDto } from '../../models/group.model';

function makeGroup(overrides: Partial<GroupDto> = {}): GroupDto {
  return {
    id: 1,
    name: 'Teszt Csoport',
    inviteCode: 'ABCD1234',
    isJoinEnabled: true,
    isArchived: false,
    memberCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const featureDisabled = () => throwError(() => new HttpErrorResponse({ status: 404, error: { errorType: 'FeatureDisabled' } }));

describe('resolveCsoportTab', () => {
  it('a 6 új fül értéke változatlan, hiányzó/ismeretlen érték → Áttekintés', () => {
    for (const tab of ['attekintes', 'diakok', 'kiadasok', 'eredmenyek', 'technikum', 'beallitasok']) {
      expect(resolveCsoportTab(tab)).toEqual({ tab });
    }
    expect(resolveCsoportTab(undefined)).toEqual({ tab: 'attekintes' });
    expect(resolveCsoportTab('')).toEqual({ tab: 'attekintes' });
    expect(resolveCsoportTab('nincs-ilyen')).toEqual({ tab: 'attekintes' });
    expect(resolveCsoportTab('toString')).toEqual({ tab: 'attekintes' });
  });

  it('a 9 fülös oldal minden régi értéke az új helyére mutat', () => {
    expect(LEGACY_TAB).toEqual({
      tagok: { tab: 'diakok' },
      kiadva: { tab: 'kiadasok' },
      helyek: { tab: 'beallitasok', section: 'helyek' },
      meghivo: { tab: 'beallitasok', section: 'meghivo' },
      ranglista: { tab: 'eredmenyek', section: 'ranglista' },
      'gyenge-temak': { tab: 'eredmenyek', section: 'gyenge-temak' },
      'vizsgaresz-terkep': { tab: 'technikum' },
      csapatok: { tab: 'technikum', section: 'csapatok' },
    });
  });
});

describe('CsoportReszletekComponent', () => {
  let groupStoreMock: {
    selectedGroup: ReturnType<typeof signal<GroupDto | null>>;
    groups: ReturnType<typeof signal<GroupDto[]>>;
    members: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    [fn: string]: unknown;
  };
  let reportStoreMock: { groupActivity: ReturnType<typeof signal<unknown[]>>; error: ReturnType<typeof signal<string | null>>; loadGroupActivity: ReturnType<typeof vi.fn> };
  let technikumMock: { me: ReturnType<typeof vi.fn>; heatmap: ReturnType<typeof vi.fn> };
  let teamMock: { forGroup: ReturnType<typeof vi.fn> };
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];
  });

  function configure(group: GroupDto = makeGroup(), opts: { technikum?: { visible: boolean; hasPremium: boolean } | 'disabled'; teams?: 'disabled' } = {}) {
    groupStoreMock = {
      selectedGroup: signal(group),
      groups: signal([group]),
      members: signal([]),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(), select: vi.fn(), loadMembers: vi.fn(), removeMember: vi.fn(), archive: vi.fn(), unarchive: vi.fn(),
      update: vi.fn(), regenerateInvite: vi.fn(), setJoinEnabled: vi.fn(), clearError: vi.fn(),
    };
    reportStoreMock = { groupActivity: signal([]), error: signal(null), loadGroupActivity: vi.fn() };
    const technikum = opts.technikum ?? { visible: false, hasPremium: false };
    technikumMock = {
      me: vi.fn(() => (technikum === 'disabled' ? featureDisabled() : of(technikum))),
      heatmap: vi.fn(() => NEVER),
    };
    teamMock = { forGroup: vi.fn(() => (opts.teams === 'disabled' ? featureDisabled() : of([]))) };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'csoportok/:id', component: CsoportReszletekComponent }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GroupStore, useValue: groupStoreMock },
        { provide: SchoolStore, useValue: { schools: signal([]), error: signal(null), loadMine: vi.fn() } },
        { provide: ReportStore, useValue: reportStoreMock },
        { provide: ReportService, useValue: { getGroupWeakTopics: vi.fn(() => of([])) } },
        { provide: LeaderboardStore, useValue: { leaderboard: signal(null), error: signal(null), loadGroupLeaderboard: vi.fn() } },
        { provide: GroupSeatStore, useValue: { overview: signal(null), lastReleaseResult: signal(null), loading: signal(false), error: signal(null), load: vi.fn() } },
        { provide: MockExamService, useValue: { getCurrent: vi.fn(() => of(null)) } },
        { provide: TeacherTechnikumService, useValue: technikumMock },
        { provide: TeacherQuizService, useValue: { getGroupAssignments: vi.fn(() => of([])) } },
        { provide: TeacherTaskSetService, useValue: { getGroupTaskSetAssignments: vi.fn(() => of([])) } },
        { provide: TeacherProjectService, useValue: { forGroup: vi.fn(() => of([])) } },
        { provide: TeacherTeamService, useValue: teamMock },
        { provide: GroupService, useValue: { getMembers: vi.fn(() => of([])) } },
      ],
    });
  }

  async function open(url = '/csoportok/1') {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(url, CsoportReszletekComponent);
    await settle(harness);
    const el = harness.routeNativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const tabButtons = () => [...el.querySelectorAll('[role="tablist"] button')] as HTMLButtonElement[];
    const labels = () => tabButtons().map((b) => b.textContent?.trim());
    const tabByLabel = (label: string) => tabButtons().find((b) => b.textContent?.trim() === label)!;
    return { harness, component, el, router, tabButtons, labels, tabByLabel, settle: () => settle(harness) };
  }

  async function settle(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      harness.detectChanges();
      await harness.fixture.whenStable();
    }
  }

  it('6 fül, alapból az Áttekintés aktív; a fülsáv role="tablist"/"tab" + aria-selected (UI-TT-179)', async () => {
    configure();
    const { el, tabButtons, labels, tabByLabel } = await open();

    expect(labels()).toEqual(['Áttekintés', 'Diákok', 'Kiadások', 'Eredmények', 'Technikum', 'Beállítások']);
    expect(el.querySelector('[role="tablist"]')).not.toBeNull();
    tabButtons().forEach((b) => expect(b.getAttribute('role')).toBe('tab'));
    expect(tabByLabel('Áttekintés').getAttribute('aria-selected')).toBe('true');
    expect(tabButtons().filter((b) => b.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(el.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('csoport-tab-attekintes');
    expect(el.querySelector('app-csoport-attekintes')).not.toBeNull();
  });

  it('fülre kattintva a ?tab= query-paraméter íródik (replaceUrl), a fül-komponens megjelenik, a store-hiba törlődik (UI-TT-67)', async () => {
    configure();
    const { el, router, tabByLabel, settle } = await open();
    const navigate = vi.spyOn(router, 'navigate');

    tabByLabel('Eredmények').click();
    await settle();

    expect(router.url).toBe('/csoportok/1?tab=eredmenyek');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { tab: 'eredmenyek' }, replaceUrl: true }));
    expect(tabByLabel('Eredmények').getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('app-csoport-eredmenyek')).not.toBeNull();
    expect(groupStoreMock['clearError']).toHaveBeenCalled();
  });

  it('?tab= deep-link a megfelelő fület nyitja', async () => {
    configure();
    const { el, tabByLabel } = await open('/csoportok/1?tab=beallitasok');
    expect(tabByLabel('Beállítások').getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('app-csoport-beallitasok')).not.toBeNull();
  });

  it.each(Object.entries(LEGACY_TAB))('régi ?tab=%s → az új fülre íródik át (szakasz-horgonnyal)', async (legacy, target) => {
    configure(makeGroup(), { technikum: { visible: true, hasPremium: true } });
    const { router, tabByLabel, labels } = await open(`/csoportok/1?tab=${legacy}`);

    const expectedUrl = `/csoportok/1?tab=${target.tab}${target.section ? '#' + target.section : ''}`;
    expect(router.url).toBe(expectedUrl);
    const label = { diakok: 'Diákok', kiadasok: 'Kiadások', eredmenyek: 'Eredmények', technikum: 'Technikum', beallitasok: 'Beállítások' }[target.tab as string]!;
    expect(labels()).toContain(label);
    expect(tabByLabel(label).getAttribute('aria-selected')).toBe('true');
    if (target.section) expect(scrollIntoView).toHaveBeenCalled();
  });

  it('ismeretlen ?tab= érték → Áttekintés', async () => {
    configure();
    const { router, tabByLabel } = await open('/csoportok/1?tab=nincs-ilyen');
    expect(router.url).toBe('/csoportok/1?tab=attekintes');
    expect(tabByLabel('Áttekintés').getAttribute('aria-selected')).toBe('true');
  });

  it('Technikum fül: prémium + modulnál a térkép és a csapatok is látszik; prémium nélkül csak a csapatok', async () => {
    configure(makeGroup(), { technikum: { visible: true, hasPremium: true } });
    let { el } = await open('/csoportok/1?tab=technikum');
    expect(el.querySelector('app-vizsgaresz-terkep')).not.toBeNull();
    expect(el.querySelector('app-csoport-csapatok')).not.toBeNull();

    TestBed.resetTestingModule();
    // A diák-menü miatt a visible prémium nélkül is igaz - a tanári térképhez a hasPremium kell.
    configure(makeGroup(), { technikum: { visible: true, hasPremium: false } });
    ({ el } = await open('/csoportok/1?tab=technikum'));
    expect(el.querySelector('app-vizsgaresz-terkep')).toBeNull();
    expect(el.querySelector('app-csoport-csapatok')).not.toBeNull();
  });

  it('Technikum fül eltűnik és az Áttekintésre ugrik, ha sem a térkép, sem a csapatok nem elérhető', async () => {
    configure(makeGroup(), { technikum: 'disabled', teams: 'disabled' });
    const { el, router, labels, tabByLabel } = await open('/csoportok/1?tab=technikum');

    expect(labels()).not.toContain('Technikum');
    expect(tabByLabel('Áttekintés').getAttribute('aria-selected')).toBe('true');
    expect(router.url).toBe('/csoportok/1?tab=attekintes');
    expect(el.querySelector('app-csoport-technikum')).toBeNull();
  });

  it('a térkép késői 404-ére csak a térkép tűnik el, a csapatok miatt a Technikum fül marad', async () => {
    configure(makeGroup(), { technikum: { visible: true, hasPremium: true } });
    technikumMock.heatmap.mockImplementation(featureDisabled);
    const { el, labels, router } = await open('/csoportok/1?tab=technikum');

    expect(el.querySelector('app-vizsgaresz-terkep')).toBeNull();
    expect(el.querySelector('app-csoport-csapatok')).not.toBeNull();
    expect(labels()).toContain('Technikum');
    expect(router.url).toBe('/csoportok/1?tab=technikum');
  });

  it('fejléc: morzsa, létszám + intézmény, meghívókód-chip másolással, Élő játék és + Kiadás', async () => {
    configure(makeGroup({ schoolName: 'Bükkfa Gimnázium' }));
    groupStoreMock.members.set([{ userId: 1 }, { userId: 2 }]);
    const { el } = await open();

    expect(el.querySelector('nav[aria-label="Morzsa"]')?.textContent).toContain('Csoportok');
    expect(el.querySelector('h1')?.textContent).toContain('Teszt Csoport');
    const meta = el.querySelector('[data-testid="group-header-meta"]')?.textContent?.replace(/\s+/g, ' ');
    expect(meta).toContain('2 diák');
    expect(meta).toContain('Bükkfa Gimnázium');
    const chip = el.querySelector('[data-testid="group-invite-chip"]')!;
    expect(chip.querySelector('code')?.textContent).toBe('ABCD1234');
    expect(chip.querySelector('app-copy-button')).not.toBeNull();
    expect(el.querySelector('a[href="/feladatsorok"]')?.textContent).toContain('+ Kiadás');
  });

  it('az „Élő játék” gomb a Kiadások fül Kvízek szakaszára visz', async () => {
    configure();
    const { el, router, settle } = await open();
    ([...el.querySelectorAll('header button')] as HTMLButtonElement[]).find((b) => b.textContent?.includes('Élő játék'))!.click();
    await settle();
    expect(router.url).toBe('/csoportok/1?tab=kiadasok#kvizek');
    expect(el.querySelector('app-csoport-kiadasok')).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('archivált csoportnál nincs meghívókód-chip és kiadás-gomb, az „Archivált” jelvény látszik', async () => {
    configure(makeGroup({ isArchived: true }));
    const { el } = await open();
    expect(el.querySelector('[data-testid="group-invite-chip"]')).toBeNull();
    expect(el.querySelector('a[href="/feladatsorok"]')).toBeNull();
    expect(el.textContent).toContain('Archivált');
  });

  it('a Diákok fül üres állapotának gombja a Beállítások → Meghívó kód szakaszra visz', async () => {
    configure();
    const { el, router, settle } = await open('/csoportok/1?tab=diakok');
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => b.textContent?.includes('Meghívó kód megnyitása'))!.click();
    await settle();
    expect(router.url).toBe('/csoportok/1?tab=beallitasok#meghivo');
    expect(el.querySelector('#meghivo')).not.toBeNull();
  });

  // UI-TT-178/180: az Eredmények fül minden váltáskor újra létrejön - a szűrő kulcsa és az egyéni
  // tartomány (kizáró felső határ!) a szülőben él, így visszatérve a beállított érték látszik.
  it('fülváltás után az Eredmények szűrője a korábban beállított gyorsszűrőt mutatja (UI-TT-178)', async () => {
    configure();
    const { harness, el, tabByLabel, settle, component } = await open('/csoportok/1?tab=eredmenyek');
    harness.fixture.debugElement.query((de) => de.name === 'app-date-range-filter').componentInstance.selectKey('last30');
    await settle();
    expect(component.rangeKey()).toBe('last30');

    tabByLabel('Diákok').click();
    await settle();
    tabByLabel('Eredmények').click();
    await settle();

    expect((el.querySelector('select#range-key') as HTMLSelectElement).value).toBe('last30');
  });

  it('fülváltás után az „Egyéni időszak” Vége mezője a beírt záró napot mutatja, nem eggyel későbbit (UI-TT-180)', async () => {
    configure();
    const { harness, el, tabByLabel, settle } = await open('/csoportok/1?tab=eredmenyek');
    const filter = harness.fixture.debugElement.query((de) => de.name === 'app-date-range-filter').componentInstance;
    filter.selectKey('custom');
    filter.customFrom.set('2026-08-01');
    filter.customTo.set('2026-08-05');
    filter.applyCustom();
    await settle();

    tabByLabel('Diákok').click();
    await settle();
    tabByLabel('Eredmények').click();
    await settle();

    expect((el.querySelector('input#range-to') as HTMLInputElement).value).toBe('2026-08-05');
    expect(reportStoreMock.loadGroupActivity).toHaveBeenLastCalledWith(1, expect.any(Date), expect.any(Date));
  });
});
