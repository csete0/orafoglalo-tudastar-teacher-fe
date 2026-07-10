import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminTeacherStore } from '../../services/admin/admin-teacher.store';
import { TeacherProfileAdminDto } from '../../models/teacher-moderation.model';

const BYTES_PER_MB = 1048576;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-tanarok',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-4">Tanárok</h1>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }
      @if (store.loading()) {
        <p class="text-text-muted">Betöltés…</p>
      }

      <ul class="space-y-3">
        @for (teacher of store.teachers(); track teacher.id) {
          <li class="bg-bg-panel border border-border-default rounded-lg p-4">
            <div class="flex justify-between items-start">
              <div>
                <p class="font-medium">
                  {{ teacher.displayName }}
                  @if (!teacher.isActive) {
                    <span class="text-danger text-xs ml-2">Felfüggesztve</span>
                  }
                </p>
                <p class="text-sm text-text-muted">{{ teacher.email }}</p>
                @if (teacher.institutionName) {
                  <p class="text-sm text-text-muted">Intézmény: {{ teacher.institutionName }}</p>
                }
                <p class="text-xs mt-1" [class.text-danger]="isOverQuota(teacher)"
                  [class.text-text-muted]="!isOverQuota(teacher)">
                  {{ teacher.taskSetCount }}@if (teacher.maxTaskSets !== null) { / {{ teacher.maxTaskSets }}} feladatsor ·
                  {{ teacher.groupCount }} csoport ·
                  {{ mb(teacher.storageUsedBytes) }}@if (teacher.maxStorageBytes !== null) { / {{ mb(teacher.maxStorageBytes) }}} MB tárhely ·
                  tag {{ teacher.createdAt | date: 'yyyy.MM.dd' }} óta
                </p>
              </div>
              <div class="flex flex-col gap-2 items-end">
                @if (teacher.isActive) {
                  <button (click)="confirmSuspend(teacher.id, teacher.displayName)"
                    class="rounded border border-danger text-danger text-sm px-3 py-1.5 whitespace-nowrap">
                    Felfüggesztés
                  </button>
                } @else {
                  <button (click)="store.setActive(teacher.id, true)"
                    class="rounded bg-success text-white text-sm px-3 py-1.5 whitespace-nowrap">
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
                      class="rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm w-32" />
                  </div>
                  <div>
                    <label class="text-xs text-text-muted block mb-1">Max tárhely (MB)</label>
                    <input type="number" min="0" [(ngModel)]="quotaStorageMb" name="quotaStorageMb"
                      class="rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm w-32" />
                  </div>
                  <button type="submit"
                    class="rounded bg-primary hover:bg-primary-hover text-white text-sm px-3 py-1.5">
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
                    <li class="flex justify-between items-center bg-bg-element rounded p-2 text-sm">
                      <div>
                        <span>{{ taskSet.title }}</span>
                        <span class="text-text-muted ml-2">
                          {{ taskSet.taskCount }} feladat · {{ taskSet.isPublished ? 'Publikálva' : 'Piszkozat' }}
                        </span>
                      </div>
                      @if (taskSet.isPublished) {
                        <button (click)="confirmTakedown(taskSet.id, taskSet.title)"
                          class="text-danger hover:underline whitespace-nowrap">
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
          @if (!store.loading()) {
            <li class="text-text-muted">Nincs még jóváhagyott tanár.</li>
          }
        }
      </ul>
    </div>
  `,
})
export class AdminTanarokComponent {
  readonly store = inject(AdminTeacherStore);

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
    this.store.setQuota(teacherProfileId, this.quotaTaskSets, maxStorageBytes);
    this.quotaEditId.set(null);
  }

  confirmSuspend(teacherProfileId: number, displayName: string): void {
    if (confirm(`Biztosan felfüggeszted ${displayName} tanári fiókját? A csoportjai és feladatsorai azonnal elérhetetlenné válnak a diákjai számára.`)) {
      this.store.setActive(teacherProfileId, false);
    }
  }

  confirmTakedown(taskSetId: number, title: string): void {
    if (confirm(`Biztosan visszavonod a(z) „${title}” feladatsor publikálását? A tanár diákjai számára azonnal elérhetetlenné válik.`)) {
      this.store.takedownTaskSet(taskSetId);
    }
  }
}
