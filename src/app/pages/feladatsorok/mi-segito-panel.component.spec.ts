import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AiCodeTaskQuotaDto } from '../../models/ai-code-task.model';
import { ReportService } from '../../services/report/report.service';
import { TeacherAiCodeTaskService } from '../../services/teacher-ai-code-task/teacher-ai-code-task.service';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { AI_HELPER_PREMIUM_TEXT, AI_HELPER_QUOTA_EXHAUSTED_TEXT, AiHelperQuotaDto } from '../../shared/ai-helper-quota.util';
import { MiSegitoPanelComponent, quotaState } from './mi-segito-panel.component';

const helper = (overrides: Partial<AiHelperQuotaDto> = {}): AiHelperQuotaDto => ({
  month: '2026-10', premium: true, quizSource: { used: 0, limit: 1 }, testFeedback: { used: 0, limit: 1 }, codeComments: { used: 0, limit: 1 },
  officeTask: { used: 3, limit: 20 }, desktopTask: { used: 20, limit: 20 }, ...overrides,
});

describe('MiSegitoPanelComponent', () => {
  let getAiHelperQuota: ReturnType<typeof vi.fn>;
  let getRubricQuota: ReturnType<typeof vi.fn>;
  let getQuota: ReturnType<typeof vi.fn>;

  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({
      imports: [MiSegitoPanelComponent],
      providers: [
        provideRouter([]),
        { provide: ReportService, useValue: { getAiHelperQuota } },
        { provide: TeacherRubricService, useValue: { getRubricQuota } },
        { provide: TeacherAiCodeTaskService, useValue: { getQuota } },
      ],
    });
    const fixture = TestBed.createComponent(MiSegitoPanelComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const button = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
  const text = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;

  beforeEach(() => {
    getAiHelperQuota = vi.fn(() => of(helper()));
    getRubricQuota = vi.fn(() => of({ used: 2, limit: 30, month: '2026-10' }));
    getQuota = vi.fn(() => of({ used: 1, limit: 30, month: '2026-10', isPremium: true }));
  });

  it('a három keretet egyszer tölti, és „used/limit” formában mutatja; elfogyott keretnél tilt, a BE-szöveggel', () => {
    const { el } = render({ selection: { label: '1. Prog', programming: true, sql: false } });
    expect(getAiHelperQuota).toHaveBeenCalledTimes(1);
    expect(getRubricQuota).toHaveBeenCalledTimes(1);
    expect(getQuota).toHaveBeenCalledTimes(1);

    expect(text(el, 'ai-quota-rubric')).toBe('havi keret: 2/30');
    expect(text(el, 'ai-quota-new')).toBe('havi keret: 1/30');
    expect(text(el, 'ai-quota-complete')).toBe('havi keret: 1/30');
    expect(text(el, 'ai-quota-office')).toBe('havi keret: 3/20');
    // Leírás · keret, a terv szerint; elfogyott keretnél a leírás marad, a szám helyén az ok.
    expect(text(el, 'ai-hint-rubric')!.replace(/\s+/g, ' ')).toBe('a feladatszövegből és a megoldásból · havi keret: 2/30');
    expect(text(el, 'ai-hint-desktop')).toBe('WPF / WinForms');
    expect(text(el, 'ai-quota-blocked-desktop')).toBe(AI_HELPER_QUOTA_EXHAUSTED_TEXT);
    expect(button(el, 'desktop-task-open').disabled).toBe(true);
    expect(button(el, 'office-task-open').disabled).toBe(false);
    expect(button(el, 'ai-complete-open').disabled).toBe(false);
  });

  it('nem prémium tanárnál a prémium-szöveg és tiltás (irodai, asztali, programozási)', () => {
    getAiHelperQuota.mockReturnValue(of(helper({ premium: false })));
    getQuota.mockReturnValue(of({ used: 0, limit: 0, month: '2026-10', isPremium: false }));
    const { el } = render();
    expect(text(el, 'ai-quota-blocked-office')).toBe(AI_HELPER_PREMIUM_TEXT);
    expect(text(el, 'ai-quota-blocked-new')).toBe(AI_HELPER_PREMIUM_TEXT);
    expect(button(el, 'office-task-open').disabled).toBe(true);
    expect(button(el, 'desktop-task-open').disabled).toBe(true);
    expect(button(el, 'ai-new-open').disabled).toBe(true);
  });

  it('keret-hiba esetén nincs szám, a gomb működik', () => {
    getAiHelperQuota.mockReturnValue(throwError(() => new Error('x')));
    getQuota.mockReturnValue(throwError(() => new Error('x')));
    const { el } = render();
    expect(el.querySelector('[data-testid="ai-quota-office"]')).toBeNull();
    expect(el.querySelector('[data-testid="ai-quota-new"]')).toBeNull();
    expect(button(el, 'office-task-open').disabled).toBe(false);
    expect(button(el, 'ai-new-open').disabled).toBe(false);
  });

  it('kijelölés nélkül a feladatszintű segítségek tiltottak vagy rejtettek', () => {
    const { el } = render();
    expect(el.querySelector('[data-testid="ai-panel-no-selection"]')!.textContent).toContain('Válassz feladatot a vázlatban');
    expect(button(el, 'ai-rubric-open').disabled).toBe(true);
    expect(el.querySelector('[data-testid="ai-complete-open"]')).toBeNull();
    expect(el.querySelector('[data-testid="sql-queries-open"]')).toBeNull();
  });

  it('SQL-feladat kijelölésekor a lekérdezés-segítség látszik; a gombok a megfelelő eseményt jelzik', () => {
    const { fixture, el } = render({ selection: { label: '2. SQL', programming: false, sql: true }, sqlAvailable: true });
    const events: string[] = [];
    const c = fixture.componentInstance;
    c.rubricRequested.subscribe(() => events.push('rubric'));
    c.sqlQueriesRequested.subscribe(() => events.push('sql-queries'));
    c.sqlFilesRequested.subscribe(() => events.push('sql-files'));
    c.aiTaskRequested.subscribe((mode) => events.push('ai-' + mode));
    c.officeTaskRequested.subscribe((kind) => events.push('office-' + kind));
    c.desktopTaskRequested.subscribe(() => events.push('desktop'));
    getAiHelperQuota.mockReturnValue(of(helper({ desktopTask: { used: 0, limit: 20 } })));
    fixture.componentRef.setInput('dialogOpen', true);
    fixture.detectChanges();
    fixture.componentRef.setInput('dialogOpen', false);
    fixture.detectChanges();

    for (const id of ['ai-rubric-open', 'sql-queries-open', 'ai-sql-files-open', 'ai-new-open', 'office-task-open', 'desktop-task-open']) button(el, id).click();
    expect(events).toEqual(['rubric', 'sql-queries', 'sql-files', 'ai-new', 'office-excel', 'desktop']);
    expect(el.querySelector('[data-testid="ai-complete-open"]')).toBeNull();
  });

  it('a hiányzó SQL-fájl sora csak SQL-es feladatsoron látszik', () => {
    expect(render().el.querySelector('[data-testid="ai-sql-files-open"]')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ sqlAvailable: true }).el.querySelector('[data-testid="ai-sql-files-open"]')).not.toBeNull();
  });

  it('reload() (pl. inline szempontlista-vázlat után) újratölti a kereteket, és elfogyott keretnél tilt', () => {
    const { fixture, el } = render({ selection: { label: '1. Prog', programming: true, sql: false } });
    getRubricQuota.mockReturnValue(of({ used: 30, limit: 30, month: '2026-10' }));
    fixture.componentInstance.reload();
    fixture.detectChanges();
    expect(getRubricQuota).toHaveBeenCalledTimes(2);
    expect(button(el, 'ai-rubric-open').disabled).toBe(true);
    expect(text(el, 'ai-quota-blocked-rubric')).toBe(AI_HELPER_QUOTA_EXHAUSTED_TEXT);
  });

  it('dialógus bezárása után (true → false) újratölti a kereteket', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('dialogOpen', true);
    fixture.detectChanges();
    expect(getAiHelperQuota).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('dialogOpen', false);
    fixture.detectChanges();
    expect(getAiHelperQuota).toHaveBeenCalledTimes(2);
    expect(getRubricQuota).toHaveBeenCalledTimes(2);
    expect(getQuota).toHaveBeenCalledTimes(2);
  });

  it('takedown alatt minden MI-gomb tiltott, a katalógus-link a ?katalogus=1-re mutat', () => {
    const { el } = render({ takedown: true, selection: { label: '1. Prog', programming: true, sql: true }, sqlAvailable: true });
    el.querySelectorAll('button').forEach((b) => expect(b.disabled, b.dataset['testid']).toBe(true));
    expect(el.querySelector('[data-testid="ai-panel-takedown"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ai-catalog-link"]')!.getAttribute('href')).toBe('/feladatsorok?katalogus=1');
  });

  it('töltés közben (busy) az SQL-gombok tiltottak, a többi nem', () => {
    const { el } = render({ busy: true, selection: { label: '1. Prog', programming: true, sql: true }, sqlAvailable: true });
    expect(button(el, 'sql-queries-open').disabled).toBe(true);
    expect(button(el, 'ai-sql-files-open').disabled).toBe(true);
    expect(button(el, 'ai-new-open').disabled).toBe(false);
  });

  it('UI-TT-239: amíg a keret-válasz nem érkezett meg, a prémiumhoz kötött gombok nem kattinthatók; ingyenes tanárnál utána is tiltva', () => {
    const helperResponse = new Subject<AiHelperQuotaDto>();
    const codeResponse = new Subject<AiCodeTaskQuotaDto>();
    getAiHelperQuota.mockReturnValue(helperResponse);
    getQuota.mockReturnValue(codeResponse);
    const { fixture, el } = render({ selection: { label: '1. Prog', programming: true, sql: false } });
    for (const id of ['ai-new-open', 'ai-complete-open', 'office-task-open', 'desktop-task-open']) expect(button(el, id).disabled, id).toBe(true);

    helperResponse.next(helper({ premium: false }));
    codeResponse.next({ used: 5, limit: 30, month: '2026-10', isPremium: false });
    fixture.detectChanges();
    for (const id of ['ai-new-open', 'ai-complete-open', 'office-task-open', 'desktop-task-open']) expect(button(el, id).disabled, id).toBe(true);
    expect(el.querySelector('[data-testid="ai-quota-new"]')).toBeNull();
    expect(text(el, 'ai-quota-blocked-new')).toBe(AI_HELPER_PREMIUM_TEXT);
  });

  it('UI-TT-239: egymást átfedő újratöltéseknél a késve érkező régi válasz nem írja felül az újat', () => {
    const first = new Subject<AiCodeTaskQuotaDto>();
    const second = new Subject<AiCodeTaskQuotaDto>();
    getQuota.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { fixture, el } = render();
    fixture.componentInstance.reload();
    second.next({ used: 0, limit: 0, month: '2026-10', isPremium: false });
    first.next({ used: 5, limit: 30, month: '2026-10', isPremium: true });
    fixture.detectChanges();
    expect(button(el, 'ai-new-open').disabled).toBe(true);
    expect(text(el, 'ai-quota-blocked-new')).toBe(AI_HELPER_PREMIUM_TEXT);
  });

  it('quotaState: prémium hiánya előbb, mint a keret; ismeretlen keretnél semmi', () => {
    expect(quotaState({ used: 1, limit: 2 }, false)).toEqual({ usage: null, blocked: AI_HELPER_PREMIUM_TEXT });
    expect(quotaState(null, true)).toEqual({ usage: null, blocked: null });
    expect(quotaState({ used: 2, limit: 2 }, undefined).blocked).toBe(AI_HELPER_QUOTA_EXHAUSTED_TEXT);
  });
});
