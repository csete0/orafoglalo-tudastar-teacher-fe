import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { KvizSzovegbolComponent, SOURCE_MAX_FILE_BYTES, sourceErrorMessage } from './kviz-szovegbol.component';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { QuizSourceResultDto, TeacherQuizQuestionDto } from '../../models/teacher-quiz.model';

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
    refunded: false,
    ...overrides,
  };
}

describe('KvizSzovegbolComponent', () => {
  let service: { generateFromSource: ReturnType<typeof vi.fn> };

  function create(response: unknown = of(result()), initialTopicId: number | null = 7) {
    service = { generateFromSource: vi.fn(() => response) };
    TestBed.configureTestingModule({
      imports: [KvizSzovegbolComponent],
      providers: [{ provide: TeacherQuizService, useValue: service }],
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
    c.count.set(21);
    expect(c.canGenerate()).toBe(false);
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
    const { fixture, c, changed } = create(of(result({ created: [], refunded: true })));
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

  it('bezárás kérés nélkül: nincs újratöltés; a háttérre kattintás is bezár', () => {
    const { fixture, changed, closed } = create();
    q(fixture, 'quiz-source-backdrop')!.click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });
});
