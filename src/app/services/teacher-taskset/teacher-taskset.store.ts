import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { TeacherTaskSetService } from './teacher-taskset.service';
import {
  CreateTeacherSolutionRequest,
  CreateTeacherTaskRequest,
  CreateTeacherTaskSetRequest,
  PublishResultDto,
  SnippetDto,
  TeacherTaskSetDetailDto,
  TeacherTaskSetDto,
} from '../../models/teacher-content.model';

/**
 * A mutáló metódusok (feladat/megoldás/snippet/fájl) minden sikeres hívás
 * után a teljes feladatsor-részletet újratöltik — a fa mélyen egymásba
 * ágyazott (feladatsor→feladat→megoldás→snippet), a szerver-válaszból való
 * konzisztens újraépítés helyett ez a legkevésbé hibalehetőséges megoldás
 * egy belső, kis-adatmennyiségű eszköznél.
 */
@Injectable({ providedIn: 'root' })
export class TeacherTaskSetStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherTaskSetService);

  private readonly _taskSets = signal<TeacherTaskSetDto[]>([]);
  private readonly _selectedDetail = signal<TeacherTaskSetDetailDto | null>(null);
  private readonly _publishResult = signal<PublishResultDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly taskSets = computed(() => this._taskSets());
  readonly selectedDetail = computed(() => this._selectedDetail());
  readonly publishResult = computed(() => this._publishResult());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  loadMine(): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getMine()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (taskSets) => this._taskSets.set(taskSets),
        error: (err) => this._error.set(err.error?.error ?? 'A feladatsorok betöltése sikertelen.'),
      });
  }

  loadDetail(id: number): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getDetail(id)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => this._selectedDetail.set(detail),
        error: (err) => this._error.set(err.error?.error ?? 'A feladatsor betöltése sikertelen.'),
      });
  }

  create(request: CreateTeacherTaskSetRequest, onSuccess?: (taskSet: TeacherTaskSetDto) => void): void {
    this.mutate(this.service.create(request), (taskSet) => {
      this._taskSets.update((list) => [...list, taskSet]);
      if (onSuccess) onSuccess(taskSet);
    });
  }

  updateTaskSet(id: number, request: CreateTeacherTaskSetRequest): void {
    this.mutateAndReload(this.service.update(id, request), id);
  }

  deleteTaskSet(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id), () => {
      this._taskSets.update((list) => list.filter((ts) => ts.id !== id));
      this._selectedDetail.set(null);
      if (onSuccess) onSuccess();
    });
  }

  publish(id: number): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .publish(id)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this._publishResult.set(result);
          if (result.success) this.loadDetail(id);
        },
        error: (err) => this._error.set(err.error?.error ?? 'A publikálás sikertelen.'),
      });
  }

  addTask(taskSetId: number, request: CreateTeacherTaskRequest): void {
    this.mutateAndReload(this.service.addTask(taskSetId, request), taskSetId);
  }

  updateTask(taskSetId: number, taskId: number, request: CreateTeacherTaskRequest): void {
    this.mutateAndReload(this.service.updateTask(taskId, request), taskSetId);
  }

  deleteTask(taskSetId: number, taskId: number): void {
    this.mutateAndReload(this.service.deleteTask(taskId), taskSetId);
  }

  addSolution(taskSetId: number, taskId: number, request: CreateTeacherSolutionRequest): void {
    this.mutateAndReload(this.service.addSolution(taskId, request), taskSetId);
  }

  updateSolution(taskSetId: number, solutionId: number, request: CreateTeacherSolutionRequest): void {
    this.mutateAndReload(this.service.updateSolution(solutionId, request), taskSetId);
  }

  deleteSolution(taskSetId: number, solutionId: number): void {
    this.mutateAndReload(this.service.deleteSolution(solutionId), taskSetId);
  }

  upsertSolutionSnippets(taskSetId: number, solutionId: number, snippets: SnippetDto[]): void {
    this.mutateAndReload(this.service.upsertSolutionSnippets(solutionId, snippets), taskSetId);
  }

  upsertCompleteSolutionSnippets(taskSetId: number, taskId: number, snippets: SnippetDto[]): void {
    this.mutateAndReload(this.service.upsertCompleteSolutionSnippets(taskId, snippets), taskSetId);
  }

  uploadFile(taskSetId: number, kind: string, file: File, taskId?: number): void {
    this.mutateAndReload(this.service.uploadFile(taskSetId, kind, file, taskId), taskSetId);
  }

  deleteFile(taskSetId: number, fileId: string): void {
    this.mutateAndReload(this.service.deleteFile(fileId), taskSetId);
  }

  clearError(): void {
    this._error.set(null);
  }

  clearPublishResult(): void {
    this._publishResult.set(null);
  }

  private mutate<T>(observable: Observable<T>, onSuccess: (value: T) => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: onSuccess,
        error: (err) => this._error.set(err.error?.error ?? 'A művelet sikertelen.'),
      });
  }

  private mutateAndReload<T>(observable: Observable<T>, taskSetId: number): void {
    this.mutate(observable, () => this.loadDetail(taskSetId));
  }
}
