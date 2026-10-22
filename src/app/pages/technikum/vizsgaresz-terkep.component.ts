import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Observable, finalize, take } from 'rxjs';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { PillanatkepKodComponent } from './pillanatkep-kod.component';
import { GepiFelulbiralasComponent } from './gepi-felulbiralas.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import {
  EXAM_PART_LABEL,
  EXAM_PASS_RATIO,
  ExamPartKey,
  ExamPartResultDto,
  ExamSessionSnapshotDto,
  HeatmapCellDto,
  HeatmapStudentDto,
  HeatmapTestDto,
  RubricItemOutcomeDto,
  TechnikumHeatmapDto,
} from '../../models/technikum.model';

/** A színskála sávjai (a sikerességi határ 40%). */
type Heat = 'fail' | 'low' | 'mid' | 'high';

/**
 * A csoport vizsgarész-térképe (PATRICKS-TECHNIKUM-MODUL-TERV.md 3.8): diák × az öt gyakorlati rész + az elméleti teszt, a
 * legjobb eredmény pontarányával. A dolgozatból jövő cella a beadott változatot (pillanatkép + bírálat, vizsgarészenként
 * soronkénti megjegyzésekkel és a grafikus rész képernyőképeivel) nyitja meg, a többi
 * a projekt osztály-nézetében a diák élő kódját (megjegyzésekkel). Fölötte a csoport technikumi dolgozatai a közzététellel.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vizsgaresz-terkep',
  standalone: true,
  imports: [DatePipe, RouterLink, LocalSpinnerComponent, PillanatkepKodComponent, GepiFelulbiralasComponent],
  template: `
    @if (error(); as err) { <p class="text-danger text-sm mb-4" role="alert">{{ err }}</p> }
    @if (loading()) {
      <app-local-spinner />
    } @else if (map(); as m) {
      @if (m.testsOnly) {
        <p class="text-sm text-text-muted mb-4" role="note" data-testid="tests-only-note">
          Prémium előfizetés nélkül a csoportnak már kiadott technikumi dolgozatok eredménye látszik: megnyithatod, pontozhatod és
          közzéteheted. A gyakorlás, a próbavizsga és az elméleti teszt eredménye, valamint új dolgozat kiadása Prémiummal érhető el.
        </p>
      }
      @if (m.tests.length) {
        <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">Technikumi dolgozatok</h3>
        <ul class="space-y-2 mb-6" data-testid="technikum-tests">
          @for (t of m.tests; track t.assignmentId) {
            <li class="card !rounded-xl p-3 text-sm" [attr.data-testid]="'technikum-test-' + t.assignmentId">
              <div class="flex items-center gap-3 flex-wrap">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ t.projectTitle }}</p>
                  <p class="text-xs text-text-muted">
                    {{ t.closedSessions }} beadott dolgozat
                    @if (t.dueAt) { · befejezés: {{ utc(t.dueAt) | date: 'yyyy.MM.dd. HH:mm' }} }
                  </p>
                </div>
                @if (t.resultsPublished) {
                  <span class="badge badge-success shrink-0">Eredmény közzétéve</span>
                } @else {
                  <button type="button" class="btn btn-primary !px-2 !py-1 !text-xs shrink-0" [disabled]="publishing() === t.assignmentId || !canPublish(t)"
                          [attr.aria-describedby]="canPublish(t) ? null : 'publish-wait-' + t.assignmentId" (click)="publish(t)">Eredmények közzététele</button>
                }
              </div>
              @if (!t.resultsPublished && !canPublish(t)) {
                <p class="text-text-muted text-xs mt-2" [id]="'publish-wait-' + t.assignmentId" data-testid="publish-wait">
                  Akkor teheted közzé, ha minden diák befejezte (beadta, vagy lejárt az ideje), vagy a befejezés után – addig az eredmény nem szivároghat ki.
                </p>
              }
              @if (publishWarning()[t.assignmentId]; as warn) {
                <p class="text-warning text-xs mt-2" role="status" data-testid="publish-warning">{{ warn }}</p>
              }
              @if (publishError()[t.assignmentId]; as err) {
                <p class="text-danger text-xs mt-2" role="alert" data-testid="publish-error">{{ err }}</p>
              }
            </li>
          }
        </ul>
      }

      <div class="flex flex-wrap gap-3 text-xs mb-3" role="group" aria-label="Jelmagyarázat">
        @for (l of legend; track l.heat) {
          <span class="inline-flex items-center gap-1.5"><span [class]="'legend-dot ' + heatClass[l.heat]" aria-hidden="true"></span>{{ l.label }}</span>
        }
      </div>

      <!-- relative: a cellák .sr-only (abszolút) szövegei is a görgető dobozon belül maradnak, különben 390 px-en az egész lap
           vízszintesen görgethető lesz (a táblázat a saját dobozában görög). -->
      <div class="card relative max-w-full overflow-x-auto" data-testid="heatmap-scroll">
        <table class="w-full text-sm" data-testid="heatmap">
          <thead>
            <tr class="text-left border-b border-border-default">
              <th class="py-2 px-3">Diák</th>
              @for (p of m.parts; track p.key) {
                <th class="py-2 px-2 text-center text-xs font-semibold">{{ partLabel[p.key] }}<span class="block font-normal text-text-muted">{{ p.maxPoints }} pont</span></th>
              }
              <th class="py-2 px-2 text-center text-xs font-semibold">Elméleti teszt<span class="block font-normal text-text-muted">{{ m.theoryMaxPoints }} pont</span></th>
            </tr>
          </thead>
          <tbody>
            @for (s of m.students; track s.userId) {
              <tr class="border-b border-border-default last:border-b-0" [attr.data-testid]="'heat-row-' + s.userId">
                <th scope="row" class="py-2 px-3 font-semibold whitespace-nowrap text-left">{{ s.name }}
                  @if (s.leftGroup) {
                    <span class="badge badge-neutral !text-[0.625rem] font-normal" [attr.data-testid]="'left-group-' + s.userId"
                          title="A diák azóta kilépett vagy kikerült a csoportból - csak a tagként írt dolgozatai látszanak, csak olvasva">kilépett a csoportból</span>
                  }
                </th>
                @for (p of m.parts; track p.key) {
                  <td class="py-1.5 px-1.5 text-center">
                    @if (cellOf(s, p.key); as c) {
                      @if (c.fromClassTest && c.sessionId) {
                        <button type="button" [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [class.heat-cell--failed]="c.gradingFailed" [class.heat-cell--ai-na]="!!c.aiNotEvaluatedPoints" [attr.title]="cellTitle(c)"
                                [attr.data-testid]="'cell-' + s.userId + '-' + p.key" (click)="openSnapshot(c.sessionId)">{{ c.points }}/{{ c.maxPoints }}@if (c.gradingFailed) {<span aria-hidden="true"> !</span><span class="sr-only"> – bírálat sikertelen</span>}@if (c.aiNotEvaluatedPoints) {<span aria-hidden="true">*</span><span class="sr-only"> – {{ c.aiNotEvaluatedPoints }} pont MI-szempont nem értékelt</span>}</button>
                      } @else if (c.assignmentId) {
                        <a [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [class.heat-cell--failed]="c.gradingFailed" [class.heat-cell--ai-na]="!!c.aiNotEvaluatedPoints" [attr.title]="cellTitle(c)"
                           [attr.data-testid]="'cell-' + s.userId + '-' + p.key"
                           [routerLink]="['/feladatsorok/projektek/kiadas', c.assignmentId]" [queryParams]="{ diak: s.userId }">{{ c.points }}/{{ c.maxPoints }}@if (c.gradingFailed) {<span class="sr-only"> – bírálat sikertelen</span>}@if (c.aiNotEvaluatedPoints) {<span aria-hidden="true">*</span><span class="sr-only"> – {{ c.aiNotEvaluatedPoints }} pont MI-szempont nem értékelt</span>}</a>
                      } @else {
                        <span [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [class.heat-cell--failed]="c.gradingFailed" [class.heat-cell--ai-na]="!!c.aiNotEvaluatedPoints" [attr.title]="cellTitle(c)"
                              [attr.data-testid]="'cell-' + s.userId + '-' + p.key">{{ c.points }}/{{ c.maxPoints }}@if (c.gradingFailed) {<span class="sr-only"> – bírálat sikertelen</span>}@if (c.aiNotEvaluatedPoints) {<span aria-hidden="true">*</span><span class="sr-only"> – {{ c.aiNotEvaluatedPoints }} pont MI-szempont nem értékelt</span>}</span>
                      }
                    } @else {
                      <span class="heat-cell heat-cell--empty"><span aria-hidden="true">–</span><span class="sr-only">nincs eredmény</span></span>
                    }
                  </td>
                }
                <td class="py-1.5 px-1.5 text-center">
                  @if (s.theory; as t) {
                    <span [class]="'heat-cell ' + heatClass[heat(t.ratio)]" [attr.data-testid]="'theory-' + s.userId">{{ t.points }}/{{ t.maxPoints }}</span>
                  } @else {
                    <span class="heat-cell heat-cell--empty"><span aria-hidden="true">–</span><span class="sr-only">nincs eredmény</span></span>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td class="py-3 px-3 text-text-muted" [attr.colspan]="m.parts.length + 2">A csoportnak még nincs tagja.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="text-xs text-text-muted mt-2">
        Részenként a legjobb bírált eredmény; ha a diák írt belőle dolgozatot ebben a csoportban, az számít. Kattints a cellára:
        a dolgozat beadott változata a bírálattal (soronként megjegyzést írhatsz, a diák a közzététel után látja), a gyakorlás a diák kódja megjegyzésekkel. A felkiáltójeles, piros keretes
        dolgozat-rész bírálata végleg sikertelen volt, ezért 0 pontnak számít. A csillagos, szaggatott keretes rész MI-szempontjait
        nem értékeltük (elfogyott MI-keret vagy MI-hiba): azok 0 pontot kaptak, a gépi tesztek pontja megmaradt - dolgozatnál a
        cellára kattintva látod, mely szempontok ezek, és kézzel pontozhatod őket.
      </p>

      @if (snapshotLoading() || snapshot() || snapshotError()) {
        <section class="card p-4 mt-6" aria-labelledby="snapshot-title" data-testid="snapshot">
          <div class="flex items-center justify-between gap-3">
            <h2 id="snapshot-title" class="font-bold">
              @if (snapshot(); as sn) { {{ sn.studentName }} – {{ sn.projectTitle }} } @else { Beadott dolgozat }
              @if (snapshot()?.leftGroup) {
                <span class="text-xs font-normal text-text-muted" data-testid="snapshot-left-group">(a beadott változat - a diák kilépett a csoportból, csak olvasható)</span>
              } @else {
                <span class="text-xs font-normal text-text-muted">(a beadott változat - a sorszámra kattintva megjegyzést írhatsz)</span>
              }
            </h2>
            <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="closeSnapshot()">Bezárás</button>
          </div>
          @if (snapshotLoading()) {
            <app-local-spinner />
          } @else if (snapshot(); as sn) {
            <p class="text-sm mt-2">
              @if (sn.session.totalPoints !== null) {
                Összesen: <strong>{{ sn.session.totalPoints }}/{{ sn.session.maxPoints }} pont</strong>
                @if (sn.session.passed !== null) { · <span [class]="sn.session.passed ? 'text-success' : 'text-danger'">{{ sn.session.passed ? 'megfelelt' : 'nem felelt meg' }}</span> }
                @else if (sn.session.notEvaluatedPoints) { · <span class="text-warning" data-testid="snapshot-partial">részleges eredmény</span> }
              }
              @if (sn.session.submittedAt) { · beadva: {{ utc(sn.session.submittedAt) | date: 'yyyy.MM.dd. HH:mm' }} }
            </p>
            @if (sn.leftGroup && sn.session.notEvaluatedPoints) {
              <p class="text-xs text-text-muted mt-1" role="note" data-testid="snapshot-left-ungradable">A diák kilépett, nem pontozható: a nem értékelt szempontok kézzel sem pontozhatók.</p>
            }
            @if (sn.session.notEvaluatedPoints) {
              <p class="text-xs text-warning mt-1" role="note" data-testid="snapshot-not-evaluated">
                {{ sn.session.notEvaluatedPoints }} pontnyi MI-szempont nem lett értékelve (MI-keret vagy MI-hiba) – ezek 0 pontot kaptak,
                a gépi pont megmaradt. A megfelelt-ítélet csak akkor látszik, ha ettől függetlenül eldönthető.
              </p>
            }
            <ul class="mt-3 space-y-2 text-sm" data-testid="snapshot-parts">
              @for (part of sn.session.parts; track part.partKey) {
                <li class="rounded-xl border border-border-default p-3">
                  <details>
                    <summary class="cursor-pointer flex items-center justify-between gap-3">
                      <span class="font-semibold">{{ partLabel[part.partKey] ?? part.title }}</span>
                      @if (part.result; as r) {
                        @if (r.status === 'graded') {
                          <span [class]="'heat-cell ' + heatClass[heat(r.maxPoints ? r.points / r.maxPoints : 0)]">{{ r.points }}/{{ r.maxPoints }}</span>
                        } @else {
                          <span class="text-xs text-warning">{{ r.status === 'pending' ? 'bírálat folyamatban' : 'bírálati hiba – újrabírálásra vár' }}</span>
                        }
                      } @else {
                        <span class="text-xs text-text-muted">nincs bírálat</span>
                      }
                    </summary>
                    @if (part.result; as r) {
                      @if (r.detail.message) { <p class="text-xs text-text-muted mt-2">{{ r.detail.message }}</p> }
                      @if (r.detail.machine; as mc) {
                        <p class="text-xs font-semibold mt-2">Gépi ellenőrzés: {{ mc.points }}/{{ mc.maxPoints }} pont</p>
                        @if (machineOverridable(r) && !sn.leftGroup) {
                          <!-- Saját gépes kliens-rész: a gépi esetek csoportonként kézzel felülbírálhatók. -->
                          <app-gepi-felulbiralas [result]="r" (saved)="onReviewed($event)" />
                        } @else {
                          <ul class="text-xs mt-1 space-y-0.5">
                            @for (k of mc.cases; track k.key) {
                              <li><span [class]="k.passed ? 'text-success' : 'text-danger'">{{ k.passed ? '✓' : '✗' }}</span> {{ k.title }}
                                @if (k.reason) { <span class="text-text-muted">– {{ k.reason }}</span> }</li>
                            }
                          </ul>
                        }
                        @if (mc.compileOutput) { <pre class="compile-output">{{ mc.compileOutput }}</pre> }
                      }
                      @if (r.detail.ai; as ai) {
                        <p class="text-xs font-semibold mt-2">Szempontlista: {{ ai.points }}/{{ ai.maxPoints }} pont</p>
                        @if (ai.message && hasOpenItems(ai.items)) { <p class="text-xs text-text-muted">{{ ai.message }}</p> }
                        @if (r.status === 'graded' && ai.items.length && (ai.status === 'done' || ai.status === 'unavailable') && !sn.leftGroup) {
                          <!-- Kézi pontozás: bármely szempont felülírható, a „nem értékelt”-ek kiemelve. -->
                          <ul class="text-xs mt-1 space-y-1" [attr.data-testid]="'rubric-' + r.id">
                            @for (it of ai.items; track it.key) {
                              <li class="flex items-start gap-2 rounded-lg px-1 py-0.5" [class.rubric-open]="it.notEvaluated && it.aiPoints == null">
                                <input type="number" min="0" [max]="it.maxPoints" step="1" class="input !w-14 !px-1.5 !py-0.5 !text-xs shrink-0"
                                       [value]="draftOf(r.id, it.key, it.points)" [attr.aria-label]="'Pont (0–' + it.maxPoints + '): ' + it.reason"
                                       [attr.data-testid]="'rubric-input-' + it.key" (input)="setDraft(r.id, it.key, $any($event.target).value)" />
                                <span class="shrink-0 pt-1">/ {{ it.maxPoints }}</span>
                                <span class="pt-1">
                                  @if (it.notEvaluated && it.aiPoints == null) {
                                    <span class="badge badge-warning !text-[0.625rem]" data-testid="item-not-evaluated">nem értékelt</span>
                                  } @else if (it.aiPoints != null) {
                                    <span class="badge badge-primary !text-[0.625rem]" data-testid="item-teacher-scored">tanár pontozta{{ it.notEvaluated ? '' : ' (MI: ' + it.aiPoints + ')' }}</span>
                                  }
                                  {{ it.reason }}
                                </span>
                              </li>
                            }
                          </ul>
                          <div class="flex flex-wrap items-center gap-2 mt-2">
                            <button type="button" class="btn btn-primary !px-2 !py-1 !text-xs" [disabled]="scoring() === r.id || !dirty(r.id)"
                                    [attr.data-testid]="'rubric-save-' + r.id" (click)="saveRubric(r.id, ai.items)">Pontok mentése</button>
                            @if (r.detail.review) {
                              <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" [disabled]="scoring() === r.id"
                                      [attr.data-testid]="'rubric-revert-' + r.id" (click)="revertRubric(r.id)">Vissza az MI pontjaira</button>
                              <span class="text-text-muted">kézzel pontozva: {{ utc(r.detail.review.reviewedAt) | date: 'yyyy.MM.dd. HH:mm' }}</span>
                            }
                          </div>
                          @if (rubricError()[r.id]; as err) { <p class="text-danger text-xs mt-1" role="alert" data-testid="rubric-error">{{ err }}</p> }
                        } @else {
                          <ul class="text-xs mt-1 space-y-0.5">
                            @for (it of ai.items; track it.key) {
                              <li><strong>{{ it.points }}/{{ it.maxPoints }}</strong>
                                @if (it.notEvaluated && it.aiPoints == null) { <span class="badge badge-warning !text-[0.625rem]" data-testid="item-not-evaluated">nem értékelt</span> }
                                {{ it.reason }}</li>
                            }
                          </ul>
                        }
                      }
                    }
                  </details>
                </li>
              }
            </ul>
            <app-pillanatkep-kod [snapshot]="sn" />
          } @else if (snapshotError(); as err) {
            <p class="text-danger text-sm mt-2" role="alert">{{ err }}</p>
          }
        </section>
      }
    }
  `,
  styles: [`
    .heat-cell { display: inline-block; min-width: 3.25rem; padding: 0.25rem 0.375rem; border-radius: 0.5rem; font-size: 0.75rem;
      font-weight: 600; font-variant-numeric: tabular-nums; text-align: center; }
    a.heat-cell:hover, button.heat-cell:hover, a.heat-cell:focus-visible, button.heat-cell:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    .heat-cell--failed { box-shadow: inset 0 0 0 2px var(--color-danger); }
    .heat-cell--ai-na { outline: 2px dashed var(--color-warning); outline-offset: -2px; }
    .rubric-open { background: var(--color-warning-subtle); }
    .heat-cell--empty { color: var(--color-text-muted); background: var(--color-bg-element); }
    .legend-dot { display: inline-block; width: 0.875rem; height: 0.875rem; border-radius: 0.25rem; }
    .compile-output { margin-top: 0.25rem; max-height: 12rem; overflow: auto; padding: 0.5rem; border-radius: 0.5rem; font-size: 0.6875rem;
      background: var(--color-bg-element); white-space: pre-wrap; }
  `],
})
export class VizsgareszTerkepComponent {
  private readonly api = inject(TeacherTechnikumService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly groupId = input.required<number>();
  /** A technikumi modul ki van kapcsolva (BE: 404 FeatureDisabled) - a szülő elrejti a fület. */
  readonly unavailable = output<void>();

  readonly utc = parseUtc;
  readonly partLabel = EXAM_PART_LABEL;
  readonly heatClass: Record<Heat, string> = {
    fail: 'bg-danger-subtle text-danger',
    low: 'bg-warning-subtle text-warning',
    mid: 'bg-primary-subtle text-primary',
    high: 'bg-success-subtle text-success',
  };
  readonly legend: { heat: Heat; label: string }[] = [
    { heat: 'fail', label: '40% alatt (nem felelt meg)' },
    { heat: 'low', label: '40–59%' },
    { heat: 'mid', label: '60–79%' },
    { heat: 'high', label: '80% és fölötte' },
  ];

  readonly map = signal<TechnikumHeatmapDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly publishing = signal<number | null>(null);
  readonly publishError = signal<Record<number, string>>({});
  readonly publishWarning = signal<Record<number, string>>({});
  readonly snapshot = signal<ExamSessionSnapshotDto | null>(null);
  readonly snapshotLoading = signal(false);
  readonly snapshotError = signal<string | null>(null);
  /** Kézi pontozás: résztenként (bírálat-azonosító) a módosított szempontpontok szövegként, a mentésig. */
  readonly drafts = signal<Record<number, Record<string, string>>>({});
  readonly scoring = signal<number | null>(null);
  readonly rubricError = signal<Record<number, string>>({});

  constructor() {
    // Másik csoportra navigálva (ugyanaz a komponens, új útvonal-paraméter) minden az új csoporté: térkép újra, nyitott dolgozat zárva.
    effect(() => {
      this.groupId();
      untracked(() => {
        this.closeSnapshot();
        this.map.set(null);
        this.error.set(null);
        this.publishError.set({});
        this.publishWarning.set({});
        this.loading.set(true);
        this.loadMap();
      });
    });
  }

  private loadMap(): void {
    const groupId = this.groupId();
    this.api.heatmap(groupId).pipe(take(1), finalize(() => this.loading.set(false))).subscribe({
      // Közben másik csoportra váltott: a régi válasz eldobva.
      next: (m) => groupId === this.groupId() && this.map.set(m),
      error: (e) => {
        this.error.set(extractErrorMessage(e, 'A vizsgarész-térkép betöltése sikertelen.'));
        if (e instanceof HttpErrorResponse && e.status === 404 && e.error?.errorType === 'FeatureDisabled') this.unavailable.emit();
      },
    });
  }

  heat(ratio: number): Heat {
    if (ratio < EXAM_PASS_RATIO) return 'fail';
    if (ratio < 0.6) return 'low';
    return ratio < 0.8 ? 'mid' : 'high';
  }

  cellOf(s: HeatmapStudentDto, part: ExamPartKey): HeatmapCellDto | undefined {
    return s.cells.find((c) => c.partKey === part);
  }

  cellTitle(c: HeatmapCellDto): string {
    const source = c.fromClassTest ? 'dolgozat' : c.source === 'exam' ? 'próbavizsga' : 'gyakorlás';
    const failed = c.gradingFailed ? ' – a bírálat végleg sikertelen, 0 pontnak számít' : '';
    const ai = c.aiNotEvaluatedPoints ? ` – ${c.aiNotEvaluatedPoints} pont MI-szempont nem értékelt (MI-keret / MI-hiba), 0 pontnak számít` : '';
    return `${c.projectTitle} – ${source}, ${Math.round(c.ratio * 100)}%${failed}${ai}`;
  }

  /** Közzétehető: mindenki befejezte (a szerver szerint), vagy elmúlt a befejezés (a nyitva hagyott lapon is). */
  canPublish(t: HeatmapTestDto): boolean {
    return !!t.everyoneFinished || (!!t.dueAt && parseUtc(t.dueAt) <= Date.now());
  }

  /** Közzététel megerősítéssel: hány beadott dolgozat, és hány rész 0 pontos (végleg sikertelen) / nem értékelt MI-szempontú. */
  async publish(t: HeatmapTestDto): Promise<void> {
    const cells = (this.map()?.students ?? []).flatMap((s) => s.cells).filter((c) => c.fromClassTest && c.assignmentId === t.assignmentId);
    const failed = cells.filter((c) => c.gradingFailed).length;
    const notEvaluated = cells.filter((c) => !!c.aiNotEvaluatedPoints).length;
    const lines = [`${t.closedSessions} beadott dolgozat eredménye lesz látható a diákoknak (${t.projectTitle}), és értesítést kapnak róla.`];
    if (failed) lines.push(`${failed} rész bírálata végleg sikertelen – ezek 0 pontot kapnak.`);
    if (notEvaluated) lines.push(`${notEvaluated} részben nem értékelt MI-szempontok vannak (0 pont) – előbb kézzel is pontozhatod őket a cellára kattintva.`);
    const ok = await this.confirm.ask({ title: 'Eredmények közzététele', message: lines.join(' '), confirmLabel: 'Közzététel' });
    if (!ok) return;
    this.publishing.set(t.assignmentId);
    this.publishError.update(({ [t.assignmentId]: _, ...rest }) => rest);
    this.api.publish(t.assignmentId).pipe(take(1), finalize(() => this.publishing.set(null))).subscribe({
      next: (r) => {
        this.map.update((m) => m && { ...m, tests: m.tests.map((x) => (x.assignmentId === t.assignmentId ? { ...x, resultsPublished: true } : x)) });
        this.toast.success(`Közzétéve: ${t.projectTitle} (${r.published} dolgozat)`);
        if (r.sessionsWithFailedParts > 0) {
          this.publishWarning.update((w) => ({ ...w, [t.assignmentId]:
            `${r.sessionsWithFailedParts} dolgozat egy vagy több részének bírálata végleg sikertelen volt – azok a részek 0 pontot kaptak.` }));
        }
      },
      error: (e) => this.publishError.update((errs) => ({ ...errs, [t.assignmentId]: extractErrorMessage(e, 'A közzététel sikertelen.') })),
    });
  }

  openSnapshot(sessionId: number): void {
    this.closeSnapshot();
    this.snapshotLoading.set(true);
    this.api.snapshot(sessionId).pipe(take(1), finalize(() => this.snapshotLoading.set(false))).subscribe({
      next: (sn) => this.snapshot.set(sn),
      error: (e) => this.snapshotError.set(extractErrorMessage(e, 'A beadott dolgozat betöltése sikertelen.')),
    });
  }

  /**
   * A gépi esetek kézi felülbírálata: csak értékelt, lefutott gépi bírálatú, saját gépes (build-módú) kliens-részen - a build-módot
   * a bírálatkor rögzített csoportkulcsok jelzik (BE: CaseDetail.GroupKey csak build-módban), nem a mostani feltöltés.
   */
  machineOverridable(r: ExamPartResultDto): boolean {
    const mc = r.detail.machine;
    return r.partKey === 'client' && r.status === 'graded' && mc?.status === 'done' && mc.cases.some((c) => c.groupKey != null);
  }

  /** Gépi felülbírálás után: a friss pillanatkép és a térkép pontjai. */
  onReviewed(sn: ExamSessionSnapshotDto): void {
    this.snapshot.set(sn);
    this.loadMap();
  }

  hasOpenItems(items: RubricItemOutcomeDto[]): boolean {
    return items.length === 0 || items.some((i) => i.notEvaluated && i.aiPoints == null);
  }

  draftOf(resultId: number, key: string, points: number): string {
    return this.drafts()[resultId]?.[key] ?? String(points);
  }

  setDraft(resultId: number, key: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [resultId]: { ...d[resultId], [key]: value } }));
    this.rubricError.update(({ [resultId]: _, ...rest }) => rest);
  }

  dirty(resultId: number): boolean {
    return Object.keys(this.drafts()[resultId] ?? {}).length > 0;
  }

  saveRubric(resultId: number, items: RubricItemOutcomeDto[]): void {
    const draft = this.drafts()[resultId] ?? {};
    const scores: { key: string; points: number }[] = [];
    for (const item of items) {
      if (!(item.key in draft)) continue;
      const points = Number(draft[item.key]);
      if (draft[item.key].trim() === '' || !Number.isInteger(points) || points < 0 || points > item.maxPoints) {
        this.rubricError.update((e) => ({ ...e, [resultId]: `A pont 0 és ${item.maxPoints} közötti egész szám lehet: ${item.reason}` }));
        return;
      }
      scores.push({ key: item.key, points });
    }
    this.runRubric(resultId, this.api.scoreRubric(resultId, scores), 'A pontok mentve.');
  }

  revertRubric(resultId: number): void {
    this.runRubric(resultId, this.api.revertRubric(resultId), 'Visszaállítva az MI pontjaira.');
  }

  private runRubric(resultId: number, request: Observable<ExamSessionSnapshotDto>, message: string): void {
    this.scoring.set(resultId);
    this.rubricError.update(({ [resultId]: _, ...rest }) => rest);
    request.pipe(take(1), finalize(() => this.scoring.set(null))).subscribe({
      next: (sn) => {
        this.snapshot.set(sn);
        this.drafts.update(({ [resultId]: _, ...rest }) => rest);
        this.rubricError.set({}); // a friss pillanatképhez a korábbi hibák már nem tartoznak
        this.toast.success(message);
        this.loadMap();
      },
      error: (e) => this.rubricError.update((errs) => ({ ...errs, [resultId]: extractErrorMessage(e, 'A pontok mentése sikertelen.') })),
    });
  }

  closeSnapshot(): void {
    this.snapshot.set(null);
    this.snapshotError.set(null);
    this.drafts.set({});
    this.rubricError.set({});
  }
}
