import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { CategoryService } from '../../services/category/category.service';
import { PublicCategoryDto } from '../../models/category.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { TartalomFulekComponent } from './tartalom-fulek.component';

const LEVELS = [
  { id: 1, label: 'Kezdő' },
  { id: 2, label: 'Középhaladó' },
  { id: 3, label: 'Haladó' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsorok-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, TartalomFulekComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="page-title">Feladatsoraim</h1>
      <p class="text-sm text-text-muted mt-1">Saját feladatsorok szerkesztése és publikálása</p>

      <app-tartalom-fulek />

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      @if (store.mineLoading() && store.taskSets().length === 0) {
        <div class="space-y-2 mb-8">
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
        </div>
      } @else {
        <ul class="space-y-3 mb-8">
          @for (taskSet of store.taskSets(); track taskSet.id) {
            <li>
              <a [routerLink]="['/feladatsorok', taskSet.id, 'szerkesztes']"
                class="card-link block group" [class]="'accent-' + (taskSet.id % 4)">
                <div class="accent-bar"></div>
                <div class="p-4 flex items-center gap-3">
                  <div class="icon-tile icon-tile-success">
                    <app-icon name="clipboard-list" class="w-6 h-6 block" />
                  </div>
                  <span class="min-w-0 flex-1">
                    <span class="font-bold block truncate">{{ taskSet.title }}</span>
                    <span class="text-text-muted text-xs">{{ taskSet.taskCount }} feladat</span>
                  </span>
                  <span class="badge shrink-0" [class]="taskSetBadgeClass(taskSet)">
                    {{ taskSetBadgeLabel(taskSet) }}</span>
                  <app-icon name="arrow-right"
                    class="w-4 h-4 block text-text-muted transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </a>
            </li>
          }
          @empty {
            <!-- UI-TT-32: sikertelen betöltésnél NE mutassuk a "hozz létre elsőt" üres-állapotot
                 a fenti hibaüzenettel egyidejűleg — az üres tömb ilyenkor a hibából ered, nem
                 abból, hogy a tanárnak ténylegesen nincs egy feladatsora sem. -->
            @if (!store.error()) {
              <li class="flex flex-col items-center py-10 gap-3">
                <div class="icon-tile icon-tile-neutral">
                  <app-icon name="clipboard-list" class="w-6 h-6 block" />
                </div>
                <p class="font-semibold">Még nincs feladatsorod.</p>
                <p class="text-sm text-text-muted">Hozd létre az elsőt az alábbi űrlappal.</p>
              </li>
            }
          }
        </ul>
      }

      <form [formGroup]="createForm" (ngSubmit)="create()" class="card p-5 space-y-3">
        <h2 class="font-bold">Új feladatsor</h2>
        <input formControlName="title" placeholder="Cím" maxlength="250" class="input" />
        @if (createForm.controls.title.hasError('blank')) {
          <p class="text-sm text-danger">A cím nem állhat kizárólag szóközökből.</p>
        }
        @if (createForm.controls.title.hasError('maxlength')) {
          <p class="text-sm text-danger">A cím legfeljebb 250 karakter hosszú lehet.</p>
        }
        <textarea formControlName="description" placeholder="Leírás" rows="3" class="input"></textarea>
        <select formControlName="levelId" class="input">
          @for (level of levels; track level.id) {
            <option [value]="level.id">{{ level.label }}</option>
          }
        </select>
        <select formControlName="subjectCategoryId" class="input">
          <option [ngValue]="null">Nincs tantárgyi kategória</option>
          @for (category of categories(); track category.id) {
            <option [ngValue]="category.id">{{ category.name }}</option>
          }
        </select>

        <button type="submit" [disabled]="createForm.invalid || store.loading()" class="btn btn-primary">
          Létrehozás
        </button>
      </form>
    </div>
  `,
})
export class FeladatsorokListaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  readonly store = inject(TeacherTaskSetStore);

  readonly levels = LEVELS;
  // UI-TT-133: catchError NÉLKÜL a toSignal() a forrás Observable hibáját minden KÖVETKEZŐ
  // signal-olvasáskor újra-dobja (Angular rxjs-interop dokumentált viselkedése) - a categories()
  // a sablon @for ciklusában feltétel nélkül olvasódik, tehát egy GET /public/categories hiba a
  // TELJES oldal (meglévő lista + form) renderelését eldöntötte volna, nem csak a legördülőt.
  readonly categories = toSignal(
    this.categoryService.getAll().pipe(catchError(() => of([] as PublicCategoryDto[]))),
    { initialValue: [] as PublicCategoryDto[] },
  );

  readonly createForm = this.fb.nonNullable.group({
    // UI-TT-79: a BE nvarchar(250)-hez igazodó kemény korlát - enélkül a form
    // bármilyen hosszúságú címet beengedett, jóval a DTO korlátján túl is.
    title: ['', [Validators.required, notBlankValidator(), Validators.maxLength(250)]],
    description: ['', Validators.required],
    levelId: [2, Validators.required],
    subjectCategoryId: this.fb.control<number | null>(null),
  });

  constructor() {
    this.store.loadMine();
  }

  /**
   * UI-TT-172: a takedownAt-tal rendelkező feladatsor korábban megkülönböztethetetlen
   * "Piszkozat" jelvényt kapott egy sosem publikált feladatsorral - az admin-nézet
   * (`admin-tanarok.component.ts`) mintáját követve itt is három állapotot különböztetünk
   * meg.
   */
  taskSetBadgeLabel(taskSet: { isPublished: boolean; takedownAt: string | null }): string {
    if (taskSet.takedownAt) return 'Admin visszavonta';
    return taskSet.isPublished ? 'Publikált' : 'Piszkozat';
  }

  taskSetBadgeClass(taskSet: { isPublished: boolean; takedownAt: string | null }): string {
    if (taskSet.takedownAt) return 'badge-danger';
    return taskSet.isPublished ? 'badge-success' : 'badge-warning';
  }

  /**
   * BE-TASKSET-LEVEL-CATEGORY-MISMATCH: a `Szint` és a `Tantárgyi kategória` teljesen
   * függetlenül választható volt, így pl. a "Kezdő" szintet a NEVÉBEN is ígérő kategóriába
   * "Haladó" feladatsor kerülhetett. Ez itt szándékosan csak FIGYELMEZTETÉS: a tanár
   * elvetheti és mehet tovább, mert a kategóriák jogosan átfoghatnak több szintet, és egy
   * kemény tiltás visszamenőleg érvénytelenné tenné a meglévő feladatsorokat.
   *
   * Visszatérés: a megerősítő kérdés szövege, vagy null, ha nincs mit kérdezni.
   * SZÁNDÉKOSAN szinkron: eltérés hiányában a create() await nélkül fut tovább, így a
   * mentés nem csúszik át egy mikrotaszkba a hívóhelyek/tesztek háta mögött.
   */
  private levelMismatchMessage(levelId: number, categoryId: number | null): string | null {
    if (categoryId == null) return null;

    const category = this.categories().find((c) => c.id === categoryId);
    // Ismeretlen kategória vagy nincs javaslat -> nincs mit összehasonlítani.
    if (!category || category.suggestedLevelId == null) return null;
    if (category.suggestedLevelId === levelId) return null;

    const suggestedLabel = LEVELS.find((l) => l.id === category.suggestedLevelId)?.label;
    // Ha a javasolt szint nem szerepel a helyi listában (BE-oldali új szint), inkább
    // nem kérdezünk, mint hogy egy értelmezhetetlen "undefined" szöveget mutassunk.
    if (!suggestedLabel) return null;

    const chosenLabel = LEVELS.find((l) => l.id === levelId)?.label ?? String(levelId);

    return (
      `A(z) „${category.name}” kategóriához ${suggestedLabel} szint javasolt, ` +
      `te viszont ${chosenLabel} szintet választottál. Így is létrehozod?`
    );
  }

  async create(): Promise<void> {
    if (this.createForm.invalid || this.store.loading()) return;
    const raw = this.createForm.getRawValue();
    // A szint-<select> [value]-t használ (nem [ngValue]-t), ezért a control értéke futásidőben
    // STRING, a típusa szerinti number ellenére - Number() nélkül a lenti === sosem egyezne.
    const levelId = Number(raw.levelId);

    const mismatchMessage = this.levelMismatchMessage(levelId, raw.subjectCategoryId);
    if (
      mismatchMessage &&
      !(await this.confirmService.ask({
        title: 'Eltérő szint',
        message: mismatchMessage,
        confirmLabel: 'Létrehozás',
        cancelLabel: 'Mégsem',
      }))
    ) {
      return;
    }

    this.store.create(
      {
        title: raw.title,
        description: raw.description,
        levelId,
        subjectCategoryId: raw.subjectCategoryId ?? undefined,
      },
      (taskSet) => {
        this.toastService.success('Feladatsor létrehozva.');
        this.router.navigate(['/feladatsorok', taskSet.id, 'szerkesztes']);
      },
    );
  }
}
