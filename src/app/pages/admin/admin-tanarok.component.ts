import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminTeacherStore } from '../../services/admin/admin-teacher.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-tanarok',
  standalone: true,
  imports: [DatePipe],
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
                <p class="text-xs text-text-muted mt-1">
                  {{ teacher.taskSetCount }} feladatsor · {{ teacher.groupCount }} csoport · tag {{ teacher.createdAt | date: 'yyyy.MM.dd' }} óta
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
                <button (click)="store.selectTeacher(teacher.id)"
                  class="text-sm text-primary hover:underline whitespace-nowrap">
                  Feladatsorai {{ store.selectedTeacherId() === teacher.id ? '▲' : '▼' }}
                </button>
              </div>
            </div>

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

  constructor() {
    this.store.load();
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
