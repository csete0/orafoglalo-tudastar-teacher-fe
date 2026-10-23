import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component, computed, signal } from '@angular/core';
import { KahootHostComponent } from './kahoot-host.component';
import { KahootHostStore } from '../../services/kahoot-host/kahoot-host.store';
import {
  KahootHostPhase,
  KahootLeaderboardEntryDto,
  KahootLiveQuestionDto,
  KahootQuestionClosedDto,
} from '../../models/kahoot-host.model';

/** A store nyilvános felülete, írható signalokkal - a komponens csak olvas belőle és a műveleteket hívja. */
class FakeKahootHostStore {
  readonly phase = signal<KahootHostPhase>('lobby');
  readonly roomId = signal<number | null>(34);
  readonly quizTitle = signal('Halmazok');
  readonly groupName = signal('11.B');
  readonly joinCode = signal<string | null>('482913');
  readonly questionCount = signal(3);
  readonly participantCount = signal(0);
  readonly participantNames = signal<string[]>([]);
  readonly currentQuestion = signal<KahootLiveQuestionDto | null>(null);
  readonly questionClosed = signal<KahootQuestionClosedDto | null>(null);
  readonly finalLeaderboard = signal<KahootLeaderboardEntryDto[]>([]);
  readonly answeredCount = signal(0);
  readonly error = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly actionPending = signal(false);
  readonly timeLeftSeconds = signal(20);
  readonly isReconnecting = signal(false);
  readonly hasNextQuestion = computed(() => {
    const q = this.currentQuestion();
    return q != null && q.index + 1 < q.total;
  });
  readonly join = vi.fn((_id: number) => Promise.resolve());
  readonly leave = vi.fn(() => Promise.resolve());
  readonly start = vi.fn(() => Promise.resolve());
  readonly next = vi.fn(() => Promise.resolve());
  readonly closeQuestion = vi.fn(() => Promise.resolve());
  readonly endGame = vi.fn(() => Promise.resolve());
}

const question = (over: Partial<KahootLiveQuestionDto> = {}): KahootLiveQuestionDto => ({
  index: 0, total: 3, questionId: 1, questionText: 'Mennyi 2 + 2?', questionType: 'single', options: ['3', '4', ' Négy '],
  secondsLimit: 20, startedAtUtc: '', endsAtUtc: '', ...over,
});
const entry = (rank: number, name: string, totalPoints: number): KahootLeaderboardEntryDto =>
  ({ userId: rank, name, totalPoints, correctAnswers: 4 - rank, rank });
const closed = (over: Partial<KahootQuestionClosedDto> = {}): KahootQuestionClosedDto => ({
  questionIndex: 0, questionId: 1, correctAnswers: ['4', 'négy'], explanation: 'Összeadás.',
  optionCounts: [{ option: '3', count: 1 }, { option: '4', count: 2 }, { option: ' Négy ', count: 0 }],
  answerCount: 3, participantCount: 4, top: [entry(1, 'Anna', 900), entry(2, 'Bence', 700)], ...over,
});

@Component({ template: '' })
class KvizekStub {}

