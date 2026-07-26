import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { LeaderboardStore } from './leaderboard.store';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardResponseDto } from '../../models/leaderboard.model';

function makeLeaderboard(overrides: Partial<LeaderboardResponseDto> = {}): LeaderboardResponseDto {
  return {
    topEntries: [{ rank: 1, nickname: 'Diák1', score: 100, isCurrentUser: false }],
    nearbyEntries: [],
    ...overrides,
  };
}

describe('LeaderboardStore', () => {
  let serviceMock: {
    getGroupLeaderboard: ReturnType<typeof vi.fn>;
    getSchoolLeaderboard: ReturnType<typeof vi.fn>;
  };
  let store: LeaderboardStore;

  function configure() {
    serviceMock = { getGroupLeaderboard: vi.fn(), getSchoolLeaderboard: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: LeaderboardService, useValue: serviceMock }],
    });
    store = TestBed.inject(LeaderboardStore);
  }

  beforeEach(() => configure());

  it('loadGroupLeaderboard siker: leaderboard beállítva, loading()=false', async () => {
    serviceMock.getGroupLeaderboard.mockReturnValue(of(makeLeaderboard()));

    store.loadGroupLeaderboard(1, 'quiz', 'weekly');
    await Promise.resolve();

    expect(store.leaderboard()).toEqual(makeLeaderboard());
    expect(store.loading()).toBe(false);
  });

  it('loadGroupLeaderboard hiba: error beállítva, leaderboard null marad', async () => {
    serviceMock.getGroupLeaderboard.mockReturnValue(throwError(() => ({ error: {} })));

    store.loadGroupLeaderboard(1, 'quiz', 'weekly');
    await Promise.resolve();

    expect(store.error()).toBe('A ranglista betöltése sikertelen.');
    expect(store.leaderboard()).toBeNull();
  });

  it('loadSchoolLeaderboard siker: leaderboard beállítva', async () => {
    serviceMock.getSchoolLeaderboard.mockReturnValue(of(makeLeaderboard({ topEntries: [] })));

    store.loadSchoolLeaderboard(5, 'exam', 'alltime');
    await Promise.resolve();

    expect(store.leaderboard()).toEqual(makeLeaderboard({ topEntries: [] }));
  });

  // A csoport-/intézmény-részletek oldalak "kategória"/"időszak" <select>-jei
  // ngModelChange-re AZONNAL, guard nélkül újratöltik a ranglistát - gyors
  // szűrő-váltásnál (pl. "Heti" -> "Havi") mindkét hívás ténylegesen elindul.
  // Ugyanaz a hiba-osztály, mint az AdminApplicationStore szűrő-váltása
  // (UI-TT-124 - lásd admin-application.store.spec.ts).
  it('BUG-fix: gyors szűrő-váltás esetén, ha a KORÁBBAN indított hívás válasza érkezik meg KÉSŐBB, nem írja felül a frissebb szándéknak megfelelő, már megérkezett adatot', async () => {
    const weeklyResponse = new Subject<LeaderboardResponseDto>();
    const monthlyResponse = new Subject<LeaderboardResponseDto>();
    serviceMock.getGroupLeaderboard
      .mockReturnValueOnce(weeklyResponse)
      .mockReturnValueOnce(monthlyResponse);

    // A tanár "Heti" időszakot választ...
    store.loadGroupLeaderboard(1, 'quiz', 'weekly');
    // ...majd MIELŐTT a válasz megérkezne, átvált "Havi"-ra.
    store.loadGroupLeaderboard(1, 'quiz', 'monthly');
    expect(serviceMock.getGroupLeaderboard).toHaveBeenCalledTimes(2);

    // A hálózaton a válaszok FORDÍTOTT sorrendben érkeznek: előbb a KÉSŐBB
    // indított "Havi" kérés válasza...
    const monthlyResult = makeLeaderboard({ topEntries: [{ rank: 1, nickname: 'HaviGyoztes', score: 500, isCurrentUser: false }] });
    monthlyResponse.next(monthlyResult);
    monthlyResponse.complete();
    await Promise.resolve();

    expect(store.leaderboard()).toEqual(monthlyResult);

    // ...majd UTÁNA érkezik meg a KORÁBBAN indított, de már elavult "Heti" válasz.
    const weeklyResult = makeLeaderboard({ topEntries: [{ rank: 1, nickname: 'HetiGyoztes', score: 50, isCurrentUser: false }] });
    weeklyResponse.next(weeklyResult);
    weeklyResponse.complete();
    await Promise.resolve();

    // A JAVÍTOTT viselkedés: az elavult "Heti" válasz NEM írja felül a
    // ténylegesen legutóbb kiválasztott "Havi" szűrőhöz tartozó adatot.
    expect(store.leaderboard()).toEqual(monthlyResult);
    expect(store.loading()).toBe(false);
  });

  it('clearError üríti a hibaüzenetet', async () => {
    serviceMock.getGroupLeaderboard.mockReturnValue(throwError(() => ({ error: {} })));
    store.loadGroupLeaderboard(1, 'quiz', 'weekly');
    await Promise.resolve();
    expect(store.error()).not.toBeNull();

    store.clearError();
    expect(store.error()).toBeNull();
  });
});
