import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TeacherTaskDto, TeacherTaskSetDetailDto } from '../../../models/teacher-content.model';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { SnippetDraftsState } from './snippet-drafts.state';
import { TaskEditState } from './task-edit.state';
import { TaskSectionState } from './task-section.state';

/** A „Feladatok” rész állapot-specjeinek közös készlete (csak specekhez). */
export function makeDetail(tasks: TeacherTaskDto[] = [], overrides: Partial<TeacherTaskSetDetailDto> = {}): TeacherTaskSetDetailDto {
  return {
    id: 1, title: 'Teszt feladatsor', slug: 'teszt-feladatsor', description: 'd', levelId: 2, isPublished: false, takedownAt: null,
    hasExamSessions: false, createdAt: new Date().toISOString(), taskCount: tasks.length, tasks, files: [], requiredSkillIds: [],
    ...overrides,
  };
}

export function task(overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto {
  return { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], subTasks: [], ...overrides };
}

/**
 * A három állapot-szolgáltatás a TestBed gyökerén, mockolt store-ral és megerősítéssel. A store mutációs mockjai
 * alapból NEM hívják meg az onSuccess callbacket (folyamatban lévő / sikertelen kérést szimulálnak) - a tesztek
 * `mockImplementation`-nel írhatják felül, ha a sikeres ágat akarják bizonyítani.
 */
export function configureTaskStates(detail: TeacherTaskSetDetailDto | null = makeDetail()) {
  const store = {
    selectedDetail: signal(detail),
    loading: signal(false),
    loadDetail: vi.fn(),
    addTask: vi.fn(),
    addSubTask: vi.fn(),
    updateTask: vi.fn(),
    updateSubTask: vi.fn(),
    deleteTask: vi.fn(),
    deleteSubTask: vi.fn(),
    upsertSubTaskSnippets: vi.fn(),
    upsertCompleteSolutionSnippets: vi.fn(),
  };
  const confirm = { ask: vi.fn().mockResolvedValue(false), pending: signal(null), resolve: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      TaskSectionState,
      TaskEditState,
      SnippetDraftsState,
      { provide: TeacherTaskSetStore, useValue: store },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  return {
    store,
    confirm,
    tasks: () => TestBed.inject(TaskSectionState),
    edit: () => TestBed.inject(TaskEditState),
    drafts: () => TestBed.inject(SnippetDraftsState),
  };
}
