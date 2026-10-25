import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { KvizDolgozatComponent } from './kviz-dolgozat.component';
import { TeacherQuizTestService } from '../../services/teacher-quiz/teacher-quiz-test.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { QuizTestOverviewDto } from '../../models/teacher-quiz.model';

const OVERVIEW: QuizTestOverviewDto = {
  assignmentId: 31, quizId: 9, title: 'Ágazati alapvizsga – elméleti dolgozat – 11.c', groupId: 4, groupName: '11.c',
  opensAt: '2026-10-25T08:00:00Z', dueAt: '2026-10-25T09:00:00Z', timeLimitSeconds: 1800, questionCount: 15, isKkk: true,
  technikumTheoryKind: 'alapvizsga', resultsPublishedAt: null, canPublish: true,
  students: [
    { userId: 1, name: 'Kiss Anna', leftGroup: false, status: 'submitted', sessionId: 501, startedAt: '2026-10-25T08:01:00', submittedAt: '2026-10-25T08:25:00',
      correctAnswers: 11, answeredCount: 15, totalQuestions: 15, points: 22, maxPoints: 30, passed: true },
    { userId: 2, name: 'Nagy Béla', leftGroup: false, status: 'not_started', sessionId: null, startedAt: null, submittedAt: null,
      correctAnswers: null, answeredCount: null, totalQuestions: 15, points: null, maxPoints: null, passed: null },
  ],
};

describe('KvizDolgozatComponent', () => {
  function setup(overview: QuizTestOverviewDto = OVERVIEW) {
    const api = {
      getOverview: vi.fn().mockReturnValue(of(overview)),
      getStudentReview: vi.fn().mockReturnValue(of({
        sessionId: 501, score: 11, totalQuestions: 15, examPoints: 22, maxExamPoints: 30,
        items: [{ questionId: 70, order: 0, questionText: 'Mi a DHCP?', questionType: 'single', options: ['a', 'b'], userAnswers: ['b'],
          correctAnswers: ['a'], isCorrect: false, examPoints: 0, explanation: null }],
      })),
      publish: vi.fn().mockReturnValue(of(undefined)),
    };
    const confirm = { ask: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [KvizDolgozatComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherQuizTestService, useValue: api },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: { success: vi.fn(), danger: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ assignmentId: '31' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(KvizDolgozatComponent);
    fixture.detectChanges();
    return { fixture, api, confirm, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('névsor ponttal és megfelelt-jelzéssel; a diák válaszai a megoldással nyithatók', () => {
    const { fixture, api, el } = setup();
    expect(api.getOverview).toHaveBeenCalledWith(31);
    expect(el.textContent).toContain('ágazati alapvizsga');
    expect(el.textContent).toContain('22 / 30');
    expect(el.textContent).toContain('megfelelt');
    expect(el.querySelector('[data-testid="quiz-test-answers-2"]')).toBeNull(); // aki nem kezdte el, annak nincs mit megnézni

    (el.querySelector('[data-testid="quiz-test-answers-1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.getStudentReview).toHaveBeenCalledWith(31, 501);
    const review = el.querySelector('[data-testid="quiz-test-review"]')!.textContent!;
    expect(review).toContain('Válasza: b');
    expect(review).toContain('Helyes: a');
  });

  it('közzététel megerősítés után; amíg nem tehető közzé, a gomb tiltott és magyarázat látszik', async () => {
    const { fixture, api, el } = setup();
    await fixture.componentInstance.publish(OVERVIEW);
    expect(api.publish).toHaveBeenCalledWith(31);
    TestBed.resetTestingModule();

    const waiting = setup({ ...OVERVIEW, canPublish: false });
    expect((waiting.el.querySelector('[data-testid="quiz-test-publish"]') as HTMLButtonElement).disabled).toBe(true);
    expect(waiting.el.querySelector('[data-testid="quiz-test-publish-wait"]')).not.toBeNull();
  });
});
