import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { KvizSzovegbolComponent, SOURCE_MAX_FILE_BYTES, sourceErrorMessage } from './kviz-szovegbol.component';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { QuizSourceResultDto, TeacherQuizQuestionDto } from '../../models/teacher-quiz.model';
import { ReportService } from '../../services/report/report.service';
import { AiHelperQuotaDto } from '../../shared/ai-helper-quota.util';

const QUOTA: AiHelperQuotaDto = { month: '2026-10', premium: true, quizSource: { used: 3, limit: 60 }, testFeedback: { used: 0, limit: 600 } };

const TOPICS = [
  { id: 3, name: 'Hálózatok' },
  { id: 7, name: 'SQL alapok' },
];
const LONG_TEXT = 'A hálózati protokollok szabályozzák az eszközök közötti adatcserét. '.repeat(5);

function question(id: number): TeacherQuizQuestionDto {
  return {
    id, topicId: 7, questionType: 'single', questionText: `Kérdés ${id}`, options: ['a', 'b'], correctAnswers: ['a'],
    explanation: 'Forrás: „…”', difficulty: 'Medium', isApproved: false, isAiGenerated: true, reportCount: 0,
  } as TeacherQuizQuestionDto;
}

function result(overrides: Partial<QuizSourceResultDto> = {}): QuizSourceResultDto {
  return {
    created: [question(1), question(2)],
    dropped: [{ reason: 'A forrás-idézet nem található szó szerint a megadott szövegben.', text: 'Mi a TCP?' }],
    sourceChars: 340,
    model: 'm',
    warnings: [],
    quota: { used: 4, limit: 60 },
    ...overrides,
  };
}

