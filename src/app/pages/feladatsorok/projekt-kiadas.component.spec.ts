import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ProjektKiadasComponent } from './projekt-kiadas.component';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { ReportService } from '../../services/report/report.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import {
  CodeCommentSuggestionDto,
  CodeCommentSuggestionsResponse,
  CodeCommentThreadDto,
  ProjectAssignmentStudentDto,
  ProjectAssignmentStudentsDto,
} from '../../models/teacher-project.model';

const step = (orderNo: number, passed: boolean, independence: 'onallo' | 'kis-segitseggel' | 'segitseggel' | null = null) =>
  ({ orderNo, passed, passedAt: null, independence, checks: passed ? 2 : 0, hint1: independence === 'kis-segitseggel' ? 1 : 0, hint2: 0, hint3: 0 });
const student = (userId: number, name: string, current: number | null, steps: ReturnType<typeof step>[], full = true): ProjectAssignmentStudentDto =>
  ({ userId, name, runtime: current === null ? null : 'browser-python', currentMilestoneOrder: current, completedAt: null, lastActivityAt: null,
     hasFullAccess: full, aiTokens30: 120, steps });

const view: ProjectAssignmentStudentsDto = {
  assignment: { id: 7, projectSlug: 'bufe', projectTitle: 'Büfé-rendelő', groupId: 1, groupName: '11.B', assignedAt: '', opensAt: null, dueAt: null,
    runtime: null, isTest: false, timeLimitSeconds: null, memberCount: 3, startedCount: 2, completedCount: 0, membersWithoutFullAccess: 1, milestoneCount: 3, freeMilestoneCount: 2 },
  milestones: [1, 2, 3].map((o) => ({ orderNo: o, title: `Lépés ${o}`, kind: 'build', estimatedMinutes: 30, examAreas: [] })),
  students: [
    student(1, 'Anna', 3, [step(1, true, 'onallo'), step(2, true, 'kis-segitseggel'), step(3, false)]),
    student(2, 'Bence', 2, [step(1, true, 'segitseggel'), step(2, false), step(3, false)], false),
    student(3, 'Csilla', null, [step(1, false), step(2, false), step(3, false)]),
  ],
};

const thread = (id: number, line: number, lineText: string, over: Partial<CodeCommentThreadDto> = {}): CodeCommentThreadDto =>
  ({ id, path: 'backend/app.py', line, lineText, body: `megjegyzés ${id}`, authorName: 'Kovács tanár', authorIsTeacher: true,
     createdAt: '2026-10-01T09:00:00', resolvedAt: null, replies: [], ...over });
const sugg = (path: string, line: number, lineText: string, severity: CodeCommentSuggestionDto['severity'], text: string): CodeCommentSuggestionDto =>
  ({ path, line, lineText, severity, text });
const response = (suggestions: CodeCommentSuggestionDto[], over: Partial<CodeCommentSuggestionsResponse> = {}): CodeCommentSuggestionsResponse =>
  ({ suggestions, reviewedPaths: [...new Set(suggestions.map((x) => x.path))], truncatedPaths: [], skippedFiles: [], droppedCount: 0,
     model: 'openai/gpt-4o', quota: { used: 5, limit: 200 }, ...over });

