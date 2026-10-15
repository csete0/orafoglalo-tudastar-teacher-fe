import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { KodOlvasoComponent, codeFilePaths } from '../../shared/kod-olvaso/kod-olvaso.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import {
  EXAM_PART_LABEL,
  EXAM_PASS_RATIO,
  ExamPartKey,
  ExamSessionSnapshotDto,
  HeatmapCellDto,
  HeatmapStudentDto,
  HeatmapTestDto,
  TechnikumHeatmapDto,
} from '../../models/technikum.model';

/** A színskála sávjai (a sikerességi határ 40%). */
type Heat = 'fail' | 'low' | 'mid' | 'high';

/**
 * A csoport vizsgarész-térképe (PATRICKS-TECHNIKUM-MODUL-TERV.md 3.8): diák × az öt gyakorlati rész + az elméleti teszt, a
 * legjobb eredmény pontarányával. A dolgozatból jövő cella a beadott változatot (pillanatkép + bírálat) nyitja meg, a többi
 * a projekt osztály-nézetében a diák élő kódját (megjegyzésekkel). Fölötte a csoport technikumi dolgozatai a közzététellel.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vizsgaresz-terkep',
  standalone: true,
  imports: [DatePipe, RouterLink, LocalSpinnerComponent, KodOlvasoComponent],
  template: `
    @if (error(); as err) { <p class="text-danger text-sm mb-4" role="alert">{{ err }}</p> }
    @if (loading()) {
      <app-local-spinner />
    } @else if (map(); as m) {
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
                  <button type="button" class="btn btn-primary !px-2 !py-1 !text-xs shrink-0" [disabled]="publishing() === t.assignmentId"
                          (click)="publish(t)">Eredmények közzététele</button>
                }
              </div>
              @if (publishError()[t.assignmentId]; as err) {
                <p class="text-danger text-xs mt-2" role="alert" data-testid="publish-error">{{ err }}</p>
              }
            </li>
          }
        </ul>
      }

      <div class="flex flex-wrap gap-3 text-xs mb-3" aria-label="Jelmagyarázat">
        @for (l of legend; track l.heat) {
          <span class="inline-flex items-center gap-1.5"><span [class]="'legend-dot ' + heatClass[l.heat]"></span>{{ l.label }}</span>
        }
      </div>

      <div class="card overflow-x-auto">
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
                <td class="py-2 px-3 font-semibold whitespace-nowrap">{{ s.name }}</td>
                @for (p of m.parts; track p.key) {
                  <td class="py-1.5 px-1.5 text-center">
                    @if (cellOf(s, p.key); as c) {
                      @if (c.fromClassTest && c.sessionId) {
                        <button type="button" [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [attr.title]="cellTitle(c)"
                                [attr.data-testid]="'cell-' + s.userId + '-' + p.key" (click)="openSnapshot(c.sessionId)">{{ c.points }}/{{ c.maxPoints }}</button>
                      } @else if (c.assignmentId) {
                        <a [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [attr.title]="cellTitle(c)"
                           [attr.data-testid]="'cell-' + s.userId + '-' + p.key"
                           [routerLink]="['/feladatsorok/projektek/kiadas', c.assignmentId]" [queryParams]="{ diak: s.userId }">{{ c.points }}/{{ c.maxPoints }}</a>
                      } @else {
                        <span [class]="'heat-cell ' + heatClass[heat(c.ratio)]" [attr.title]="cellTitle(c)"
                              [attr.data-testid]="'cell-' + s.userId + '-' + p.key">{{ c.points }}/{{ c.maxPoints }}</span>
                      }
                    } @else {
                      <span class="heat-cell heat-cell--empty" aria-label="nincs eredmény">–</span>
                    }
                  </td>
                }
                <td class="py-1.5 px-1.5 text-center">
                  @if (s.theory; as t) {
                    <span [class]="'heat-cell ' + heatClass[heat(t.ratio)]" [attr.data-testid]="'theory-' + s.userId">{{ t.points }}/{{ t.maxPoints }}</span>
                  } @else {
                    <span class="heat-cell heat-cell--empty" aria-label="nincs eredmény">–</span>
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
        a dolgozat beadott változata a bírálattal, a gyakorlás a diák kódja megjegyzésekkel.
      </p>

      @if (snapshotLoading() || snapshot() || snapshotError()) {
        <section class="card p-4 mt-6" aria-labelledby="snapshot-title" data-testid="snapshot">
          <div class="flex items-center justify-between gap-3">
            <h2 id="snapshot-title" class="font-bold">
              @if (snapshot(); as sn) { {{ sn.studentName }} – {{ sn.projectTitle }} } @else { Beadott dolgozat }
              <span class="text-xs font-normal text-text-muted">(a beadott változat, csak olvasás)</span>
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
              }
              @if (sn.session.submittedAt) { · beadva: {{ utc(sn.session.submittedAt) | date: 'yyyy.MM.dd. HH:mm' }} }
            </p>
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
                        <ul class="text-xs mt-1 space-y-0.5">
                          @for (k of mc.cases; track k.key) {
                            <li><span [class]="k.passed ? 'text-success' : 'text-danger'">{{ k.passed ? '✓' : '✗' }}</span> {{ k.title }}
                              @if (k.reason) { <span class="text-text-muted">– {{ k.reason }}</span> }</li>
                          }
                        </ul>
                        @if (mc.compileOutput) { <pre class="compile-output">{{ mc.compileOutput }}</pre> }
                      }
                      @if (r.detail.ai; as ai) {
                        <p class="text-xs font-semibold mt-2">Szempontlista: {{ ai.points }}/{{ ai.maxPoints }} pont</p>
                        @if (ai.message) { <p class="text-xs text-text-muted">{{ ai.message }}</p> }
                        <ul class="text-xs mt-1 space-y-0.5">
                          @for (it of ai.items; track it.key) {
                            <li><strong>{{ it.points }}/{{ it.maxPoints }}</strong> {{ it.reason }}</li>
                          }
                        </ul>
                      }
                    }
                  </details>
                </li>
              }
            </ul>
            <app-kod-olvaso class="block mt-4" [files]="sn.files" [readOnlyPaths]="sn.readOnlyPaths" [(activePath)]="snapshotPath" />
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
    .heat-cell--empty { color: var(--color-text-muted); background: var(--color-bg-element); }
    .legend-dot { display: inline-block; width: 0.875rem; height: 0.875rem; border-radius: 0.25rem; }
    .compile-output { margin-top: 0.25rem; max-height: 12rem; overflow: auto; padding: 0.5rem; border-radius: 0.5rem; font-size: 0.6875rem;
      background: var(--color-bg-element); white-space: pre-wrap; }
  `],
})
export class VizsgareszTerkepComponent implements OnInit {
  private readonly api = inject(TeacherTechnikumService);
  private readonly toast = inject(ToastService);

  readonly groupId = input.required<number>();

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
    { heat: 'high', label: '80% fölött' },
  ];

  readonly map = signal<TechnikumHeatmapDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly publishing = signal<number | null>(null);
  readonly publishError = signal<Record<number, string>>({});
  readonly snapshot = signal<ExamSessionSnapshotDto | null>(null);
  readonly snapshotLoading = signal(false);
  readonly snapshotError = signal<string | null>(null);
  readonly snapshotPath = signal<string | null>(null);

  ngOnInit(): void {
    this.api.heatmap(this.groupId()).pipe(take(1), finalize(() => this.loading.set(false))).subscribe({
      next: (m) => this.map.set(m),
      error: (e) => this.error.set(extractErrorMessage(e, 'A vizsgarész-térkép betöltése sikertelen.')),
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
    return `${c.projectTitle} – ${source}, ${Math.round(c.ratio * 100)}%`;
  }

  publish(t: HeatmapTestDto): void {
    this.publishing.set(t.assignmentId);
    this.publishError.update(({ [t.assignmentId]: _, ...rest }) => rest);
    this.api.publish(t.assignmentId).pipe(take(1), finalize(() => this.publishing.set(null))).subscribe({
      next: () => {
        this.map.update((m) => m && { ...m, tests: m.tests.map((x) => (x.assignmentId === t.assignmentId ? { ...x, resultsPublished: true } : x)) });
        this.toast.success(`Közzétéve: ${t.projectTitle}`);
      },
      error: (e) => this.publishError.update((errs) => ({ ...errs, [t.assignmentId]: extractErrorMessage(e, 'A közzététel sikertelen.') })),
    });
  }

  openSnapshot(sessionId: number): void {
    this.snapshot.set(null);
    this.snapshotError.set(null);
    this.snapshotLoading.set(true);
    this.api.snapshot(sessionId).pipe(take(1), finalize(() => this.snapshotLoading.set(false))).subscribe({
      next: (sn) => {
        this.snapshot.set(sn);
        this.snapshotPath.set(codeFilePaths(sn.files, sn.readOnlyPaths)[0] ?? null);
      },
      error: (e) => this.snapshotError.set(extractErrorMessage(e, 'A beadott dolgozat betöltése sikertelen.')),
    });
  }

  closeSnapshot(): void {
    this.snapshot.set(null);
    this.snapshotError.set(null);
  }
}
