import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TeacherTaskDto } from '../../models/teacher-content.model';
import { IconComponent, IconName } from '../../shared/icon/icon.component';

/** A szerkesztő egy típus-blokkja (ld. `FeladatsorSzerkesztoComponent.typeSections`). */
export interface FeladatVazlatSection {
  id: number;
  label: string;
  icon: IconName;
  /** Az „Egyéb” gyűjtő-blokk: nincs hozzá „Új feladat” űrlap. */
  isOther: boolean;
  tasks: TeacherTaskDto[];
}

/** A részfeladatok pontösszege - beadáskor ez a feladat pontszáma (a `maxPoints` csak felső korlát). */
export function allocatedPoints(task: TeacherTaskDto): number {
  return task.subTasks.reduce((sum, s) => sum + (s.points ?? 0), 0);
}

/** Pontozási gond a vázlat pöttyéhez: nincs részfeladat (nem pontozható), vagy a pontösszeg eltér; `null` = rendben. */
export function pointIssue(task: TeacherTaskDto): { label: string; title: string } | null {
  if (task.subTasks.length === 0) return { label: 'Nincs részfeladat – nem pontozható', title: 'Nincs részfeladat – beadáskor nem pontozható' };
  if (allocatedPoints(task) !== task.maxPoints) {
    return { label: 'A részfeladatok pontjai eltérnek', title: 'A részfeladatok pontösszege eltér a feladat pontszámától' };
  }
  return null;
}

/**
 * A szerkesztő bal oldali feladat-vázlata: típusonként a feladatok, kattintásra a szerkesztő kinyitja
 * és odagörget. `xl` alatt a tartalom fölött összecsukható blokk, `xl`-től ragadós oldalsáv.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladat-vazlat',
  standalone: true,
  // A ragadós hasáb maga a host (a rács cellája), különben a tartalom magasságú hostban nem ragadna.
  host: { class: 'block min-w-0 xl:sticky xl:top-4' },
  imports: [IconComponent],
  template: `
    <nav aria-label="Feladat-vázlat" class="card !rounded-xl p-3 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
      data-testid="task-outline">
      <button type="button" class="w-full flex items-center justify-between gap-2 text-left xl:hidden"
        [attr.aria-expanded]="open()" aria-controls="task-outline-list" (click)="open.set(!open())" data-testid="task-outline-toggle">
        <span class="font-bold text-sm">Feladat-vázlat</span>
        <app-icon name="chevron-down" class="w-4 h-4 block text-text-muted transition-transform" [class.-rotate-90]="!open()" />
      </button>
      <p class="hidden xl:block font-bold text-sm">Feladat-vázlat</p>

      <div id="task-outline-list" class="mt-3 space-y-4 xl:block" [class.hidden]="!open()">
        @for (section of sections(); track section.id) {
          <div [attr.data-testid]="'outline-section-' + section.id">
            <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">
              <app-icon [name]="section.icon" class="w-3.5 h-3.5 block shrink-0" />
              <span class="truncate">{{ section.label }}</span>
            </p>
            <ul class="space-y-0.5">
              @for (task of section.tasks; track task.id) {
                <li>
                  <button type="button" (click)="taskSelected.emit(task.id)"
                    [attr.aria-current]="selectedTaskId() === task.id ? 'true' : null"
                    class="w-full flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-bg-element focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    [class.bg-primary-subtle]="selectedTaskId() === task.id" [class.text-primary]="selectedTaskId() === task.id"
                    [attr.data-testid]="'outline-task-' + task.id">
                    <span class="min-w-0 flex-1 truncate">{{ task.taskOrder }}. {{ task.title }}</span>
                    <span class="shrink-0 text-xs text-text-muted">{{ task.maxPoints }} p</span>
                    @if (pointIssue(task); as issue) {
                      <span class="w-2 h-2 rounded-full bg-warning shrink-0" role="img" [attr.aria-label]="issue.label"
                        [title]="issue.title" data-testid="outline-points-warning"></span>
                    }
                  </button>
                </li>
              }
            </ul>
            @if (!section.isOther) {
              <button type="button" (click)="addTaskRequested.emit(section.id)"
                class="mt-1 px-2 py-0.5 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                [attr.data-testid]="'outline-add-' + section.id">+ Új feladat</button>
            }
          </div>
        }
      </div>
    </nav>
  `,
})
export class FeladatVazlatComponent {
  readonly sections = input.required<FeladatVazlatSection[]>();
  /** A kijelölt (kinyitott) feladat. */
  readonly selectedTaskId = input<number | null>(null);
  readonly taskSelected = output<number>();
  readonly addTaskRequested = output<number>();

  /** Csak `xl` alatt számít (ott összecsukható blokk); alapból nyitva. */
  readonly open = signal(true);

  readonly pointIssue = pointIssue;
}
