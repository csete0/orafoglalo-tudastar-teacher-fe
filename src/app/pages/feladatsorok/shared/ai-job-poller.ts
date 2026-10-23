import { DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, Observable, repeat, retry, Subscription, takeWhile, throwError, timer } from 'rxjs';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';

/** A háttérben futó MI-jobok (AI-feladat, irodai, asztali) közös állapot-alakja, amit a lekérdező olvas. */
export interface PolledJob {
  status: string;
  progressText: string | null;
}

export interface AiJobPollerConfig<J extends PolledJob> {
  /** A lekérdezések közti szünet (ms); átmeneti hibánál az újrapróbálás is ennyit vár. */
  intervalMs: number;
  /** Ezekben az állapotokban fut még a job; az első más állapotú válasz után a lekérdezés leáll. */
  activeStatuses: ReadonlySet<string>;
  fetch: (jobId: number) => Observable<J>;
  /** Minden (az aktuális jobhoz tartozó) válaszra, a `progressText` frissítése után. */
  onJob: (job: J) => void;
  /** 404: a job lejárt vagy nem a tanáré - végleges, nincs újrapróbálás. */
  onGone: () => void;
}

export const POLL_ERROR_MESSAGE = 'Az állapot lekérdezése nem sikerült - zárd be, és nyisd meg újra később.';
/** Átmeneti (nem 404-es) hibánál ennyiszer próbálja újra egymás után; sikeres válasz után a számláló nullázódik. */
const RETRY_COUNT = 3;

const isNotFound = (err: unknown): boolean => (err as { status?: unknown } | null)?.status === 404;

/**
 * Egy háttérben futó MI-job állapotának lekérdezése, amíg fut: azonnal, majd `intervalMs`-enként (`repeat` +
 * `timer`). Egyszerre egy job; új `poll` az előzőt (a folyamatban lévő kérést is) megszakítja. A komponens
 * megszűnésekor leáll. Az elavult (már nem aktuális jobhoz tartozó) válaszokat eldobja.
 */
export class AiJobPoller<J extends PolledJob> {
  private readonly currentJobId = signal<number | null>(null);
  private readonly currentProgress = signal<string | null>(null);
  private readonly currentError = signal<string | null>(null);
  /** Az aktuális job azonosítója (a lekérdezés vége után is megmarad, amíg `clear` nem törli). */
  readonly jobId = this.currentJobId.asReadonly();
  readonly progressText = this.currentProgress.asReadonly();
  /** Nem végleges lekérdezési hiba (a 3 újrapróbálás után) - a job a szerveren futhat tovább. */
  readonly error = this.currentError.asReadonly();

  private subscription: Subscription | null = null;

  constructor(
    private readonly config: AiJobPollerConfig<J>,
    private readonly destroyRef: DestroyRef,
  ) {}

  /** A job lekérdezése (új indítás vagy egy korábbi job folytatása / újranyitása). */
  poll(jobId: number): void {
    this.stop();
    this.currentJobId.set(jobId);
    this.currentProgress.set(null);
    this.currentError.set(null);
    const { intervalMs, activeStatuses, fetch } = this.config;
    this.subscription = defer(() => fetch(jobId))
      .pipe(
        // Átmeneti hálózati hiba: néhányszor újra; a 404 (lejárt / nem a tiéd) végleges.
        retry({ count: RETRY_COUNT, resetOnSuccess: true, delay: (err) => (isNotFound(err) ? throwError(() => err) : timer(intervalMs)) }),
        repeat({ delay: intervalMs }),
        takeWhile((job) => activeStatuses.has(job.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (job) => {
          if (this.currentJobId() !== jobId) return;
          this.currentProgress.set(job.progressText);
          this.config.onJob(job);
        },
        error: (err: unknown) => {
          if (this.currentJobId() !== jobId) return;
          if (isNotFound(err)) this.config.onGone();
          else this.currentError.set(extractErrorMessage(err, POLL_ERROR_MESSAGE));
        },
      });
  }

  /** A lekérdezés (és a folyamatban lévő kérés) leállítása; a job a szerveren fut tovább, az azonosító megmarad. */
  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /** Leállítás és a job elfelejtése (vissza a kéréshez). */
  clear(): void {
    this.stop();
    this.currentJobId.set(null);
  }
}

/** Injekciós kontextusban (mezőinicializáló / konstruktor) hozza létre a lekérdezőt a komponens élettartamára. */
export function injectAiJobPoller<J extends PolledJob>(config: AiJobPollerConfig<J>): AiJobPoller<J> {
  return new AiJobPoller(config, inject(DestroyRef));
}
