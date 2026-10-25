import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { QuizAssignComponent } from './quiz-assign.component';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { GroupStore } from '../../../services/group/group.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { TeacherQuizDetailDto } from '../../../models/teacher-quiz.model';

function makeQuiz(overrides: Partial<TeacherQuizDetailDto> = {}): TeacherQuizDetailDto {
  return {
    id: 40,
    title: 'refaktortest-quizeditor-20261024',
    isPublished: true,
    questionCount: 2,
    pendingQuestionCount: 0,
    assignedGroupCount: 0,
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
    feedbackMode: 'after',
    shuffleQuestions: true,
    allowLateSubmission: true,
    questions: [],
    assignments: [],
    ...overrides,
  };
}

describe('QuizAssignComponent', () => {
  function setup() {
    const navigate = vi.fn().mockResolvedValue(true);
    const deleteQuiz = vi.fn((_id: number, onSuccess?: () => void) => onSuccess?.());
    const assignToGroup = vi.fn();
    const confirm = { ask: vi.fn().mockResolvedValue(true) };
    const toast = { success: vi.fn(), warning: vi.fn(), danger: vi.fn() };

    TestBed.configureTestingModule({
      imports: [QuizAssignComponent],
      providers: [
        {
          provide: TeacherQuizStore,
          useValue: { loading: () => false, deleteQuiz, assignToGroup, revokeAssignment: vi.fn() },
        },
        { provide: GroupStore, useValue: { groups: signal([]), activeGroups: () => [] } },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: { navigate } },
      ],
    });

    const fixture = TestBed.createComponent(QuizAssignComponent);
    fixture.componentRef.setInput('quizId', 40);
    fixture.componentRef.setInput('quiz', makeQuiz());
    fixture.detectChanges();
    return { fixture, navigate, deleteQuiz, assignToGroup };
  }

  it('dolgozatként: kötelező ablak + időkorlát, és a kérés viszi az isTest-et és a perceket', () => {
    const { fixture, assignToGroup } = setup();
    const form = fixture.componentInstance.assignForm;
    form.patchValue({ groupId: 3, isTest: true, timeLimitMinutes: null });
    expect(form.errors).toEqual({ testWindowRequired: true });

    const local = (ms: number) => { const d = new Date(Date.now() + ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
    form.patchValue({ opensAt: local(3600_000), dueAt: local(2 * 3600_000) });
    expect(form.errors).toEqual({ testTimeLimit: true });
    form.patchValue({ timeLimitMinutes: 20 });
    expect(form.valid).toBe(true);

    fixture.componentInstance.assign();
    expect(assignToGroup).toHaveBeenCalledWith(40, expect.objectContaining({ groupId: 3, isTest: true, timeLimitMinutes: 20 }), expect.any(Function));
  });

  // UI-TT-244: a "Kvíz törlése" sikeres törlés után a NEM LÉTEZŐ '/kvizek' útvonalra navigál
  // (a valódi lista a 'feladatsorok' alá van beágyazva: app.routes.ts 'feladatsorok' -> 'kvizek'
  // gyermek-route, tehát a teljes útvonal '/feladatsorok/kvizek'). Élőben ez egy nyers "404 - Az
  // oldal nem található" lapon landol a sikeres törlés UTÁN - a felhasználó nem tudja, hogy a
  // törlés sikerült-e, és nincs út vissza a kvíz-listára a navigációs sávon kívül.
  it('deleteQuiz után a valódi kvíz-lista útvonalra kellene navigálnia, nem a nem létező /kvizek-re', async () => {
    const { fixture, navigate } = setup();
    await (fixture.componentInstance as unknown as { deleteQuiz(): Promise<void> }).deleteQuiz();

    expect(navigate).toHaveBeenCalledWith(['/feladatsorok/kvizek']);
  });
});
