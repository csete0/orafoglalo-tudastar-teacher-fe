import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AsztaliFeladatComponent, DESKTOP_POLL_MS } from './asztali-feladat.component';
import { TeacherDesktopTaskService } from '../../services/teacher-desktop-task/teacher-desktop-task.service';
import { ReportService } from '../../services/report/report.service';
import { ToastService } from '../../shared/toast/toast.service';
import { DesktopTaskItem, DesktopTaskJobDto, desktopTaskProblems } from '../../models/desktop-task.model';
import { AiHelperQuotaDto } from '../../shared/ai-helper-quota.util';

const QUOTA: AiHelperQuotaDto = {
  month: '2026-10', premium: true, quizSource: { used: 0, limit: 60 }, testFeedback: { used: 0, limit: 600 },
  codeComments: { used: 0, limit: 200 }, desktopTask: { used: 2, limit: 20 },
};

function item(title: string): DesktopTaskItem {
  return {
    title,
    description: `Készítsen ${title} alkalmazást.\n\nBeadás: zip + képernyőkép.`,
    steps: ['Helyezze el a vezérlőket.', 'Kezelje a gombot.'],
    rubric: [{ text: 'Vezérlők', points: 3 }, { text: 'Esemény', points: 3 }, { text: 'Ellenőrzés', points: 4 }],
    reference: 'Form1, Button1_Click.',
  };
}

function job(overrides: Partial<DesktopTaskJobDto> = {}): DesktopTaskJobDto {
  return {
    jobId: 5, status: 'done', progressText: 'Kész', error: null, createdAt: '', updatedAt: '', expiresAt: '', appliedTaskId: null,
    request: { topic: 'Könyvtár', level: 'kozep', count: 2, framework: 'wpf' },
    result: { proposal: { tasks: [item('Egy'), item('Ketto')] }, model: 'm' },
    ...overrides,
  };
}

