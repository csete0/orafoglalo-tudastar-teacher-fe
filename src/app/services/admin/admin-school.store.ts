import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { AdminSchoolService } from './admin-school.service';
import { SchoolAdminDto, SchoolMergeResultDto } from '../../models/teacher-moderation.model';

@Injectable({ providedIn: 'root' })
export class AdminSchoolStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminSchoolService);

  private readonly _schools = signal<SchoolAdminDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _lastMergeResult = signal<SchoolMergeResultDto | null>(null);

  readonly schools = computed(() => this._schools());
  readonly loading = computed(() => this._loading());
  readonly lastMergeResult = computed(() => this._lastMergeResult());

  load(): void {
    this._loading.set(true);

    this.service
      .getSchools()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((schools) => this._schools.set(schools));
  }

  /**
   * Hibakezelés szándékosan nincs: a backend OrafoglaloException-t dob
   * (forrás==cél / nem található intézmény), azt az interceptor kezeli
   * globálisan. Siker esetén a lista teljes újratöltéssel frissül —
   * egyszerűbb, mint optimista update, mert egy egyesítés két sort is
   * módosít egyszerre (a forrás eltűnik, a cél számai nőnek).
   */
  merge(sourceSchoolId: number, targetSchoolId: number): void {
    this.service
      .merge(sourceSchoolId, targetSchoolId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this._lastMergeResult.set(result);
        this.load();
      });
  }

  clearLastMergeResult(): void {
    this._lastMergeResult.set(null);
  }
}
