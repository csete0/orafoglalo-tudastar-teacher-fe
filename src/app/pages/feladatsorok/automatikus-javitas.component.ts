import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { GradingQualityCheckDto, GradingQualityDto, TeacherTaskDto } from '../../models/teacher-content.model';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { SzempontlistaComponent } from './szempontlista.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** Az állapot közérthető, egysoros összefoglalója (a kártyán és a közzétételi figyelmeztetésben is ez áll). */
export function gradingQualityHeadline(quality: GradingQualityDto): string {
  switch (quality.level) {
    case 'green':
      return 'Pontos automatikus javítás';
    case 'yellow':
      return 'Működik, de pontatlanabb – készíts szempontlistát';
    default:
      return quality.kind === 'office'
        ? 'Nem lesz automatikus javítás – a beadás pont nélkül marad, amíg nincs jóváhagyott szempontlista'
        : 'Nem lesz pontos automatikus javítás – pótold a lenti hiányokat';
  }
}

/**
 * Egy nem teljesült feltétel teendője. Irodai feladatnál a megoldásfájl hiánya a legfontosabb
 * teendő, és a tanárnak tudnia kell, MIÉRT kell a saját megoldása - ezért ezt a szöveget a FE
 * rögzíti, nem a backend hint-jére bízza.
 */
export function gradingCheckHint(check: GradingQualityCheckDto): string | null {
  if (check.ok) return null;
  if (check.key === 'solutionFile') return 'Töltsd fel a saját megoldásodat – ebből készül a szempontlista.';
  return check.hint?.trim() || null;
}

/**
 * „Automatikus javítás” blokk egy feladatkártyán: a `grading-quality` végpont alapján
 * zöld/sárga/piros állapot és a feltételek listája (pipa vagy teendő), alatta a tanári
 * szempontlista (`app-szempontlista`).
 *
 * A minőséget a feladat MINDEN változásakor újratölti: a store minden sikeres mutáció
 * (kódrészlet-mentés, fájlfeltöltés, részfeladat-módosítás) után a teljes feladatsort
 * újratölti, így a `task` input új objektumot kap - ez a jel, hogy a referencia, a fájlok
 * vagy a részfeladatok változhattak. A tesztbemenet mentése nem a store-on megy át, ezért ott
 * a szerkesztő hívja a `loadQuality()`-t; a „stdin” teendő a `stdinRequested` jelzéssel a
 * „Tesztbemenet” részhez vezet.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-automatikus-javitas',
  standalone: true,
  imports: [IconComponent, SzempontlistaComponent],
  template: `
    <div class="bg-bg-panel rounded-xl p-3" data-testid="auto-grading-block">
      <p class="text-sm font-medium mb-2">Automatikus javítás</p>

      @if (quality(); as q) {
        <p class="text-sm font-semibold flex items-start gap-2 mb-2" [class]="levelTextClass(q)" data-testid="auto-grading-level"
          [attr.data-level]="q.level">
          <span class="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" [class]="levelDotClass(q)" aria-hidden="true"></span>
          <span>{{ headline(q) }}</span>
        </p>
        <ul class="space-y-1 text-sm">
          @for (check of q.checks; track check.key) {
            <li class="flex items-start gap-2" data-testid="auto-grading-check" [attr.data-ok]="check.ok">
              @if (check.ok) {
                <app-icon name="check" class="w-4 h-4 block mt-0.5 shrink-0 text-success" />
              } @else {
                <app-icon name="warning-triangle" class="w-4 h-4 block mt-0.5 shrink-0 text-warning" />
              }
              <span class="min-w-0">
                <span>{{ check.label }}</span>
                @if (checkHint(check); as hint) {
                  <span class="block text-text-muted">{{ hint }}</span>
                }
                @if (check.key === 'stdin' && !check.ok) {
                  <button type="button" class="text-primary hover:underline" (click)="stdinRequested.emit()" data-testid="auto-grading-stdin-link">
                    Tesztbemenet megadása
                  </button>
                }
              </span>
            </li>
          }
        </ul>
      } @else if (error()) {
        <p class="text-sm text-danger">{{ error() }}</p>
      } @else {
        <p class="text-sm text-text-muted">Ellenőrzés…</p>
      }

      <!-- A lista minden változása (vázlat, jóváhagyás) a javítás-minőséget is érinti. -->
      <app-szempontlista [taskSetId]="taskSetId()" [task]="task()" [quality]="quality()" (changed)="loadQuality(); rubricChanged.emit()" />
    </div>
  `,
})
export class AutomatikusJavitasComponent {
  private readonly rubricService = inject(TeacherRubricService);

  readonly taskSetId = input.required<number>();
  readonly task = input.required<TeacherTaskDto>();
  /** A „stdin” teendő gombja: a szerkesztő kinyitja a „Tesztbemenet” részt és odagörget. */
  readonly stdinRequested = output<void>();
  /** A szempontlista változott (pl. MI-vázlat készült) - a szerkesztő ekkor frissíti az MI-segítő panel kereteit. */
  readonly rubricChanged = output<void>();

  readonly quality = signal<GradingQualityDto | null>(null);
  readonly error = signal<string | null>(null);

  /** Újratöltési kérések - switchMap: az új lekérés megszakítja a korábbit, egy lassú, elavult válasz nem írhatja felül a frissebbet. */
  private readonly reload$ = new Subject<void>();

  constructor() {
    this.reload$
      .pipe(
        switchMap(() => {
          this.error.set(null);
          return this.rubricService.getGradingQuality(this.taskSetId(), this.task().id).pipe(
            map((quality) => ({ quality, error: null })),
            catchError((err: unknown) =>
              of({ quality: null, error: extractErrorMessage(err, 'Az automatikus javítás állapota nem kérhető le.') }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ quality, error }) => {
        this.quality.set(quality);
        this.error.set(error);
      });
    effect(() => {
      this.taskSetId();
      this.task();
      untracked(() => this.loadQuality());
    });
  }

  loadQuality(): void {
    this.reload$.next();
  }

  headline(quality: GradingQualityDto): string {
    return gradingQualityHeadline(quality);
  }

  checkHint(check: GradingQualityCheckDto): string | null {
    return gradingCheckHint(check);
  }

  levelTextClass(quality: GradingQualityDto): string {
    return quality.level === 'green' ? 'text-success' : quality.level === 'yellow' ? 'text-warning' : 'text-danger';
  }

  levelDotClass(quality: GradingQualityDto): string {
    return quality.level === 'green' ? 'bg-success' : quality.level === 'yellow' ? 'bg-warning' : 'bg-danger';
  }
}
