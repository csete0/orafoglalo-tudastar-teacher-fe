import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminTeacherStore } from '../../services/admin/admin-teacher.store';
import { TeacherProfileAdminDto } from '../../models/teacher-moderation.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

const BYTES_PER_MB = 1048576;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-tanarok',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Tanárok</h1>
      <p class="text-sm text-text-muted mt-1">Jóváhagyott tanári fiókok moderálása és kvótái</p>
      <div class="hairline"></div>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }
      @if (store.loading()) {
        <app-local-spinner />
      }

      <ul class="space-y-3">
        @for (teacher of store.teachers(); track teacher.id) {
          <li class="card p-4">
            <div class="flex justify-between items-start gap-3">
              <div class="min-w-0">
                <p class="font-medium flex items-center gap-2 flex-wrap break-words">
                  {{ teacher.displayName }}
                  @if (!teacher.isActive) {
                    <span class="badge badge-danger shrink-0">Felfüggesztve</span>
                  }
                </p>
                <p class="text-sm text-text-muted truncate">{{ teacher.email }}</p>
                @if (teacher.institutionName) {
                  <p class="text-sm text-text-muted break-words">Intézmény: {{ teacher.institutionName }}</p>
                }
                <p class="text-xs mt-1" [class.text-danger]="isOverQuota(teacher)"
                  [class.text-text-muted]="!isOverQuota(teacher)">
                  {{ teacher.taskSetCount }}@if (teacher.maxTaskSets !== null) { / {{ teacher.maxTaskSets }}} feladatsor ·
                  {{ teacher.groupCount }} csoport ·
                  {{ mb(teacher.storageUsedBytes) }}@if (teacher.maxStorageBytes !== null) { / {{ mb(teacher.maxStorageBytes) }}} MB tárhely ·
                  tag {{ teacher.createdAt | date: 'yyyy.MM.dd' }} óta
                </p>
              </div>
              <div class="flex flex-col gap-2 items-end shrink-0">
                @if (teacher.isActive) {
                  <button (click)="confirmSuspend(teacher.id, teacher.displayName)"
                    class="btn btn-danger !px-3 !py-1.5 whitespace-nowrap">
                    Felfüggesztés
                  </button>
                } @else {
                  <button (click)="activate(teacher.id)"
                    class="btn !bg-success !text-white !px-3 !py-1.5 whitespace-nowrap">
                    Aktiválás
                  </button>
                }
                <button (click)="toggleQuotaEdit(teacher)"
                  class="text-sm text-primary hover:underline whitespace-nowrap">
                  Kvóta {{ quotaEditId() === teacher.id ? '▲' : '▼' }}
                </button>
                <button (click)="store.selectTeacher(teacher.id)"
                  class="text-sm text-primary hover:underline whitespace-nowrap">
                  Feladatsorai {{ store.selectedTeacherId() === teacher.id ? '▲' : '▼' }}
                </button>
              </div>
            </div>

            @if (quotaEditId() === teacher.id) {
              <form (ngSubmit)="saveQuota(teacher.id)" class="mt-4 pl-4 border-l-2 border-border-default">
                <div class="flex gap-3 items-end flex-wrap">
                  <div>
                    <label class="text-xs text-text-muted block mb-1">Max feladatsor</label>
                    <input type="number" min="0" [(ngModel)]="quotaTaskSets" name="quotaTaskSets"
                      class="input !px-2 !py-1.5 !w-32" />
                  </div>
                  <div>
                    <label class="text-xs text-text-muted block mb-1">Max tárhely (MB)</label>
                    <input type="number" min="0" [(ngModel)]="quotaStorageMb" name="quotaStorageMb"
                      class="input !px-2 !py-1.5 !w-32" />
                  </div>
                  <button type="submit" class="btn btn-primary !px-3 !py-1.5">
                    Mentés
                  </button>
                </div>
                <p class="text-xs text-text-muted mt-2">
                  Üres mező = korlátlan. A használat alatti kvóta a meglévő tartalmat nem érinti, csak az új
                  feladatsor-létrehozást/fájl-feltöltést blokkolja.
                </p>
              </form>
            }

            @if (store.selectedTeacherId() === teacher.id) {
              <div class="mt-4 pl-4 border-l-2 border-border-default">
                @if (store.taskSetsLoading()) {
                  <p class="text-text-muted text-sm">Betöltés…</p>
                }
                <ul class="space-y-2">
                  @for (taskSet of store.taskSets(); track taskSet.id) {
                    <li class="flex justify-between items-center gap-2 bg-bg-element rounded-xl p-2 text-sm">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate">{{ taskSet.title }}</span>
                        <span class="text-text-muted">
                          {{ taskSet.taskCount }} feladat · {{ taskSet.isPublished ? 'Publikálva' : 'Piszkozat' }}
                        </span>
                      </span>
                      @if (taskSet.isPublished) {
                        <button (click)="confirmTakedown(taskSet.id, taskSet.title)"
                          class="text-danger hover:underline whitespace-nowrap shrink-0">
                          Publikálás visszavonása
                        </button>
                      }
                    </li>
                  } @empty {
                    @if (!store.taskSetsLoading()) {
                      <li class="text-text-muted text-sm">Nincs feladatsora.</li>
                    }
                  }
                </ul>
              </div>
            }
          </li>
        } @empty {
          @if (!store.loading() && !store.error()) {
            <li class="flex flex-col items-center py-10 gap-3">
              <div class="icon-tile icon-tile-neutral">
                <app-icon name="academic-cap" class="w-6 h-6 block" />
              </div>
              <p class="font-semibold">Nincs még jóváhagyott tanár.</p>
            </li>
          }
        }
      </ul>
    </div>
  `,
})
export class AdminTanarokComponent {
  readonly store = inject(AdminTeacherStore);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);

  readonly quotaEditId = signal<number | null>(null);
  quotaTaskSets: number | null = null;
  quotaStorageMb: number | null = null;

  constructor() {
    this.store.load();
  }

  mb(bytes: number): string {
    return (bytes / BYTES_PER_MB).toFixed(1);
  }

  isOverQuota(teacher: TeacherProfileAdminDto): boolean {
    return (
      (teacher.maxTaskSets !== null && teacher.taskSetCount >= teacher.maxTaskSets) ||
      (teacher.maxStorageBytes !== null && teacher.storageUsedBytes >= teacher.maxStorageBytes)
    );
  }

  toggleQuotaEdit(teacher: TeacherProfileAdminDto): void {
    if (this.quotaEditId() === teacher.id) {
      this.quotaEditId.set(null);
      return;
    }
    this.quotaTaskSets = teacher.maxTaskSets;
    this.quotaStorageMb =
      teacher.maxStorageBytes === null ? null : Math.round(teacher.maxStorageBytes / BYTES_PER_MB);
    this.quotaEditId.set(teacher.id);
  }

  saveQuota(teacherProfileId: number): void {
    // A number-input üresen null-t ad — az a "korlátlan". Negatívot a min="0"
    // mellett itt is blokkolunk, a backend úgyis elutasítaná.
    if ((this.quotaTaskSets ?? 0) < 0 || (this.quotaStorageMb ?? 0) < 0) return;

    const maxStorageBytes = this.quotaStorageMb === null ? null : this.quotaStorageMb * BYTES_PER_MB;
    this.store.setQuota(teacherProfileId, this.quotaTaskSets, maxStorageBytes, () =>
      this.toastService.success('Kvóta mentve.'),
    );
    this.quotaEditId.set(null);
  }

  activate(teacherProfileId: number): void {
    this.store.setActive(teacherProfileId, true, () => this.toastService.success('Tanári fiók aktiválva.'));
  }

  async confirmSuspend(teacherProfileId: number, displayName: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Biztosan felfüggeszted ${displayName} tanári fiókját? A csoportjai és feladatsorai azonnal elérhetetlenné válnak a diákjai számára.`,
      danger: true,
      confirmLabel: 'Felfüggesztés',
    });
    if (!ok) return;
    this.store.setActive(teacherProfileId, false, () => this.toastService.success('Tanári fiók felfüggesztve.'));
  }

  async confirmTakedown(taskSetId: number, title: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Biztosan visszavonod a(z) „${title}” feladatsor publikálását? A tanár diákjai számára azonnal elérhetetlenné válik.`,
      danger: true,
      confirmLabel: 'Visszavonás',
    });
    if (!ok) return;
    this.store.takedownTaskSet(taskSetId, () => this.toastService.success('Publikálás visszavonva.'));
  }
}
