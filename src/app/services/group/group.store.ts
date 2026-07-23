import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { GroupService } from './group.service';
import { CreateGroupRequest, GroupDto, GroupMemberDto } from '../../models/group.model';

@Injectable({ providedIn: 'root' })
export class GroupStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(GroupService);

  private readonly _groups = signal<GroupDto[]>([]);
  private readonly _selectedGroupId = signal<number | null>(null);
  private readonly _members = signal<GroupMemberDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly groups = computed(() => this._groups());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly members = computed(() => this._members());
  readonly selectedGroup = computed<GroupDto | null>(
    () => this._groups().find((g) => g.id === this._selectedGroupId()) ?? null,
  );

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
        next: (groups) => this._groups.set(groups),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A csoportok betöltése sikertelen.'),
      });
  }

  select(groupId: number | null): void {
    this._selectedGroupId.set(groupId);
    this._members.set([]);
  }

  create(request: CreateGroupRequest, onSuccess?: (group: GroupDto) => void): void {
    this.mutate(this.service.create(request), (group) => {
      this._groups.update((list) => [...list, group]);
      if (onSuccess) onSuccess(group);
    });
  }

  update(
    id: number,
    request: CreateGroupRequest,
    onSuccess?: () => void,
    onError?: (message: string) => void,
  ): void {
    this.mutate(
      this.service.update(id, request),
      (group) => {
        this._groups.update((list) => list.map((g) => (g.id === id ? group : g)));
        if (onSuccess) onSuccess();
      },
      onError,
    );
  }

  regenerateInvite(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.regenerateInvite(id), (group) => {
      this._groups.update((list) => list.map((g) => (g.id === id ? group : g)));
      if (onSuccess) onSuccess();
    });
  }

  loadMembers(id: number): void {
    this._loading.set(true);
    this._error.set(null);
    this.service
      .getMembers(id)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (members) => this._members.set(members),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A tagok betöltése sikertelen.'),
      });
  }

  removeMember(groupId: number, memberUserId: number, onSuccess?: () => void): void {
    this.mutate(this.service.removeMember(groupId, memberUserId), () => {
      this._members.update((list) => list.filter((m) => m.userId !== memberUserId));
      if (onSuccess) onSuccess();
    });
  }

  archive(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.archive(id), () => {
      this._groups.update((list) => list.map((g) => (g.id === id ? { ...g, isArchived: true } : g)));
      if (onSuccess) onSuccess();
    });
  }

  // UI-TT-34: az archiválásnak eddig nem volt ellentétes irányú művelete - egy
  // véletlenül archivált csoportot a tanár nem tudott a rendszeren belül
  // visszaállítani.
  unarchive(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.unarchive(id), () => {
      this._groups.update((list) => list.map((g) => (g.id === id ? { ...g, isArchived: false } : g)));
      if (onSuccess) onSuccess();
    });
  }

  setJoinEnabled(id: number, enabled: boolean, onSuccess?: () => void): void {
    this.mutate(this.service.setJoinEnabled(id, enabled), () => {
      this._groups.update((list) => list.map((g) => (g.id === id ? { ...g, isJoinEnabled: enabled } : g)));
      if (onSuccess) onSuccess();
    });
  }

  clearError(): void {
    this._error.set(null);
  }

  private mutate<T>(
    observable: Observable<T>,
    onSuccess: (value: T) => void,
    onError?: (message: string) => void,
  ): void {
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
        error: (err) => {
          const message = err.error?.errorMessage ?? 'A művelet sikertelen.';
          this._error.set(message);
          if (onError) onError(message);
        },
      });
  }
}
