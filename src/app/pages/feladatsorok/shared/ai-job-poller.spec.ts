import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AiJobPoller, injectAiJobPoller, POLL_ERROR_MESSAGE, PolledJob } from './ai-job-poller';

const INTERVAL = 2000;
const job = (status: string, progressText: string | null = null): PolledJob => ({ status, progressText });

describe('AiJobPoller', () => {
  let injector: EnvironmentInjector;
  let fetch: ReturnType<typeof vi.fn<(jobId: number) => Observable<PolledJob>>>;
  let onJob: ReturnType<typeof vi.fn<(job: PolledJob) => void>>;
  let onGone: ReturnType<typeof vi.fn<() => void>>;
  /** A fetch egymás utáni válaszai (az utolsó ismétlődik). */
  let responses: (() => Observable<PolledJob>)[];

  function create(): AiJobPoller<PolledJob> {
    fetch = vi.fn(() => (responses.length > 1 ? responses.shift()! : responses[0])());
    onJob = vi.fn();
    onGone = vi.fn();
    injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    return runInInjectionContext(injector, () =>
      injectAiJobPoller<PolledJob>({ intervalMs: INTERVAL, activeStatuses: new Set(['queued', 'running']), fetch, onJob, onGone }),
    );
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('azonnal, majd intervallumonként lekérdez, amíg a job aktív; a haladás-szöveget frissíti, az első nem aktív válasz után leáll', () => {
    responses = [() => of(job('queued', 'Sorban áll…')), () => of(job('running', 'Fut…')), () => of(job('done', 'Kész'))];
    const poller = create();
    poller.poll(7);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(7);
    expect(poller.jobId()).toBe(7);
    expect(poller.progressText()).toBe('Sorban áll…');

    vi.advanceTimersByTime(INTERVAL - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(poller.progressText()).toBe('Fut…');
    vi.advanceTimersByTime(INTERVAL);
    expect(onJob).toHaveBeenCalledTimes(3);
    expect(onJob).toHaveBeenLastCalledWith(job('done', 'Kész'));

    vi.advanceTimersByTime(INTERVAL * 5);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(poller.jobId()).toBe(7);
  });

  it('átmeneti hibánál intervallumonként legfeljebb 3-szor próbálja újra, utána hibát jelez (a 404-et nem)', () => {
    responses = [() => throwError(() => ({ status: 500 }))];
    const poller = create();
    poller.poll(7);
    vi.advanceTimersByTime(INTERVAL * 3);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(poller.error()).toBe(POLL_ERROR_MESSAGE);
    expect(onGone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INTERVAL * 5);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('sikeres válasz után az újrapróbálás-számláló nullázódik', () => {
    const fail = () => throwError(() => ({ status: 0 }));
    responses = [fail, fail, () => of(job('running')), fail, fail, fail, () => of(job('done'))];
    const poller = create();
    poller.poll(7);
    vi.advanceTimersByTime(INTERVAL * 6);
    expect(poller.error()).toBeNull();
    expect(onJob).toHaveBeenLastCalledWith(job('done'));
  });

  it('a szerver hibaüzenetét mutatja, ha van', () => {
    responses = [() => throwError(() => ({ status: 400, error: { errorMessage: 'Nincs jogod.' } }))];
    const poller = create();
    poller.poll(7);
    vi.advanceTimersByTime(INTERVAL * 3);
    expect(poller.error()).toBe('Nincs jogod.');
  });

  it('404-nél azonnal onGone, újrapróbálás nélkül', () => {
    responses = [() => throwError(() => ({ status: 404 }))];
    const poller = create();
    poller.poll(7);
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(poller.error()).toBeNull();
    vi.advanceTimersByTime(INTERVAL * 5);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('új poll az előző (folyamatban lévő) kérést megszakítja, és törli a haladást és a hibát', () => {
    const pending = new Subject<PolledJob>();
    responses = [() => pending, () => of(job('running'))];
    const poller = create();
    poller.poll(7);
    expect(pending.observed).toBe(true);
    poller.poll(8);
    expect(pending.observed).toBe(false);
    expect(fetch).toHaveBeenLastCalledWith(8);
    expect(poller.jobId()).toBe(8);
  });

  it('stop leállítja a lekérdezést, de a job azonosítója megmarad; clear el is felejti', () => {
    const pending = new Subject<PolledJob>();
    responses = [() => pending];
    const poller = create();
    poller.poll(7);
    poller.stop();
    expect(pending.observed).toBe(false);
    expect(poller.jobId()).toBe(7);
    vi.advanceTimersByTime(INTERVAL * 5);
    expect(fetch).toHaveBeenCalledTimes(1);
    poller.clear();
    expect(poller.jobId()).toBeNull();
  });

  it('a gazda megszűnésekor leáll', () => {
    const pending = new Subject<PolledJob>();
    responses = [() => pending];
    const poller = create();
    poller.poll(7);
    injector.destroy();
    expect(pending.observed).toBe(false);
  });
});