describe('ProjektKiadasComponent (osztály-nézet)', () => {
  async function setup(opts: { premium?: boolean; quotaUsed?: number; confirm?: boolean; diak?: string } = {}) {
    let nextId = 9;
    const api = {
      students: vi.fn(() => of(view)),
      studentCode: vi.fn(() => of({ projectTitle: 'Büfé', runtime: 'browser-python',
        files: { 'backend/app.py': 'print(1)\r\nx = 2\n', 'backend/seged.py': 'def f():\n  return 1\n' }, readOnlyPaths: [], createdAt: '' })),
      comments: vi.fn(() => of([thread(5, 1, 'print(1)'), thread(6, 2, 'x = 1', { resolvedAt: '2026-10-01T10:00:00' })])),
      createComment: vi.fn((_a: number, _u: number, path: string, line: number, body: string): Observable<CodeCommentThreadDto> =>
        of(thread(9, line, '', { body, path }))),
      replyComment: vi.fn(() => of(thread(5, 1, 'print(1)', { replies: [{ id: 10, body: 'Javítom', authorName: 'Anna', authorIsTeacher: false, createdAt: '' }] }))),
      commentSuggestions: vi.fn((): Observable<CodeCommentSuggestionsResponse> => of(response([]))),
    };
    const reports = { getAiHelperQuota: vi.fn(() => of({ month: '2026-10', premium: opts.premium ?? true, quizSource: { used: 0, limit: 60 },
      testFeedback: { used: 0, limit: 600 }, codeComments: { used: opts.quotaUsed ?? 3, limit: 200 } })) };
    const confirm = { ask: vi.fn().mockResolvedValue(opts.confirm ?? true) };
    TestBed.configureTestingModule({ imports: [ProjektKiadasComponent], providers: [provideRouter([]), { provide: TeacherProjectService, useValue: api },
      { provide: ReportService, useValue: reports }, { provide: ConfirmService, useValue: confirm }] });
    const fixture = TestBed.createComponent(ProjektKiadasComponent);
    fixture.componentRef.setInput('id', '7');
    if (opts.diak) fixture.componentRef.setInput('diak', opts.diak);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    api.createComment.mockImplementation((_a, _u, path, line, body) => of(thread(nextId++, line, '', { body, path })));
    return { fixture, el: fixture.nativeElement as HTMLElement, api, reports, confirm, cmp: fixture.componentInstance };
  }

  async function openStudent(name: string, ctx: Awaited<ReturnType<typeof setup>>) {
    [...ctx.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === name)!.click();
    await ctx.fixture.whenStable();
    ctx.fixture.detectChanges();
  }

  const button = (el: HTMLElement, text: string, root = '') =>
    [...el.querySelectorAll<HTMLButtonElement>(`${root} button`)].find((b) => b.textContent!.trim() === text)!;

  it('technikumi projektnél a diák választott nyelvét mutatja, nem a REST-futtatót (staging 10-23)', async () => {
    const { cmp } = await setup();
    const tech = (desktopLanguage: 'csharp' | 'java' | null): ProjectAssignmentStudentDto =>
      ({ ...student(4, 'Dóra', 1, []), runtime: 'judge0-aspnet', desktopLanguage });
    expect(cmp.languageLabel(tech('java'))).toBe('Java');
    expect(cmp.languageLabel(tech('csharp'))).toBe('C#');
    expect(cmp.languageLabel(tech(null))).toBe('C# (ASP.NET Core)');
    expect(cmp.languageLabel(student(3, 'Csilla', null, []))).toBe('még nem kezdte');
  });

  it('mátrix az önállósággal, folyamatban és még-nem állapottal; összesítő és a legnagyobb lemorzsolódás', async () => {
    const { el } = await setup();
    const cells = (id: number) => [...el.querySelectorAll(`[data-testid="student-${id}"] .cell-dot`)].map((c) => c.className.replace('cell-dot ', ''));
    expect(cells(1)).toEqual(['cell--onallo', 'cell--kis-segitseggel', 'cell--folyamatban']);
    expect(cells(2)).toEqual(['cell--segitseggel', 'cell--folyamatban', 'cell--nincs']);
    expect(cells(3)).toEqual(['cell--nincs', 'cell--nincs', 'cell--nincs']);
    expect(el.querySelector('[data-testid="student-2"]')?.textContent).toContain('ingyenes lépésekig');
    expect([...el.querySelectorAll('tfoot td')].slice(1, 4).map((td) => td.textContent!.trim())).toEqual(['2/3', '1/3', '0/3']);
    expect(el.querySelector('[data-testid="worst-drop"]')?.textContent).toContain('2. lépésnél');
  });

  it('a diák nevére kattintva a kódja csak olvasva', async () => {
    const { fixture, el, api } = await setup();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Anna')!.click();
    fixture.detectChanges();
    expect(api.studentCode).toHaveBeenCalledWith(7, 1);
    expect(el.querySelector('[data-testid="code-view"]')?.textContent).toContain('print(1)');
  });

  it('a „diak” query-paraméter (vizsgarész-térképről) betöltéskor megnyitja a diák kódját', async () => {
    const { el, api } = await setup({ diak: '1' });
    expect(api.studentCode).toHaveBeenCalledWith(7, 1);
    expect(el.querySelector('[data-testid="student-code"]')?.textContent).toContain('Anna kódja');
  });

  it('a „diak” paraméter olyan diákra, aki még nem kezdte, nem nyit kódot', async () => {
    const { el, api } = await setup({ diak: '3' });
    expect(api.studentCode).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="student-code"]')).toBeNull();
  });

  it('fájlváltás megszünteti a nyitott új megjegyzést', async () => {
    const { fixture, el } = await setup({ diak: '1' });
    el.querySelector<HTMLButtonElement>('[aria-label="Megjegyzés a(z) 2. sorhoz"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="new-comment"]')).not.toBeNull();
    fixture.componentInstance.selectFile('backend/app.py');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="new-comment"]')).toBeNull();
  });

  it('sorszámozott kód a megjegyzés-szálakkal: elavult jelölés, új megjegyzés egy sorra, válasz', async () => {
    const { fixture, el, api } = await setup();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Anna')!.click();
    fixture.detectChanges();
    expect(api.comments).toHaveBeenCalledWith(7, 1);
    expect(el.querySelectorAll('.code-line').length).toBe(3);
    expect(el.querySelector('[data-testid="thread-5"] [data-testid="thread-outdated"]')).toBeNull();
    expect(el.querySelector('[data-testid="thread-6"]')?.textContent).toContain('elavult');
    expect(el.querySelector('[data-testid="thread-6"]')?.textContent).toContain('megoldva');
    expect(el.querySelector('.comment-count')?.textContent?.trim()).toBe('1');

    el.querySelector<HTMLButtonElement>('[aria-label="Megjegyzés a(z) 2. sorhoz"]')!.click();
    fixture.detectChanges();
    const box = el.querySelector<HTMLTextAreaElement>('[data-testid="new-comment"] textarea')!;
    box.value = '  Miért 2?  ';
    el.querySelector('[data-testid="new-comment"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createComment).toHaveBeenCalledWith(7, 1, 'backend/app.py', 2, 'Miért 2?');
    expect(el.querySelector('[data-testid="new-comment"]')).toBeNull();
    expect(el.querySelector('[data-testid="thread-9"]')?.textContent).toContain('Miért 2?');

    const reply = el.querySelector<HTMLInputElement>('[data-testid="thread-5"] input')!;
    reply.value = 'Nézd meg újra';
    el.querySelector('[data-testid="thread-5"] form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.replyComment).toHaveBeenCalledWith(7, 1, 5, 'Nézd meg újra');
    expect(el.querySelector('[data-testid="thread-5"]')?.textContent).toContain('Anna (diák): Javítom');
    expect(reply.value).toBe('');
  });

  describe('AI-javaslatok', () => {
    it('keret és prémium: a havi keret látszik; prémium nélkül vagy elfogyott kerettel a kérés tiltva', async () => {
      let ctx = await setup();
      await openStudent('Anna', ctx);
      expect(ctx.el.querySelector('[data-testid="suggest-quota"]')?.textContent).toContain('még 197/200');
      expect(ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.disabled).toBe(false);
      TestBed.resetTestingModule();

      ctx = await setup({ premium: false });
      await openStudent('Anna', ctx);
      expect(ctx.el.querySelector('[data-testid="suggest-block"]')?.textContent).toContain('Prémium');
      expect(ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.disabled).toBe(true);
      TestBed.resetTestingModule();

      ctx = await setup({ quotaUsed: 200 });
      await openStudent('Anna', ctx);
      expect(ctx.el.querySelector('[data-testid="suggest-block"]')?.textContent).toContain('Elfogyott a havi kereted');
      expect(ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.disabled).toBe(true);
    });

    it('a BE prémium-/keret-hibája tiltja a további kérést, a keret mondatával', async () => {
      const ctx = await setup();
      await openStudent('Anna', ctx);
      ctx.api.commentSuggestions.mockReturnValue(throwError(() => ({ status: 400,
        error: { errorType: 'AiHelperQuotaExceeded', errorMessage: 'Elfogyott a havi keret (200 kérés).' } })));
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.fixture.detectChanges();
      expect(ctx.el.querySelector('[data-testid="suggest-block"]')?.textContent).toContain('Elfogyott a havi keret (200 kérés).');
      expect(ctx.el.querySelector('[data-testid="suggest-quota"]')?.textContent).toContain('még 0/200');
      expect(ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.disabled).toBe(true);
    });

    it('kérés a megnyitott fájlra → a során és az oldalsó listában, súlyosság-jelvénnyel; elfogadás a meglévő megjegyzés-végponttal', async () => {
      const ctx = await setup();
      await openStudent('Anna', ctx);
      ctx.api.commentSuggestions.mockReturnValue(of(response([
        sugg('backend/app.py', 2, 'x = 2', 'hiba', 'Miért pont 2?'),
        sugg('backend/app.py', 1, 'print(1)', 'dicséret', 'Ügyes kiírás!'),
      ], { skippedFiles: [{ path: 'logo.png', reason: 'nem szöveges fájl' }] })));
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.fixture.detectChanges();
      expect(ctx.api.commentSuggestions).toHaveBeenCalledWith(7, 1, ['backend/app.py']);
      expect(ctx.el.querySelector('[data-testid="suggest-quota"]')?.textContent).toContain('még 195/200');
      expect(ctx.el.querySelector('[data-testid="suggest-status"]')?.textContent).toContain('2 AI-javaslat érkezett. Kimaradt: logo.png (nem szöveges fájl).');

      const cards = [...ctx.el.querySelectorAll('[data-testid="code-view"] .suggestion')];
      // a saját sora után jelenik meg (a sor szálai után), nem valódi megjegyzésként
      const rows = [...ctx.el.querySelectorAll('[data-testid="code-view"] > *')];
      const codeLines = [...ctx.el.querySelectorAll('.code-line')];
      expect(rows.indexOf(cards[0])).toBeGreaterThan(rows.indexOf(codeLines[0]));
      expect(rows.indexOf(cards[0])).toBeLessThan(rows.indexOf(codeLines[1]));
      expect(rows.indexOf(cards[1])).toBeGreaterThan(rows.indexOf(codeLines[1]));
      expect(cards[1].classList.contains('thread')).toBe(false);
      expect(cards.map((c) => c.querySelector('.sev')!.textContent!.trim())).toEqual(['dicséret', 'hiba']);
      expect(cards[1].querySelector('.sev')!.className).toContain('sev--hiba');
      expect(ctx.el.querySelectorAll('[data-testid="suggest-list"] li').length).toBe(2);
      expect(ctx.el.querySelector('.suggestion-count')?.textContent?.trim()).toBe('2');
      expect(ctx.cmp.hasPendingSuggestions()).toBe(true);

      button(cards[1] as HTMLElement, 'Elfogad').click();
      ctx.fixture.detectChanges();
      expect(ctx.api.createComment).toHaveBeenCalledWith(7, 1, 'backend/app.py', 2, 'Miért pont 2?');
      expect(ctx.el.querySelectorAll('[data-testid="code-view"] .suggestion').length).toBe(1);
      expect([...ctx.el.querySelectorAll('[data-testid="code-view"] .thread')].some((t) => t.textContent!.includes('Miért pont 2?'))).toBe(true);
    });

    it('szerkesztés után a módosított szöveggel fogad el; az elvetés nem hív API-t', async () => {
      const ctx = await setup();
      await openStudent('Anna', ctx);
      ctx.api.commentSuggestions.mockReturnValue(of(response([
        sugg('backend/app.py', 1, 'print(1)', 'javaslat', 'Írj ki többet.'),
        sugg('backend/app.py', 2, 'x = 2', 'hiba', 'Rossz érték.'),
      ])));
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.fixture.detectChanges();
      const [one, two] = [...ctx.el.querySelectorAll<HTMLElement>('[data-testid="code-view"] .suggestion')];
      button(one, 'Szerkeszt').click();
      ctx.fixture.detectChanges();
      const box = one.querySelector<HTMLTextAreaElement>('textarea')!;
      expect(box.value).toBe('Írj ki többet.');
      box.value = '  Írd ki az összeget is!  ';
      one.querySelector('form')!.dispatchEvent(new Event('submit'));
      ctx.fixture.detectChanges();
      expect(ctx.api.createComment).toHaveBeenCalledWith(7, 1, 'backend/app.py', 1, 'Írd ki az összeget is!');

      button(two, 'Elvet').click();
      ctx.fixture.detectChanges();
      expect(ctx.api.createComment).toHaveBeenCalledTimes(1);
      expect(ctx.el.querySelector('.suggestion')).toBeNull();
      expect(ctx.cmp.hasPendingSuggestions()).toBe(false);
    });

    it('„Mind elfogad” megerősítés után sorban menti az összeset (minden fájlból); elutasításnál semmit', async () => {
      const ctx = await setup({ confirm: false });
      await openStudent('Anna', ctx);
      ctx.el.querySelector<HTMLInputElement>('input[value="all"]')!.dispatchEvent(new Event('change'));
      ctx.api.commentSuggestions.mockReturnValue(of(response([
        sugg('backend/app.py', 2, 'x = 2', 'hiba', 'A'),
        sugg('backend/seged.py', 2, '  return 1', 'javaslat', 'B'),
      ])));
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.fixture.detectChanges();
      expect(ctx.api.commentSuggestions).toHaveBeenCalledWith(7, 1, null);

      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-accept-all"]')!.click();
      await ctx.fixture.whenStable();
      expect(ctx.confirm.ask).toHaveBeenCalled();
      expect(ctx.api.createComment).not.toHaveBeenCalled();

      ctx.confirm.ask.mockResolvedValue(true);
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-accept-all"]')!.click();
      await ctx.fixture.whenStable();
      ctx.fixture.detectChanges();
      expect(ctx.api.createComment.mock.calls.map((c) => c.slice(2))).toEqual([['backend/app.py', 2, 'A'], ['backend/seged.py', 2, 'B']]);
      expect(ctx.el.querySelector('[data-testid="suggest-list"]')).toBeNull();
      expect(ctx.cmp.comments().filter((c) => c.body === 'A' || c.body === 'B').length).toBe(2);
    });

    it('fájlváltás megszakítja a fájlra kért futó kérést; a késve érkező válasz nem jut be', async () => {
      const ctx = await setup();
      await openStudent('Anna', ctx);
      const pending = new Subject<CodeCommentSuggestionsResponse>();
      ctx.api.commentSuggestions.mockReturnValue(pending);
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.fixture.detectChanges();
      expect(ctx.el.querySelector('[data-testid="suggest-status"]')?.textContent).toContain('átnézi');
      expect(pending.observed).toBe(true);

      button(ctx.el, 'backend/seged.py').click();
      ctx.fixture.detectChanges();
      expect(pending.observed).toBe(false);
      expect(ctx.el.querySelector('[data-testid="suggest-run"]')).not.toBeNull();
      pending.next(response([sugg('backend/app.py', 1, 'print(1)', 'hiba', 'késő')]));
      ctx.fixture.detectChanges();
      expect(ctx.cmp.suggestions()).toEqual([]);
    });

    it('megszakítás után vagy diákváltáskor a régi válasz elavult; diákváltás el nem fogadott javaslatokkal megerősítést kér', async () => {
      const ctx = await setup({ confirm: false });
      await openStudent('Anna', ctx);
      ctx.api.commentSuggestions.mockReturnValue(of(response([sugg('backend/app.py', 1, 'print(1)', 'hiba', 'X')])));
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.fixture.detectChanges();

      // Bence felé: elutasított megerősítés → marad Anna a javaslatokkal
      await openStudent('Bence', ctx);
      expect(ctx.confirm.ask).toHaveBeenCalledTimes(1);
      expect(ctx.api.studentCode).toHaveBeenCalledTimes(1);
      expect(ctx.cmp.suggestions().length).toBe(1);
      expect(await ctx.cmp.canLeave()).toBe(false);
      const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      ctx.cmp.onBeforeUnload(unload);
      expect(unload.defaultPrevented).toBe(true);

      // most egy futó kérés közben megerősítve vált: a késő válasz nem kerül Bencéhez
      const pending = new Subject<CodeCommentSuggestionsResponse>();
      ctx.api.commentSuggestions.mockReturnValue(pending);
      ctx.el.querySelector<HTMLInputElement>('input[value="all"]')!.dispatchEvent(new Event('change'));
      ctx.el.querySelector<HTMLButtonElement>('[data-testid="suggest-run"]')!.click();
      ctx.confirm.ask.mockResolvedValue(true);
      await openStudent('Bence', ctx);
      expect(ctx.api.studentCode).toHaveBeenLastCalledWith(7, 2);
      expect(pending.observed).toBe(false);
      pending.next(response([sugg('backend/app.py', 1, 'print(1)', 'hiba', 'Annáé')]));
      expect(ctx.cmp.suggestions()).toEqual([]);
      expect(ctx.cmp.canLeave()).toBe(true);
    });
  });
});
