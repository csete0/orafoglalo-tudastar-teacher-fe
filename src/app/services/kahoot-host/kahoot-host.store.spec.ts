import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { KahootHostStore } from './kahoot-host.store';
import { KahootSignalRService } from './kahoot-signalr.service';
import {
  KahootLiveQuestionDto,
  KahootQuestionClosedDto,
  KahootRoomSnapshotDto,
} from '../../models/kahoot-host.model';

/**
 * A host-oldali fázisgép. A hangsúly: a hub-események és a csatlakozási
 * snapshot ugyanabba a konzisztens állapotba fussanak (első belépés, F5,
 * reconnect), és a vezérlő műveletek dupla-kattintás ellen védettek legyenek.
 */
describe('KahootHostStore', () => {
  let handlers: Record<string, (payload: unknown) => void>;
  let signalrMock: {
    startConnection: ReturnType<typeof vi.fn>;
    joinRoom: ReturnType<typeof vi.fn>;
    leaveRoom: ReturnType<typeof vi.fn>;
    startGame: ReturnType<typeof vi.fn>;
    nextQuestion: ReturnType<typeof vi.fn>;
    closeQuestion: ReturnType<typeof vi.fn>;
    endGame: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    setReconnectedCallback: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    isConnected: ReturnType<typeof signal<boolean>>;
    isReconnecting: ReturnType<typeof signal<boolean>>;
  };
  let store: KahootHostStore;

  beforeEach(() => {
    handlers = {};
    signalrMock = {
      startConnection: vi.fn().mockResolvedValue(undefined),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn().mockResolvedValue(undefined),
      startGame: vi.fn().mockResolvedValue(undefined),
      nextQuestion: vi.fn().mockResolvedValue(undefined),
      closeQuestion: vi.fn().mockResolvedValue(undefined),
      endGame: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, cb: (payload: unknown) => void) => {
        handlers[event] = cb;
      }),
      setReconnectedCallback: vi.fn(),
      disconnect: vi.fn(),
      isConnected: signal(true),
      isReconnecting: signal(false),
    };

    TestBed.configureTestingModule({
      providers: [
        KahootHostStore,
        { provide: KahootSignalRService, useValue: signalrMock },
      ],
    });
    store = TestBed.inject(KahootHostStore);
  });

  afterEach(async () => {
    await store.leave();
  });

  function makeSnapshot(overrides: Partial<KahootRoomSnapshotDto> = {}): KahootRoomSnapshotDto {
    return {
      kahootSessionId: 5,
      status: 'lobby',
      quizTitle: 'Élő dolgozat',
      groupName: '9.a',
      joinCode: 'ABC234',
      questionCount: 3,
      currentQuestionIndex: -1,
      currentQuestion: null,
      participantCount: 1,
      participantNames: ['Anna'],
      leaderboard: [],
      isHost: true,
      ...overrides,
    };
  }

  function makeQuestion(overrides: Partial<KahootLiveQuestionDto> = {}): KahootLiveQuestionDto {
    const now = Date.now();
    return {
      index: 0,
      total: 3,
      questionId: 101,
      questionText: 'Mi a HTML?',
      questionType: 'single',
      options: ['jelölőnyelv', 'programnyelv'],
      secondsLimit: 30,
      startedAtUtc: new Date(now).toISOString(),
      endsAtUtc: new Date(now + 30_000).toISOString(),
      ...overrides,
    };
  }

  it('lobby-snapshot: a kivetíthető join-kóddal és a csatlakozókkal áll fel', async () => {
    signalrMock.joinRoom.mockResolvedValue(makeSnapshot());

    await store.join(5);

    expect(store.phase()).toBe('lobby');
    expect(store.joinCode()).toBe('ABC234');
    expect(store.participantNames()).toEqual(['Anna']);
  });

  it('QuestionStarted: válasz-számláló nullázódik, visszaszámláló indul', async () => {
    signalrMock.joinRoom.mockResolvedValue(makeSnapshot());
    await store.join(5);

    handlers['AnswerReceived']({ answeredCount: 3, participantCount: 5 });
    handlers['QuestionStarted'](makeQuestion());

    expect(store.phase()).toBe('question');
    expect(store.answeredCount()).toBe(0);
    expect(store.timeLeftSeconds()).toBeGreaterThanOrEqual(29);
  });

  it('AnswerReceived a futó kérdés alatt frissíti a számlálót', async () => {
    signalrMock.joinRoom.mockResolvedValue(makeSnapshot());
    await store.join(5);
    handlers['QuestionStarted'](makeQuestion());

    handlers['AnswerReceived']({ answeredCount: 4, participantCount: 6 });

    expect(store.answeredCount()).toBe(4);
    expect(store.participantCount()).toBe(6);
  });

  it('QuestionClosed → reveal; GameEnded → ended', async () => {
    signalrMock.joinRoom.mockResolvedValue(makeSnapshot());
    await store.join(5);
    handlers['QuestionStarted'](makeQuestion());

    const closed: KahootQuestionClosedDto = {
      questionIndex: 0,
      questionId: 101,
      correctAnswers: ['jelölőnyelv'],
      explanation: null,
      optionCounts: [],
      answerCount: 2,
      participantCount: 2,
      top: [],
    };
    handlers['QuestionClosed'](closed);
    expect(store.phase()).toBe('reveal');
    expect(store.questionClosed()?.answerCount).toBe(2);

    handlers['GameEnded']({
      kahootSessionId: 5,
      leaderboard: [{ userId: 1, name: 'Anna', totalPoints: 900, correctAnswers: 1, rank: 1 }],
    });
    expect(store.phase()).toBe('ended');
    expect(store.finalLeaderboard()).toHaveLength(1);
  });

  it('futó kérdés snapshotja (host F5): kérdés-fázis a maradék idővel', async () => {
    signalrMock.joinRoom.mockResolvedValue(
      makeSnapshot({
        status: 'question',
        currentQuestionIndex: 1,
        currentQuestion: makeQuestion({ index: 1 }),
      }),
    );

    await store.join(5);

    expect(store.phase()).toBe('question');
    expect(store.timeLeftSeconds()).toBeGreaterThan(25);
  });

  it('vezérlő művelet alatt a második hívás nem megy ki (actionPending kapu)', async () => {
    signalrMock.joinRoom.mockResolvedValue(makeSnapshot());
    await store.join(5);

    let resolveStart!: () => void;
    signalrMock.startGame.mockReturnValue(new Promise<void>((r) => (resolveStart = r)));

    const first = store.start();
    const second = store.start();
    resolveStart();
    await Promise.all([first, second]);

    expect(signalrMock.startGame).toHaveBeenCalledTimes(1);
  });

  it('hub-hibás vezérlés: beszédes actionError, a fázis nem borul', async () => {
    signalrMock.joinRoom.mockResolvedValue(makeSnapshot());
    signalrMock.startGame.mockRejectedValue(
      new Error('failed. HubException: Ezt a játékot nem te vezeted.'),
    );
    await store.join(5);

    await store.start();

    expect(store.actionError()).toBe('Ezt a játékot nem te vezeted.');
    expect(store.phase()).toBe('lobby');
  });

  it('sikertelen csatlakozás: hiba-fázis a HubException üzenetével', async () => {
    signalrMock.joinRoom.mockRejectedValue(
      new Error('Error: HubException: Az élő játék nem található.'),
    );

    await store.join(5);

    expect(store.phase()).toBe('error');
    expect(store.error()).toBe('Az élő játék nem található.');
  });
});