describe('KahootHostComponent (élő játék vezérlő, karakterizáló)', () => {
  async function setup(url = '/feladatsorok/kvizek/12/elo/34', init: (s: FakeKahootHostStore) => void = () => {}) {
    const store = new FakeKahootHostStore();
    init(store);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'feladatsorok/kvizek/:id/elo/:kahootSessionId', component: KahootHostComponent },
          { path: 'feladatsorok/kvizek', component: KvizekStub },
          { path: '**', component: KvizekStub },
        ]),
        { provide: KahootHostStore, useValue: store },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const render = () => harness.fixture.detectChanges();
    return { harness, el, store, render };
  }

  const buttonByText = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text);

  it('a route szoba-azonosítójával csatlakozik, elhagyáskor kilép', async () => {
    const { harness, store } = await setup();
    expect(store.join).toHaveBeenCalledWith(34);
    expect(store.leave).not.toHaveBeenCalled();
    await harness.navigateByUrl('/feladatsorok/kvizek');
    expect(store.leave).toHaveBeenCalledTimes(1);
  });

  it('érvénytelen szoba-azonosítónál nem csatlakozik, a kvízlistára navigál', async () => {
    const { store } = await setup('/feladatsorok/kvizek/12/elo/abc');
    expect(store.join).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/feladatsorok/kvizek');
  });

  it('csatlakozás és hiba: várakozó szöveg, majd a hibaüzenet a szerkesztőre mutató linkkel', async () => {
    const { el, store, render } = await setup(undefined, (s) => s.phase.set('connecting'));
    expect(el.textContent).toContain('Csatlakozás a játékhoz…');
    store.phase.set('idle');
    render();
    expect(el.textContent).toContain('Csatlakozás a játékhoz…');
    store.phase.set('error');
    store.error.set('A játék nem található.');
    render();
    expect(el.querySelector('.text-danger')?.textContent).toContain('A játék nem található.');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/feladatsorok/kvizek/12/szerkesztes');
    expect(el.querySelector('h1')).toBeNull();
  });

  it('újracsatlakozás közben jelzés látszik; a művelethiba a fejléc alatt', async () => {
    const { el, store, render } = await setup();
    expect(el.textContent).not.toContain('Kapcsolat helyreállítása…');
    store.isReconnecting.set(true);
    store.actionError.set('Nem sikerült elindítani.');
    render();
    expect(el.textContent).toContain('Kapcsolat helyreállítása…');
    expect(el.textContent).toContain('Nem sikerült elindítani.');
  });

  it('lobby: fejléc, játék-kód, QR kapcsoló; Indítás csak csatlakozó után; a csatlakozók listája', async () => {
    const { el, store, render } = await setup();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Halmazok');
    expect(el.textContent).toContain('11.B · élő játék · 3 kérdés');
    expect(el.textContent).toContain('482913');
    expect(el.querySelector('app-copy-button')).not.toBeNull();
    expect(el.textContent).toContain('Várakozás az első csatlakozóra…');
    expect(el.textContent).toContain('Még senki.');
    expect(buttonByText(el, 'Indítás')!.disabled).toBe(true);

    expect(el.querySelector('app-qr-code')).toBeNull();
    buttonByText(el, 'QR-kód kivetítéshez')!.click();
    render();
    expect(el.querySelector('app-qr-code')).not.toBeNull();
    buttonByText(el, 'QR elrejtése')!.click();
    render();
    expect(el.querySelector('app-qr-code')).toBeNull();

    store.participantCount.set(2);
    store.participantNames.set(['Anna', 'Bence']);
    render();
    expect(el.textContent).not.toContain('Várakozás az első csatlakozóra…');
    expect([...el.querySelectorAll('.flex-wrap .badge')].map((b) => b.textContent!.trim())).toEqual(['Anna', 'Bence']);
    expect(el.textContent).toContain('Csatlakozott diákok (2)');
    buttonByText(el, 'Indítás')!.click();
    expect(store.start).toHaveBeenCalledTimes(1);

    store.actionPending.set(true);
    render();
    expect(buttonByText(el, 'Indítás')!.disabled).toBe(true);
    expect(buttonByText(el, 'Játék befejezése')!.disabled).toBe(true);
  });

  it('lobby kód nélkül: nincs kód-blokk, az Indítás megmarad', async () => {
    const { el } = await setup(undefined, (s) => s.joinCode.set(null));
    expect(el.textContent).not.toContain('Játék-kód');
    expect(el.querySelector('app-copy-button')).toBeNull();
    expect(buttonByText(el, 'Indítás')).toBeTruthy();
  });

  it('kérdés: sorszám, szöveg, opciók, színezett visszaszámláló, válaszszámláló; lezárás és befejezés', async () => {
    const { el, store, render } = await setup(undefined, (s) => {
      s.phase.set('question');
      s.currentQuestion.set(question({ index: 1 }));
      s.participantCount.set(4);
      s.answeredCount.set(3);
    });
    expect(el.textContent).toContain('2 / 3. kérdés');
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('Mennyi 2 + 2?');
    expect([...el.querySelectorAll('.grid > div')].map((d) => d.textContent!.trim())).toEqual(['3', '4', 'Négy']);
    expect(el.textContent).toContain('3 / 4');
    const timer = () => el.querySelector('.text-3xl')!;
    expect(timer().textContent!.trim()).toBe('20');
    expect(timer().classList.contains('text-warning')).toBe(false);
    expect(timer().classList.contains('text-danger')).toBe(false);
    store.timeLeftSeconds.set(10);
    render();
    expect(timer().classList.contains('text-warning')).toBe(true);
    store.timeLeftSeconds.set(5);
    render();
    expect(timer().classList.contains('text-danger')).toBe(true);
    expect(timer().classList.contains('text-warning')).toBe(false);

    buttonByText(el, 'Kérdés lezárása most')!.click();
    expect(store.closeQuestion).toHaveBeenCalledTimes(1);
    buttonByText(el, 'Játék befejezése')!.click();
    expect(store.endGame).toHaveBeenCalledTimes(1);
  });

  it('kiegészítős kérdésnél opciók helyett magyarázó szöveg', async () => {
    const { el } = await setup(undefined, (s) => {
      s.phase.set('question');
      s.currentQuestion.set(question({ questionType: 'cloze', options: [] }));
    });
    expect(el.textContent).toContain('a diákok begépelik a hiányzó részt');
    expect(el.querySelector('.grid')).toBeNull();
  });

  it('eredmény: helyes válaszok, magyarázat, hisztogram (kis-nagybetű és szóköz független egyezés), élmezőny, továbblépés', async () => {
    const { el, store, render } = await setup(undefined, (s) => {
      s.phase.set('reveal');
      s.currentQuestion.set(question());
      s.questionClosed.set(closed());
    });
    expect(el.querySelector('.badge-success')?.textContent?.trim()).toBe('Helyes: 4, négy');
    expect(el.textContent).toContain('3 / 4 válaszolt');
    expect(el.textContent).toContain('Összeadás.');
    const rows = [...el.querySelectorAll('ul > li')];
    expect(rows.map((r) => r.querySelector('span')!.classList.contains('text-success'))).toEqual([false, true, true]);
    expect(rows.map((r) => r.querySelectorAll('app-icon').length)).toEqual([0, 1, 1]);
    expect(rows.map((r) => (r.querySelector('.rounded-full.h-full') as HTMLElement).style.width)).toEqual(['33%', '67%', '0%']);
    expect(rows.map((r) => r.querySelector('.rounded-full.h-full')!.classList.contains('bg-success'))).toEqual([false, true, true]);
    expect(el.textContent).toContain('Élmezőny');
    expect([...el.querySelectorAll('ol > li')].map((li) => [...li.querySelectorAll('span')].map((s) => s.textContent!.trim()).join('|'))).toEqual(['1.|Anna|900', '2.|Bence|700']);

    buttonByText(el, 'Következő kérdés')!.click();
    expect(store.next).toHaveBeenCalledTimes(1);

    store.currentQuestion.set(question({ index: 2 }));
    render();
    expect(buttonByText(el, 'Eredményhirdetés')).toBeTruthy();
  });

  it('eredmény 0 válasznál 0% sávval; magyarázat és élmezőny nélkül', async () => {
    const { el } = await setup(undefined, (s) => {
      s.phase.set('reveal');
      s.questionClosed.set(closed({ answerCount: 0, explanation: null, top: [], optionCounts: [{ option: '4', count: 0 }] }));
    });
    expect((el.querySelector('.rounded-full.h-full') as HTMLElement).style.width).toBe('0%');
    expect(el.textContent).not.toContain('Élmezőny');
    expect(el.textContent).not.toContain('Összeadás.');
  });

  it('eredmény a zárás-adat nélkül (F5 a reveal alatt): tájékoztató szöveg, a továbblépés megmarad', async () => {
    const { el, store } = await setup(undefined, (s) => s.phase.set('reveal'));
    expect(el.textContent).toContain('Eredményhirdetés — a részletek a következő kérdésnél folytatódnak.');
    buttonByText(el, 'Eredményhirdetés')!.click();
    expect(store.next).toHaveBeenCalledTimes(1);
  });

  it('vége: dobogó-kiemelés, végeredmény, nincs befejezés-gomb; az eredmény-link a menetre szűr', async () => {
    const { el } = await setup(undefined, (s) => {
      s.phase.set('ended');
      s.finalLeaderboard.set([entry(1, 'Anna', 900), entry(2, 'Bence', 700), entry(3, 'Csilla', 500), entry(4, 'Dóra', 100)]);
    });
    expect(el.textContent).toContain('Vége a játéknak!');
    expect(el.textContent).toContain('4 résztvevő');
    expect(buttonByText(el, 'Játék befejezése')).toBeUndefined();
    const items = [...el.querySelectorAll('ol > li')];
    expect(items.map((li) => li.classList.contains('bg-primary-subtle'))).toEqual([true, true, true, false]);
    expect(items[0].querySelector('app-icon')).not.toBeNull();
    expect(items[1].textContent).toContain('2.');
    expect(items[3].textContent).toContain('0 helyes');
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/feladatsorok/kvizek/12/szerkesztes', '/feladatsorok/kvizek/12/eredmenyek?kahootSessionId=34']);
  });

  it('vége üres végeredménnyel: nincs lista', async () => {
    const { el } = await setup(undefined, (s) => s.phase.set('ended'));
    expect(el.textContent).toContain('0 résztvevő');
    expect(el.textContent).not.toContain('Végeredmény');
  });
});
