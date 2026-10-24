import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { CsoportBeallitasokComponent } from './csoport-beallitasok.component';
import { CsoportHelyekComponent } from './csoport-helyek.component';
import { GroupStore } from '../../../services/group/group.store';
import { GroupSeatStore } from '../../../services/group/group-seat.store';
import { SchoolStore } from '../../../services/school/school.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { GroupDto } from '../../../models/group.model';
import { SchoolDto } from '../../../models/school.model';
import { GroupSeatHolderDto, GroupSeatOverviewDto } from '../../../models/group-seat.model';

function makeGroup(overrides: Partial<GroupDto> = {}): GroupDto {
  return { id: 1, name: 'Teszt Csoport', inviteCode: 'ABCD1234', isJoinEnabled: true, isArchived: false, memberCount: 0, createdAt: new Date().toISOString(), ...overrides };
}

const school: SchoolDto = { id: 5, name: 'Teszt Gimnázium', slug: 'teszt-gimnazium', createdAt: new Date().toISOString(), groupCount: 1, myRole: 'Teacher', teacherCount: 3 };

function holder(overrides: Partial<GroupSeatHolderDto> = {}): GroupSeatHolderDto {
  return {
    userId: 9, displayName: 'Diák', claimedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(),
    isFresh: true, sessionInProgress: false, hasSessionInProgress: false, inMultipleGroups: false, ...overrides,
  };
}

function overview(overrides: Partial<GroupSeatOverviewDto> = {}): GroupSeatOverviewDto {
  return { groupId: 1, groupName: 'Teszt Csoport', licenseId: 5, tier: 'premium', capacity: 3, usedSeatsOnLicense: 1, holders: [], withoutSeat: [], ...overrides };
}