describe('KvizSzovegbolComponent', () => {
  let service: { generateFromSource: ReturnType<typeof vi.fn> };
  let reports: { getAiHelperQuota: ReturnType<typeof vi.fn> };

  function create(response: unknown = of(result()), initialTopicId: number | null = 7, quota: unknown = of(QUOTA)) {
    service = { generateFromSource: vi.fn(() => response) };
    reports = { getAiHelperQuota: vi.fn(() => quota) };
    TestBed.configureTestingModule({
      imports: [KvizSzovegbolComponent],
      providers: [{ provide: TeacherQuizService, useValue: service }, { provide: ReportService, useValue: reports }],
    });
    const fixture = TestBed.createComponent(KvizSzovegbolComponent);
    fixture.componentRef.setInput('quizId', 42);
    fixture.componentRef.setInput('topics', TOPICS);
    fixture.componentRef.setInput('initialTopicId', initialTopicId);
    fixture.detectChanges();
    const changed = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.componentInstance.closed.subscribe(closed);
    return { fixture, c: fixture.componentInstance, changed, closed };
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  afterEach(() => TestBed.resetTestingModule());

  it('dialógus-szerepkörrel nyílik, a kezdő témakör az AI-szekcióé; ismeretlen témakörnél nincs előválasztás', () => {
    const { fixture, c } = create();
    const dialog = q(fixture, 'quiz-source-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(c.topicId()).toBe(7);

    TestBed.resetTestingModule();
    expect(create(of(result()), 999).c.topicId()).toBeNull();
  });

  it('karakterszámláló; 200 karakter alatt és 30 000 felett nem indítható', () => {
    const { fixture, c } = create();
    c.text.set('rövid');
    fixture.detectChanges();
    expect(q(fixture, 'quiz-source-counter')!.textContent).toContain('5 / 30');
    expect(q(fixture, 'quiz-source-counter')!.textContent).toContain('legalább 200 kell');
    expect(c.canGenerate()).toBe(false);

    c.text.set(LONG_TEXT);
    expect(c.canGenerate()).toBe(true);

    c.text.set('x'.repeat(30_001));
    expect(c.canGenerate()).toBe(false);
  });

  it('témakör, típus és darabszám nélkül nem indítható', () => {
    const { c } = create(of(result()), null);
    c.text.set(LONG_TEXT);
    expect(c.canGenerate()).toBe(false);
    c.topicId.set(3);
    expect(c.canGenerate()).toBe(true);
    c.count.set(16);
    expect(c.canGenerate()).toBe(false);
    c.count.set(15);
    expect(c.canGenerate()).toBe(true);
    c.count.set(4);
    for (const t of ['single', 'multi', 'truefalse', 'cloze'] as const) c.toggleType(t);
    expect(c.canGenerate()).toBe(false);
  });

  it('szövegből: a beállításokkal hív, közben töltés; utána „N kérdés elkészült (jóváhagyásra vár)” és a kimaradtak okkal', () => {
    const pending = new Subject<QuizSourceResultDto>();
    const { fixture, c, changed } = create(pending);
    c.text.set(`  ${LONG_TEXT}  `);
    c.count.set(3);
    c.difficulty.set('Hard');
    c.toggleType('cloze');
    fixture.detectChanges();
    q(fixture, 'quiz-source-generate')!.click();
    fixture.detectChanges();

    expect(service.generateFromSource).toHaveBeenCalledWith(42, {
      text: LONG_TEXT.trim(), file: null, topicId: 7, count: 3, difficulty: 'Hard', questionTypes: ['single', 'multi', 'truefalse'],
    });
    expect(q(fixture, 'quiz-source-input')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Készülnek a kérdések');

    pending.next(result());
    pending.complete();
    fixture.detectChanges();

    expect(q(fixture, 'quiz-source-created')!.textContent).toContain('2 kérdés elkészült (jóváhagyásra vár)');
    const dropped = q(fixture, 'quiz-source-dropped')!;
    expect(dropped.textContent).toContain('Kimaradt kérdések (1)');
    expect(dropped.textContent).toContain('Mi a TCP?');
    expect(dropped.textContent).toContain('nem található szó szerint');
    expect(changed).toHaveBeenCalledWith(2);
  });

  it('egy kérdés sem ment át: visszatérítés jelzése, nincs újratöltés', () => {
    const { fixture, c, changed } = create(of(result({ created: [], refunded: true } as Partial<QuizSourceResultDto>)));
    c.text.set(LONG_TEXT);
    c.generate();
    fixture.detectChanges();
    expect(q(fixture, 'quiz-source-none')!.textContent).toContain('visszakaptad');
    expect(q(fixture, 'quiz-source-created')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('„Újabb kérdések”: vissza a beállításokhoz, a szöveg megmarad', () => {
    const { fixture, c } = create();
    c.text.set(LONG_TEXT);
    c.generate();
    fixture.detectChanges();
    q(fixture, 'quiz-source-again')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'quiz-source-input')).not.toBeNull();
    expect(c.text()).toBe(LONG_TEXT);
  });

  it('fájl: kiterjesztés és méret ellenőrzése, majd a fájllal hív (szöveg nélkül)', () => {
    const { fixture, c } = create();
    c.setMode('file');
    fixture.detectChanges();
    const pick = (file: File) => c.onFile({ target: { files: [file] } } as unknown as Event);

    pick(new File(['x'], 'kep.png'));
    fixture.detectChanges();
    expect(q(fixture, 'quiz-source-file-error')!.textContent).toContain('.txt, .docx vagy .pdf');
    expect(c.canGenerate()).toBe(false);

    const big = new File(['x'], 'nagy.pdf');
    Object.defineProperty(big, 'size', { value: SOURCE_MAX_FILE_BYTES + 1 });
    pick(big);
    expect(c.fileError()).toContain('túl nagy');

    const ok = new File(['tananyag'], 'Jegyzet.DOCX');
    pick(ok);
    expect(c.fileError()).toBeNull();
    c.generate();
    expect(service.generateFromSource.mock.calls[0][1]).toMatchObject({ text: null, file: ok });
  });

  it('hiba: a szerver üzenete; 429 és 413 érthető szöveggel', () => {
    const err = new HttpErrorResponse({ status: 400, error: { errorMessage: 'A szöveg legfeljebb 30000 karakter lehet.' } });
    const { fixture, c } = create(throwError(() => err));
    c.text.set(LONG_TEXT);
    c.generate();
    fixture.detectChanges();
    expect(q(fixture, 'quiz-source-error')!.textContent).toContain('legfeljebb 30000 karakter');
    expect(q(fixture, 'quiz-source-input')).not.toBeNull();

    expect(sourceErrorMessage({ status: 429 })).toContain('túl sok kérést');
    expect(sourceErrorMessage({ status: 413 })).toContain('10 MB');
  });

  it('bezárás futó kérés közben: megszakítja, a késő válasz nem ír, a szerkesztő újratölt', () => {
    const pending = new Subject<QuizSourceResultDto>();
    const { c, changed, closed } = create(pending);
    c.text.set(LONG_TEXT);
    c.generate();
    expect(pending.observed).toBe(true);

    c.close();
    expect(pending.observed).toBe(false);
    expect(c.generating()).toBe(false);
    expect(changed).toHaveBeenCalledWith(0);
    expect(closed).toHaveBeenCalledTimes(1);

    pending.next(result());
    expect(c.result()).toBeNull();
  });

  describe('Prémium és havi keret', () => {
    it('a hátralévő keretet mutatja, és a válasz kerete frissíti', () => {
      const { fixture, c } = create();
      expect(reports.getAiHelperQuota).toHaveBeenCalled();
      expect(q(fixture, 'quiz-source-quota')!.textContent).toContain('még 57 / 60 generálás');
      c.text.set(LONG_TEXT);
      c.generate();
      c.again();
      fixture.detectChanges();
      expect(q(fixture, 'quiz-source-quota')!.textContent).toContain('még 56 / 60');
    });

    it('nem Prémium tanár: magyarázat, a készítés tiltott', () => {
      const { fixture, c } = create(of(result()), 7, of({ ...QUOTA, premium: false }));
      c.text.set(LONG_TEXT);
      fixture.detectChanges();
      expect(q(fixture, 'quiz-source-blocked')!.textContent).toContain('Prémium tanári előfizetéssel');
      expect(c.canGenerate()).toBe(false);
    });

    it('elfogyott keret: magyarázat, a készítés tiltott; a keret-végpont hibája nem zavar', () => {
      const exhausted = create(of(result()), 7, of({ ...QUOTA, quizSource: { used: 60, limit: 60 } }));
      exhausted.c.text.set(LONG_TEXT);
      exhausted.fixture.detectChanges();
      expect(q(exhausted.fixture, 'quiz-source-blocked')!.textContent).toContain('Elfogyott a havi kereted (60 generálás / hó)');
      expect(exhausted.c.canGenerate()).toBe(false);

      TestBed.resetTestingModule();
      const failing = create(of(result()), 7, throwError(() => new HttpErrorResponse({ status: 500 })));
      failing.c.text.set(LONG_TEXT);
      expect(failing.c.canGenerate()).toBe(true);
      expect(q(failing.fixture, 'quiz-source-quota')).toBeNull();
    });

    it('a szerver prémium / keret hibája (errorType) is tiltó magyarázatra vált', () => {
      const premiumErr = new HttpErrorResponse({ status: 400, error: { errorType: 'AiHelperPremiumRequired', errorMessage: 'x' } });
      const { fixture, c } = create(throwError(() => premiumErr));
      c.text.set(LONG_TEXT);
      c.generate();
      fixture.detectChanges();
      expect(q(fixture, 'quiz-source-blocked')!.textContent).toContain('Prémium');
      expect(q(fixture, 'quiz-source-error')).toBeNull();

      TestBed.resetTestingModule();
      const quotaErr = new HttpErrorResponse({ status: 400, error: { errorType: 'AiHelperQuotaExceeded', errorMessage: 'Elfogyott a havi kereted (60 kvíz-generálás / hó).' } });
      const second = create(throwError(() => quotaErr));
      second.c.text.set(LONG_TEXT);
      second.c.generate();
      second.fixture.detectChanges();
      expect(q(second.fixture, 'quiz-source-blocked')!.textContent).toContain('Elfogyott');
      expect(second.c.canGenerate()).toBe(false);
    });
  });

  it('a 20 oldalnál hosszabb PDF figyelmeztetése az eredményben; az átjáró-időtúllépés érthető', () => {
    const { fixture, c } = create(of(result({ warnings: ['A PDF 35 oldalas - csak az első 20 oldal szövegéből készültek kérdések.'] })));
    c.text.set(LONG_TEXT);
    c.generate();
    fixture.detectChanges();
    expect(q(fixture, 'quiz-source-warnings')!.textContent).toContain('csak az első 20 oldal');
    expect(sourceErrorMessage({ status: 504 })).toContain('80 mp');
  });

  it('bezárás kérés nélkül: nincs újratöltés; a háttérre kattintás is bezár', () => {
    const { fixture, changed, closed } = create();
    q(fixture, 'quiz-source-backdrop')!.click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });
});
