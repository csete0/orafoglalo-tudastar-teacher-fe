import { computed, inject, Injectable, signal } from '@angular/core';
import {
  KahootAnswerReceivedDto,
  KahootGameEndedDto,
  KahootHostPhase,
  KahootLeaderboardEntryDto,
  KahootLiveQuestionDto,
  KahootParticipantEventDto,
  KahootQuestionClosedDto,
  KahootRoomSnapshotDto,
} from '../../models/kahoot-host.model';
import { KahootSignalRService } from './kahoot-signalr.service';

/**
 * A host-képernyő állapota. A fázisgép a hub-eseményekből ÉS a csatlakozási
 * snapshotból ugyanazon az úton (applySnapshot) épül fel - az első belépés, az
 * F5 és a reconnect (automatikus újra-join) ugyanúgy áll helyre.
 *
 * A vezérlő műveletek (indítás/léptetés/zárás/vége) alatt egyetlen közös
 * `actionPending` jelző tiltja a gombokat - a dupla kattintás elleni VALÓDI
 * védelem a szerver atomi állapot-claimje, ez csak a felesleges hibaüzenetet
 * előzi meg.
 */
@Injectable({ providedIn: 'root' })
export class KahootHostStore {
  private readonly signalr = inject(KahootSignalRService);

  private readonly _phase = signal<KahootHostPhase>('idle');
  private readonly _roomId = signal<number | null>(null);
  private readonly _quizTitle = signal('');
  private readonly _groupName = signal('');
  private readonly _joinCode = signal<string | null>(null);
  private readonly _questionCount = signal(0);
  private readonly _participantCount = signal(0);
  private readonly _participantNames = signal<string[]>([]);
  private readonly _currentQuestion = signal<KahootLiveQuestionDto | null>(null);
  private readonly _questionClosed = signal<KahootQuestionClosedDto | null>(null);
  private readonly _finalLeaderboard = signal<KahootLeaderboardEntryDto[]>([]);
  private readonly _answeredCount = signal(0);
  private readonly _error = signal<string | null>(null);
  private readonly _actionError = signal<string | null>(null);
  private readonly _actionPending = signal(false);
  private readonly _timeLeftSeconds = signal(0);

  readonly phase = computed(() => this._phase());
  readonly roomId = computed(() => this._roomId());
  readonly quizTitle = computed(() => this._quizTitle());
  readonly groupName = computed(() => this._groupName());
  readonly joinCode = computed(() => this._joinCode());
  readonly questionCount = computed(() => this._questionCount());
  readonly participantCount = computed(() => this._participantCount());
  readonly participantNames = computed(() => this._participantNames());
  readonly currentQuestion = computed(() => this._currentQuestion());
  readonly questionClosed = computed(() => this._questionClosed());
  readonly finalLeaderboard = computed(() => this._finalLeaderboard());
  readonly answeredCount = computed(() => this._answeredCount());
  readonly error = computed(() => this._error());
  readonly actionError = computed(() => this._actionError());
  readonly actionPending = computed(() => this._actionPending());
  readonly timeLeftSeconds = computed(() => this._timeLeftSeconds());
  readonly isReconnecting = this.signalr.isReconnecting;

  /** Van-e még hátralévő kérdés a mostani után. */
  readonly hasNextQuestion = computed(() => {
    const q = this._currentQuestion();
    return q != null && q.index + 1 < q.total;
  });

  private serverOffsetMs = 0;
  private deadlineEpochMs: number | null = null;
  private tickerId: ReturnType<typeof setInterval> | null = null;
  private handlersRegistered = false;

  // ── Csatlakozás / kilépés ───────────────────────────────

  async join(kahootSessionId: number): Promise<void> {
    this._roomId.set(kahootSessionId);
    this._phase.set('connecting');
    this._error.set(null);

    try {
      await this.signalr.startConnection();
      this.registerHandlers();
      this.signalr.setReconnectedCallback(() => void this.rejoin());

      const snapshot = await this.signalr.joinRoom(kahootSessionId);
      this.applySnapshot(snapshot);
    } catch (err) {
      this._phase.set('error');
      this._error.set(extractHubErrorMessage(err, 'Nem sikerült csatlakozni a játékhoz.'));
    }
  }