describe('CsoportBeallitasokComponent', () => {
  let update: ReturnType<typeof vi.fn>;
  let archive: ReturnType<typeof vi.fn>;
  let unarchive: ReturnType<typeof vi.fn>;
  let seatStore: { overview: ReturnType<typeof signal<GroupSeatOverviewDto | null>>; [k: string]: unknown };
  let schoolStore: { schools: ReturnType<typeof signal<SchoolDto[]>>; error: ReturnType<typeof signal<string | null>>; loadMine: ReturnType<typeof vi.fn> };
  let confirm: { ask: ReturnType<typeof vi.fn> };

  function setup(group: GroupDto = makeGroup(), schools: SchoolDto[] = []) {
    update = vi.fn();
    archive = vi.fn();
    unarchive = vi.fn();
    const store = { loading: signal(false), error: signal(null), update, archive, unarchive, regenerateInvite: vi.fn(), setJoinEnabled: vi.fn() };
    seatStore = { overview: signal(null), lastReleaseResult: signal(null), loading: signal(false), error: signal(null), load: vi.fn(), releaseSeat: vi.fn(), releaseAll: vi.fn() };
    schoolStore = { schools: signal(schools), error: signal(null), loadMine: vi.fn() };
    confirm = { ask: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [CsoportBeallitasokComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: store },
        { provide: GroupSeatStore, useValue: seatStore },
        { provide: SchoolStore, useValue: schoolStore },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const fixture = TestBed.createComponent(CsoportBeallitasokComponent);
    fixture.componentRef.setInput('group', group);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('betöltéskor a helyeket betölti; a Meghívó kód és Intézményi helyek szakasz horgonnyal érhető el', () => {
    const { el } = setup();
    expect(seatStore['load']).toHaveBeenCalledWith(1);
    expect(schoolStore.loadMine).toHaveBeenCalled();
    expect(el.querySelector('#meghivo')?.textContent).toContain('Meghívó kód');
    expect(el.querySelector('#helyek')?.textContent).toContain('Intézményi helyek');
    expect(el.textContent).toContain('ABCD1234');
  });

  // UI-TT-4: Mégse után a select a törölt választáson maradt.
  it('UI-TT-4: Mégse után a displaySchoolId visszaáll az eredeti értékre', async () => {
    const { c } = setup(makeGroup({ schoolId: undefined }), [school]);
    confirm.ask.mockResolvedValue(false);
    await c.changeSchool(school.id);
    expect(update).not.toHaveBeenCalled();
    expect(c.displaySchoolId()).toBeNull();
  });

  it('elfogadott megerősítésnél a displaySchoolId az új értéken marad és store.update() hívódik', async () => {
    const { c } = setup(makeGroup({ schoolId: undefined }), [school]);
    await c.changeSchool(school.id);
    expect(update).toHaveBeenCalledWith(1, { name: 'Teszt Csoport', schoolId: 5, rowVersion: undefined }, expect.any(Function), expect.any(Function));
    expect(c.displaySchoolId()).toBe(5);
  });

  // UI-TT-73: a store.update() hiba-ágán a select visszaáll a mentett értékre.
  it('UI-TT-73: sikertelen mentésnél a displaySchoolId visszaáll', async () => {
    const { c } = setup(makeGroup({ schoolId: undefined }), [school]);
    update.mockImplementation((_id: number, _req: unknown, _ok: () => void, onError?: (m: string) => void) => onError?.('hiba'));
    await c.changeSchool(school.id);
    expect(c.displaySchoolId()).toBeNull();
  });

  // BE-GROUPEDIT-LOSTUPDATE: a konkurrencia-token a betöltött csoportból megy vissza.
  it('saveRename() visszaküldi a betöltött csoport konkurrencia-tokenjét', () => {
    const { c } = setup(makeGroup({ rowVersion: 'AAAAAAAAB9k=' }));
    c.startRename();
    c.renameValue.set('Új név');
    c.saveRename();
    expect((update.mock.calls[0][1] as { name: string; rowVersion?: string })).toEqual(expect.objectContaining({ name: 'Új név', rowVersion: 'AAAAAAAAB9k=' }));
  });

  it('sikertelen mentésnél az átnevező nyitva marad a begépelt névvel', () => {
    const { c } = setup(makeGroup({ rowVersion: 'elavult' }));
    c.startRename();
    c.renameValue.set('Új név');
    c.saveRename();
    expect(c.renaming()).toBe(true);
    expect(c.renameValue()).toBe('Új név');
  });

  it('Mégse után az újabb „Átnevezés” a mostani névvel indul (az eldobott piszkozat nem marad meg)', () => {
    const { fixture, el, c } = setup();
    c.startRename();
    c.renameValue.set('Eldobott');
    c.renaming.set(false);
    c.startRename();
    fixture.detectChanges();
    expect(c.renameValue()).toBe('Teszt Csoport');
    const save = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Mentés') as HTMLButtonElement;
    c.renameValue.set('   ');
    fixture.detectChanges();
    expect(save.disabled).toBe(true);
  });

  it('új csoport-objektum (sikeres mentés) a select-et a mentett intézményre szinkronizálja', () => {
    const { fixture, c } = setup(makeGroup({ schoolId: undefined }), [school]);
    expect(c.displaySchoolId()).toBeNull();
    fixture.componentRef.setInput('group', makeGroup({ schoolId: 5 }));
    expect(c.displaySchoolId()).toBe(5);
  });

  // UI-TT-34: archivált csoport visszaállítható.
  it('UI-TT-34: archivált csoportnál „Visszaállítás” gomb van „Archiválás” helyett, és unarchive()-ot hív', () => {
    const { el } = setup(makeGroup({ isArchived: true }));
    const buttons = [...el.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.some((b) => b.textContent?.trim() === 'Archiválás')).toBe(false);
    buttons.find((b) => b.textContent?.includes('Visszaállítás'))!.click();
    expect(unarchive).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it('nem archivált csoportnál „Archiválás” gomb van; megerősítés után archive()-ot hív', async () => {
    const { el } = setup();
    const buttons = [...el.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.some((b) => b.textContent?.includes('Visszaállítás'))).toBe(false);
    buttons.find((b) => b.textContent?.trim() === 'Archiválás')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(confirm.ask).toHaveBeenCalled();
    expect(archive).toHaveBeenCalledWith(1, expect.any(Function));
  });

  // UI-TT-111: a sikertelen intézmény-betöltés nem tűnhet el némán.
  it('UI-TT-111: a schoolStore hibája látszik', () => {
    const { fixture, el } = setup();
    schoolStore.error.set('Az intézmények betöltése sikertelen.');
    fixture.detectChanges();
    expect(el.textContent).toContain('Az intézmények betöltése sikertelen.');
  });

  // UI-TT-202: a „X/Y hely használatban” szám a tétlen (de listázott) helyet nem számolja - ezt jelezni kell.
  it('UI-TT-202: a fejléc jelzi a tétlen, átadható helyet', () => {
    const { fixture, el } = setup();
    seatStore.overview.set(overview({ capacity: 0, usedSeatsOnLicense: 0, holders: [holder({ displayName: 'Tétlen Diák', isFresh: false })] }));
    fixture.detectChanges();
    expect(el.textContent).toContain('0/0 hely használatban');
    expect(el.textContent).toContain('Tétlen Diák');
    expect(el.textContent).toContain('tétlen, átadható');
  });

  // UI-TT-210: a hasSessionInProgress vizsga VAGY kvíz - a jelvény típus-semleges.
  it('UI-TT-210: folyamatban lévő munkamenetnél „vizsga/kvíz folyamatban” a jelvény', () => {
    const { fixture, el } = setup();
    seatStore.overview.set(overview({ holders: [holder({ displayName: 'Kvízző Diák', hasSessionInProgress: true, sessionInProgress: true })] }));
    fixture.detectChanges();
    expect(el.textContent).not.toContain(' vizsga folyamatban');
    expect(el.textContent).toContain('vizsga/kvíz folyamatban');
  });

  // UI-TT-212: az „Óra vége” megerősítő szövege a kvízt író diákot is említi.
  it('UI-TT-212: az „Óra vége” megerősítése vizsgát ÉS kvízt is említ, majd releaseAll()-t hív', async () => {
    const { fixture } = setup();
    seatStore.overview.set(overview({ holders: [holder({ hasSessionInProgress: true })] }));
    const helyek = fixture.debugElement.query(By.directive(CsoportHelyekComponent)).componentInstance as CsoportHelyekComponent;
    await helyek.confirmEndLesson();
    const message = confirm.ask.mock.calls[0][0].message as string;
    expect(message).toContain('Aki épp vizsgázik vagy kvízt ír, attól a rendszer nem veszi el a helyet.');
    expect(seatStore['releaseAll']).toHaveBeenCalledWith(1);
  });
});