describe('AsztaliFeladatComponent', () => {
  let service: Record<'startJob' | 'getJob' | 'getActiveJob' | 'dismiss' | 'apply', ReturnType<typeof vi.fn>>;
  let toast: { success: ReturnType<typeof vi.fn> };

  function create(opts: { active?: DesktopTaskJobDto | null; quota?: AiHelperQuotaDto } = {}) {
    service = {
      startJob: vi.fn(() => of({ jobId: 5, status: 'queued', quota: { used: 3, limit: 20 } })),
      getJob: vi.fn(() => of(opts.active ?? job())),
      getActiveJob: vi.fn(() => of(opts.active ?? null)),
      dismiss: vi.fn(() => of(undefined)),
      apply: vi.fn(() => of({ taskIds: [41, 42], saved: ['2 asztali feladat'] })),
    };
    toast = { success: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AsztaliFeladatComponent],
      providers: [
        { provide: TeacherDesktopTaskService, useValue: service },
        { provide: ReportService, useValue: { getAiHelperQuota: vi.fn(() => of(opts.quota ?? QUOTA)) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(AsztaliFeladatComponent);
    fixture.componentRef.setInput('taskSetId', 7);
    fixture.detectChanges();
    const saved = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    return { fixture, c: fixture.componentInstance, saved, closed };
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  afterEach(() => TestBed.resetTestingModule());

  it('a téma 3-200 karakter, a darabszám 1-8 - csak ekkor indítható; a havi keret látszik', () => {
    const { fixture, c } = create();
    expect(q(fixture, 'dt-quota')!.textContent).toContain('18 / 20');
    expect(c.canStart()).toBe(false);
    c.topic.set('ab');
    expect(c.canStart()).toBe(false);
    c.topic.set('Iskolai könyvtár');
    expect(c.canStart()).toBe(true);
    c.count.set(9);
    expect(c.canStart()).toBe(false);
    c.count.set(0);
    expect(c.canStart()).toBe(false);
    c.count.set(8);
    c.topic.set('x'.repeat(201));
    expect(c.canStart()).toBe(false);
  });

  it('JavaFX-opció: a választóban megjelenik, és a kérésben elküldődik', () => {
    const { fixture, c } = create();
    c.topic.set('Iskolai könyvtár');
    fixture.detectChanges();
    const select = q(fixture, 'dt-framework') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent!.trim())).toEqual([
      'WPF vagy WinForms (a diák választ)', 'WPF', 'WinForms', 'JavaFX (Java)',
    ]);
    select.selectedIndex = 3;
    select.dispatchEvent(new Event('change'));
    expect(c.framework()).toBe('javafx');
    c.start();
    expect(service.startJob).toHaveBeenCalledWith(7, { topic: 'Iskolai könyvtár', level: 'kozep', count: 3, framework: 'javafx' });
  });

  it('nem prémium tanárnak a készítés tiltott, magyarázattal', () => {
    const { fixture, c } = create({ quota: { ...QUOTA, premium: false } });
    c.topic.set('Könyvtár');
    fixture.detectChanges();
    expect(q(fixture, 'dt-blocked')).not.toBeNull();
    expect(c.canStart()).toBe(false);
  });

  it('indítás → lekérdezés → szerkeszthető előnézet → mentés', () => {
    vi.useFakeTimers();
    try {
      const { fixture, c, saved, closed } = create();
      service.getJob.mockReturnValueOnce(of(job({ status: 'generating', result: null, progressText: 'Az MI írja a feladatokat…' })));
      c.topic.set('  Iskolai könyvtár ');
      c.level.set('emelt');
      c.count.set(2);
      c.framework.set('winforms');
      c.start();
      expect(service.startJob).toHaveBeenCalledWith(7, { topic: 'Iskolai könyvtár', level: 'emelt', count: 2, framework: 'winforms' });
      fixture.detectChanges();
      expect(q(fixture, 'dt-running')!.textContent).toContain('Az MI írja a feladatokat');
      vi.advanceTimersByTime(DESKTOP_POLL_MS);
      fixture.detectChanges();
      expect(c.step()).toBe('preview');
      expect(q(fixture, 'dt-tab-1')).not.toBeNull();
      expect(c.proposal()!.tasks.map((t) => t.title)).toEqual(['Egy', 'Ketto']);

      // Szerkesztés: a pontösszeg kilóg → nem menthető, hibalistával; javítás után igen.
      c.patchItem(0, 2, { points: 12 });
      fixture.detectChanges();
      expect(c.canSave()).toBe(false);
      expect(q(fixture, 'dt-problems')!.textContent).toContain('2-10 pont');
      c.patchItem(0, 2, { points: 5 });
      c.patchTask(0, { title: 'Egy (javított)' });
      c.addStep(1);
      c.setStep(1, 2, 'Mentse fájlba.');
      fixture.detectChanges();
      expect(c.canSave()).toBe(true);

      (q(fixture, 'dt-save') as HTMLButtonElement).click();
      const sent = service.apply.mock.calls[0][2];
      expect(service.apply.mock.calls[0].slice(0, 2)).toEqual([7, 5]);
      expect(sent.tasks[0].title).toBe('Egy (javított)');
      expect(sent.tasks[0].rubric[2].points).toBe(5);
      expect(sent.tasks[1].steps).toEqual(['Helyezze el a vezérlőket.', 'Kezelje a gombot.', 'Mentse fájlba.']);
      expect(toast.success).toHaveBeenCalled();
      expect(saved).toHaveBeenCalledWith(41);
      expect(closed).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('megnyitáskor a még nem mentett jobhoz kapcsolódik vissza; a feladat elhagyható', () => {
    const { fixture, c } = create({ active: job() });
    expect(service.getJob).toHaveBeenCalledWith(7, 5);
    fixture.detectChanges();
    expect(c.step()).toBe('preview');
    expect(c.topic()).toBe('Könyvtár');
    c.active.set(1);
    c.removeTask(1);
    expect(c.proposal()!.tasks.map((t) => t.title)).toEqual(['Egy']);
    expect(c.active()).toBe(0);
  });

  it('a sikertelen generálás a szerver üzenetével az űrlapra visz vissza', () => {
    const { fixture, c } = create();
    service.getJob.mockReturnValue(of(job({ status: 'failed', result: null, error: 'Az MI most nem adott használható feladatsort - próbáld újra. A keretedet visszakaptad.' })));
    c.topic.set('Könyvtár');
    c.start();
    fixture.detectChanges();
    expect(c.step()).toBe('input');
    expect(q(fixture, 'dt-error')!.textContent).toContain('visszakaptad');
  });

  it('a már futó generáláshoz csatlakozik (ugyanazon a feladatsoron); keret-hibánál a BE mondata', () => {
    const { c } = create();
    c.topic.set('Könyvtár');
    service.startJob.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400, error: { errorType: 'DesktopTaskAlreadyRunning', details: { jobId: 9, taskSetId: 7 } } })));
    c.start();
    expect(service.getJob).toHaveBeenCalledWith(7, 9);

    TestBed.resetTestingModule();
    const second = create();
    second.c.topic.set('Könyvtár');
    service.startJob.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400, error: { errorType: 'AiHelperQuotaExceeded', errorMessage: 'Elfogyott a havi kereted (20 asztali feladatsor-generálás / hó).' } })));
    second.c.start();
    expect(second.c.startError()).toContain('Elfogyott a havi kereted (20');
  });

  it('elvetés: a job eltűnik, vissza az űrlapra', () => {
    const { fixture, c } = create({ active: job() });
    fixture.detectChanges();
    (q(fixture, 'dt-discard') as HTMLButtonElement).click();
    expect(service.dismiss).toHaveBeenCalledWith(7, 5);
    expect(c.step()).toBe('input');
    expect(c.proposal()).toBeNull();
  });

  it('desktopTaskProblems: a szerver szabályai a kliensen', () => {
    expect(desktopTaskProblems(item('Egy'))).toEqual([]);
    expect(desktopTaskProblems({ ...item('Egy'), rubric: [{ text: 'a', points: 1 }, { text: 'b', points: 9 }] })[0]).toContain('2-10 pont');
    expect(desktopTaskProblems({ ...item('Egy'), rubric: [{ text: 'a', points: 3 }, { text: 'b', points: 3 }] })[0]).toContain('8 és 15');
    expect(desktopTaskProblems({ ...item('Egy'), steps: [] })[0]).toContain('feladatpont');
    expect(desktopTaskProblems({ ...item('Egy'), reference: ' ' })[0]).toContain('megoldási vázlat');
  });

  it('lekérdezés közben 404: lejárt generálás, vissza az űrlapra a magyarázattal', () => {
    const { fixture, c } = create();
    service.getJob.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    c.topic.set('Könyvtár');
    c.start();
    fixture.detectChanges();
    expect(c.step()).toBe('input');
    expect(q(fixture, 'dt-error')!.textContent).toContain('24 óra után lejár');
    expect(service.getJob).toHaveBeenCalledTimes(1);
  });

  it('átmeneti lekérdezési hiba: háromszor újrapróbál, utána a futás-nézetben jelzi', () => {
    vi.useFakeTimers();
    try {
      const { fixture, c } = create();
      service.getJob.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      c.topic.set('Könyvtár');
      c.start();
      vi.advanceTimersByTime(DESKTOP_POLL_MS * 3);
      fixture.detectChanges();
      expect(service.getJob).toHaveBeenCalledTimes(4);
      expect(c.step()).toBe('running');
      expect(q(fixture, 'dt-poll-error')!.textContent).toContain('Az állapot lekérdezése nem sikerült');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a közös dialógus-héjon: Escape bezár és leállítja a lekérdezést; a cím a dialógus címkéje', () => {
    vi.useFakeTimers();
    try {
      const { fixture, c, closed } = create();
      service.getJob.mockReturnValue(of(job({ status: 'generating', result: null })));
      c.topic.set('Könyvtár');
      c.start();
      fixture.detectChanges();
      const dialog = q(fixture, 'dt-dialog')!;
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(fixture.nativeElement.querySelector('#' + dialog.getAttribute('aria-labelledby'))!.textContent).toContain('Asztali feladatsor témából');
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(closed).toHaveBeenCalledTimes(1);
      const calls = service.getJob.mock.calls.length;
      vi.advanceTimersByTime(DESKTOP_POLL_MS * 3);
      expect(service.getJob.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