  private async rejoin(): Promise<void> {
    const roomId = this._roomId();
    if (roomId == null || this._phase() === 'idle' || this._phase() === 'error') return;
    try {
      this.applySnapshot(await this.signalr.joinRoom(roomId));
    } catch {
      // Átmeneti hiba - a következő reconnect vagy egy kézi F5 pótolja.
    }
  }

  async leave(): Promise<void> {
    const roomId = this._roomId();
    this.stopTicker();
    this.signalr.setReconnectedCallback(null);
    if (roomId != null && this.signalr.isConnected()) {
      try {
        await this.signalr.leaveRoom(roomId);
      } catch {
        // A kapcsolat bontása úgyis kiléptet.
      }
    }
    this.signalr.disconnect();
    this.reset();
  }

  // ── Vezérlés ────────────────────────────────────────────

  start(): Promise<void> {
    return this.runAction((id) => this.signalr.startGame(id));
  }

  next(): Promise<void> {
    return this.runAction((id) => this.signalr.nextQuestion(id));
  }

  closeQuestion(): Promise<void> {
    return this.runAction((id) => this.signalr.closeQuestion(id));
  }

  endGame(): Promise<void> {
    return this.runAction((id) => this.signalr.endGame(id));
  }

  private async runAction(action: (kahootSessionId: number) => Promise<void>): Promise<void> {
    const roomId = this._roomId();
    if (roomId == null || this._actionPending()) return;

    this._actionPending.set(true);
    this._actionError.set(null);
    try {
      await action(roomId);
    } catch (err) {
      this._actionError.set(extractHubErrorMessage(err, 'A művelet sikertelen.'));
    } finally {
      this._actionPending.set(false);
    }
  }

  // ── Hub-események ───────────────────────────────────────

  private registerHandlers(): void {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    this.signalr.on<KahootLiveQuestionDto>('QuestionStarted', (q) => {
      this.serverOffsetMs = parseUtc(q.startedAtUtc) - Date.now();
      this.deadlineEpochMs = parseUtc(q.endsAtUtc);
      this._currentQuestion.set(q);
      this._questionClosed.set(null);
      this._answeredCount.set(0);
      this._actionError.set(null);
      this._phase.set('question');
      this.startTicker();
    });

    this.signalr.on<KahootAnswerReceivedDto>('AnswerReceived', (a) => {
      this._answeredCount.set(a.answeredCount);
      this._participantCount.set(a.participantCount);
    });

    this.signalr.on<KahootQuestionClosedDto>('QuestionClosed', (c) => {
      this._questionClosed.set(c);
      this._participantCount.set(c.participantCount);
      this._phase.set('reveal');
      this.stopTicker();
    });

    this.signalr.on<KahootGameEndedDto>('GameEnded', (g) => {
      this._finalLeaderboard.set(g.leaderboard);
      this._phase.set('ended');
      this.stopTicker();
    });

    // A takarító (Hangfire) zárta le az elárvult szobát - a képernyő ne "fagyjon be".
    this.signalr.on<{ kahootSessionId: number; reason: string }>('RoomCancelled', (p) => {
      this._phase.set('error');
      this._error.set(p.reason);
      this.stopTicker();
    });

    this.signalr.on<KahootParticipantEventDto>('ParticipantJoined', (p) => {
      this._participantCount.set(p.participantCount);
      this._participantNames.update((names) =>
        names.includes(p.name) ? names : [...names, p.name].sort((a, b) => a.localeCompare(b, 'hu')),
      );
    });
    // A ParticipantLeft csak a kapcsolatot jelzi - a kilépő session-je (és
    // pontszáma) megmarad, ezért a névsort nem fogyasztjuk.
  }

  private applySnapshot(snapshot: KahootRoomSnapshotDto): void {
    this._quizTitle.set(snapshot.quizTitle);
    this._groupName.set(snapshot.groupName);
    this._joinCode.set(snapshot.joinCode);
    this._questionCount.set(snapshot.questionCount);
    this._participantCount.set(snapshot.participantCount);
    this._participantNames.set(snapshot.participantNames);
    // BE-KAHOOT-HOST-RECONNECT-ANSWEREDCOUNT-RESETS-TO-ZERO: korábban a snapshot nem
    // hordozta ezt az értéket, csak a push-esemény - egy host-reconnect a következő
    // beküldésig hamisan 0-t mutatott egy folyamatban lévő kérdésen.
    this._answeredCount.set(snapshot.answeredCount);

    switch (snapshot.status) {
      case 'lobby':
        this._phase.set('lobby');
        break;
      case 'question':
        if (snapshot.currentQuestion) {
          // Snapshotnál nincs friss esemény-időbélyeg az óraeltéréshez - a nyers
          // kliens-óra marad; a zárás igazságát úgyis a szerver mondja ki.
          this.serverOffsetMs = 0;
          this.deadlineEpochMs = parseUtc(snapshot.currentQuestion.endsAtUtc);
          this._currentQuestion.set(snapshot.currentQuestion);
          this._questionClosed.set(null);
          this._phase.set('question');
          this.startTicker();
        } else {
          this._phase.set('lobby');
        }
        break;
      case 'reveal':
        // A zárás-payload nem őrződik - F5 után a "Következő kérdés" gombig
        // csak a fejléc + ranglista jár.
        this._currentQuestion.set(snapshot.currentQuestion);
        this._phase.set('reveal');
        break;
      case 'finished':
      case 'cancelled':
        this._finalLeaderboard.set(snapshot.leaderboard);
        this._phase.set('ended');
        break;
    }
  }

  // ── Visszaszámláló (csak megjelenítés) ──────────────────

  private startTicker(): void {
    this.stopTicker();
    this.updateTimeLeft();
    this.tickerId = setInterval(() => this.updateTimeLeft(), 250);
  }

  private stopTicker(): void {
    if (this.tickerId != null) {
      clearInterval(this.tickerId);
      this.tickerId = null;
    }
  }

  private updateTimeLeft(): void {
    if (this.deadlineEpochMs == null) {
      this._timeLeftSeconds.set(0);
      return;
    }
    const serverNow = Date.now() + this.serverOffsetMs;
    const remaining = Math.max(0, Math.ceil((this.deadlineEpochMs - serverNow) / 1000));
    if (remaining !== this._timeLeftSeconds()) {
      this._timeLeftSeconds.set(remaining);
    }
    if (remaining === 0) {
      this.stopTicker();
    }
  }

  private reset(): void {
    this._phase.set('idle');
    this._roomId.set(null);
    this._quizTitle.set('');
    this._groupName.set('');
    this._joinCode.set(null);
    this._questionCount.set(0);
    this._participantCount.set(0);
    this._participantNames.set([]);
    this._currentQuestion.set(null);
    this._questionClosed.set(null);
    this._finalLeaderboard.set([]);
    this._answeredCount.set(0);
    this._error.set(null);
    this._actionError.set(null);
    this._actionPending.set(false);
    this._timeLeftSeconds.set(0);
    this.deadlineEpochMs = null;
    this.serverOffsetMs = 0;
    this.handlersRegistered = false;
  }
}

/**
 * A .NET DATETIME2-ből visszaolvasott UTC időbélyeg zóna-jelölő nélkül is
 * érkezhet (DateTimeKind.Unspecified) - azt a böngésző HELYI időként
 * értelmezné. Ha nincs explicit zóna, UTC-ként értelmezzük.
 */
function parseUtc(timestamp: string): number {
  const hasTimezone = /Z$|[+-]\d\d:\d\d$/.test(timestamp);
  return Date.parse(hasTimezone ? timestamp : timestamp + 'Z');
}

/** A HubException a szerver OrafoglaloException-üzenetét hozza, SignalR-kerettel. */
function extractHubErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  if (!raw) return fallback;
  const marker = 'HubException: ';
  const at = raw.indexOf(marker);
  return at >= 0 ? raw.slice(at + marker.length).trim() : fallback;
}
