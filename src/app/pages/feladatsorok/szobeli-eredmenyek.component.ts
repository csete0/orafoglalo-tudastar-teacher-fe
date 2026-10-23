import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import {
  ORAL_MODE_LABELS,
  ORAL_REVIEW_NOTE_MAX,
  ORAL_SESSION_STATUS_LABELS,
  OralTurnDto,
  TeacherOralResultRowDto,
  TeacherOralResultsDto,
  TeacherOralSessionDto,
} from '../../models/teacher-oral-exam.model';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';
import { parseUtc } from '../../shared/utc-date.util';

/** A leirat szakaszonként (szakasz nélküli, régi leiratnál egyetlen csoport, kulcs nélkül). */
export function transcriptSections(turns: OralTurnDto[]): { segment: string | null; turns: OralTurnDto[] }[] {
  const sections: { segment: string | null; turns: OralTurnDto[] }[] = [];
  for (const turn of turns) {
    const segment = turn.segment ?? null;
    const last = sections.at(-1);
    if (last && last.segment === segment) last.turns.push(turn);
    else sections.push({ segment, turns: [turn] });
  }
  return sections;
}

/**
 * Egy szóbeli kiadás eredményei: a csoport minden diákja (munkamenet nélkül is) MI- és tanári ponttal; a sorra kattintva oldalpanel
 * a szempontokkal (MI-pont + szerkeszthető tanári pont, megjegyzés), a kérdésekkel az elvárt elemekkel, a felkészülési kóddal és a
 * leirattal. Szóbeli dolgozatnál a fejlécben „Eredmények közzététele” (addig a diák nem látja a pontjait).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-szobeli-eredmenyek',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, LocalSpinnerComponent],
  template: `
    <div class="page-wide">
      <a routerLink="/feladatsorok/szobeli" class="text-sm text-text-muted hover:underline">← Vissza a szóbeli témákhoz</a>

      @if (loadError(); as err) {
        <p class="text-danger text-sm mt-4" role="alert" data-testid="oral-results-error">{{ err }}</p>
      } @else if (results(); as r) {
        <div class="flex items-start justify-between gap-4 flex-wrap mt-3">
          <div class="min-w-0">
            <h1 class="page-title break-words">{{ r.assignment.title }}</h1>
            <p class="text-sm text-text-muted mt-1" data-testid="oral-results-meta">
              {{ r.assignment.groupName }} ·
              <span class="badge" [class]="r.assignment.mode === 'exam' ? 'badge-warning' : 'badge-neutral'">{{ modeLabels[r.assignment.mode] }}</span>
              · {{ r.assignment.voiceMinutes }} perc
              @if (r.assignment.dueAt) { · határidő: {{ utc(r.assignment.dueAt) | date: 'yyyy.MM.dd. HH:mm' }} }
              @if (r.assignment.resultsPublishedAt) { · <span class="text-success font-semibold">eredmény közzétéve</span> }
              @if (r.assignment.revokedAt) { · <span class="text-danger font-semibold">visszavonva</span> }
            </p>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            @if (r.assignment.mode === 'exam' && !r.assignment.resultsPublishedAt) {
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="publish()" data-testid="oral-results-publish">Eredmények közzététele</button>
            }
            @if (!r.assignment.revokedAt) {
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="revoke()" data-testid="oral-results-revoke">Kiadás visszavonása</button>
            }
          </div>
        </div>
        <div class="hairline"></div>

        <div [class]="selectedId() !== null ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_32rem]' : 'grid gap-6'">
          <div class="data-table-scroll card">
            <table class="data-table" data-testid="oral-results-table">
              <thead>
                <tr><th>Diák</th><th>Állapot</th><th class="num">MI-pont</th><th class="num">Tanári pont</th><th>Kezdés</th></tr>
              </thead>
              <tbody>
                @for (row of r.rows; track row.userId) {
                  <tr [class.bg-primary-subtle]="row.sessionId !== null && row.sessionId === selectedId()">
                    <td>
                      @if (row.sessionId !== null) {
                        <button type="button" class="font-medium text-left hover:underline" (click)="select(row)"
                          [attr.data-testid]="'oral-row-' + row.userId">{{ row.studentName }}</button>
                      } @else {
                        {{ row.studentName }}
                      }
                      @if (row.leftGroup) {
                        <span class="badge badge-neutral whitespace-nowrap !text-[10px] !px-1.5 !py-0.5" [attr.data-testid]="'left-group-' + row.userId"
                            title="A diák azóta kilépett vagy kikerült a csoportból - a tagként írt dolgozata csak olvasható">kilépett a csoportból</span>
                      }
                      @if (row.awaitingParentConsent) {
                        <span class="badge badge-warning whitespace-nowrap !text-[10px] !px-1.5 !py-0.5" [attr.data-testid]="'awaiting-consent-' + row.userId"
                            title="16 év alatti diák: a szóbelihez (a hangja az OpenAI-hoz jut) a szülője hozzájárulása kell. A diák a Szóbeli oldalon adhatja meg a szülője e-mail-címét.">szülői hozzájárulásra vár</span>
                      }
                    </td>
                    <td>{{ statusLabel(row.status) }}</td>
                    <td class="num">{{ row.totalPoints !== null ? row.totalPoints + ' / ' + row.maxPoints : '–' }}</td>
                    <td class="num">{{ row.teacherTotalPoints ?? '–' }}</td>
                    <td>{{ row.startedAt ? (utc(row.startedAt) | date: 'MM.dd. HH:mm') : '–' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="text-text-muted">A csoportban nincs aktív diák.</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (selectedId() !== null) {
            <aside class="card p-4 space-y-4 min-w-0 self-start" aria-label="A diák szóbelije" data-testid="oral-session-panel">
              @if (sessionError(); as err) {
                <p class="text-danger text-sm" role="alert">{{ err }}</p>
              } @else if (session(); as s) {
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h2 class="font-bold text-lg break-words">{{ s.student.name }}</h2>
                    <p class="text-sm text-text-muted break-words">{{ s.itemTitle }} · {{ statusLabel(s.status) }}</p>
                  </div>
                  <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="close()">Bezárás</button>
                </div>
                @if (s.message) { <p class="text-sm bg-bg-element rounded-xl p-3">{{ s.message }}</p> }

                @if (s.criteria.length) {
                  <section>
                    <h3 class="font-semibold mb-2">
                      Szempontok · MI: {{ s.totalPoints ?? '–' }} / {{ s.maxPoints }}
                      @if (s.teacher) { · tanári: {{ s.teacher.totalPoints }} / {{ s.maxPoints }} }
                    </h3>
                    <ul class="space-y-3">
                      @for (c of s.criteria; track c.key) {
                        <li class="bg-bg-element rounded-xl p-3 text-sm" [attr.data-testid]="'oral-criterion-' + c.key">
                          <div class="flex items-center justify-between gap-2">
                            <span class="font-medium min-w-0 break-words">{{ c.title }}</span>
                            @if (c.feedbackOnly) {
                              <span class="badge badge-neutral shrink-0">pont nélkül</span>
                            } @else {
                              <span class="shrink-0 text-xs text-text-muted">MI: {{ c.points }} / {{ c.maxPoints }}</span>
                            }
                          </div>
                          <p class="text-text-muted mt-1 break-words">{{ c.reason }}</p>
                          @if (!c.feedbackOnly && canReview()) {
                            <label class="flex items-center gap-2 mt-2">Tanári pont
                              <input type="number" min="0" [max]="c.maxPoints" class="input !w-20" [ngModel]="points()[c.key]"
                                (ngModelChange)="setPoints(c.key, $event)" [ngModelOptions]="{ standalone: true }"
                                [attr.data-testid]="'oral-review-' + c.key" />
                              / {{ c.maxPoints }}
                            </label>
                          }
                        </li>
                      }
                    </ul>
                    @if (canReview()) {
                      <label class="block text-sm mt-3">Megjegyzés a diáknak (nem kötelező)
                        <textarea rows="3" class="input mt-1" [maxlength]="noteMax" [ngModel]="note()" (ngModelChange)="note.set($event)"
                          [ngModelOptions]="{ standalone: true }" data-testid="oral-review-note"></textarea>
                      </label>
                      @if (reviewError(); as err) { <p class="text-danger text-sm mt-2" role="alert" data-testid="oral-review-error">{{ err }}</p> }
                      <div class="flex flex-wrap justify-end gap-2 mt-2">
                        @if (s.teacher) {
                          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="deleteReview()" data-testid="oral-review-delete">Visszavonás</button>
                        }
                        <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveReview()" data-testid="oral-review-save">Mentés</button>
                      </div>
                    } @else {
                      <p class="text-xs text-text-muted mt-2">Felülpontozni csak értékelt szóbelit lehet.</p>
                    }
                  </section>
                }

                @if (s.plannedQuestions.length) {
                  <section>
                    <h3 class="font-semibold mb-2">Kérdések az elvárt elemekkel</h3>
                    <ol class="space-y-2 text-sm" data-testid="oral-planned-questions">
                      @for (q of s.plannedQuestions; track q.no) {
                        <li>
                          <p class="font-medium break-words">{{ q.no }}. {{ q.text }}</p>
                          <ul class="list-disc pl-5 text-text-muted">
                            @for (e of q.expected; track $index) { <li class="break-words">{{ e }}</li> }
                          </ul>
                        </li>
                      }
                    </ol>
                  </section>
                }

                @if (s.prepCode; as code) {
                  <details class="text-sm" data-testid="oral-prep-code">
                    <summary class="font-semibold cursor-pointer">A felkészülés alatt írt kód ({{ code.languageName }})</summary>
                    <pre class="mt-2 bg-bg-element rounded-xl p-3 overflow-x-auto text-xs whitespace-pre">{{ code.code }}</pre>
                  </details>
                }

                @if (s.transcript; as turns) {
                  <section data-testid="oral-transcript">
                    <h3 class="font-semibold mb-2">Leirat</h3>
                    @for (section of sections(); track $index; let i = $index) {
                      <details class="text-sm mb-2">
                        <summary class="cursor-pointer">{{ section.segment !== null ? i + 1 + '. szakasz' : 'A teljes felelet' }} ({{ section.turns.length }} megszólalás)</summary>
                        <ul class="mt-2 space-y-1">
                          @for (t of section.turns; track $index) {
                            <li class="break-words"><span class="font-semibold">{{ t.speaker === 'examiner' ? 'Vizsgáztató' : 'Diák' }}:</span> {{ t.text }}@if (t.interrupted) {<span class="ml-1 text-xs text-text-muted" data-testid="oral-turn-interrupted">(félbeszakítva)</span>}</li>
                          }
                        </ul>
                      </details>
                    }
                  </section>
                } @else if (s.transcriptDeleted) {
                  <p class="text-xs text-text-muted">A diák törölte a leiratot.</p>
                }
              } @else {
                <app-local-spinner />
              }
            </aside>
          }
        </div>
      } @else {
        <app-local-spinner />
      }
    </div>
  `,
})
export class SzobeliEredmenyekComponent implements OnInit {
  private readonly api = inject(TeacherOralExamService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly modeLabels = ORAL_MODE_LABELS;
  readonly noteMax = ORAL_REVIEW_NOTE_MAX;
  readonly utc = parseUtc;

  private readonly assignmentId = Number(this.route.snapshot.paramMap.get('id'));
  readonly results = signal<TeacherOralResultsDto | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal(false);

  readonly selectedId = signal<number | null>(null);
  readonly session = signal<TeacherOralSessionDto | null>(null);
  readonly sessionError = signal<string | null>(null);
  /** A szerkesztett tanári pontok szempont-kulcs szerint (az MI-ponttal vagy a meglévő felülpontozással előtöltve; üres mező: null). */
  readonly points = signal<Record<string, number | null>>({});
  readonly note = signal('');
  readonly reviewError = signal<string | null>(null);

  readonly canReview = computed(() => this.session()?.status === 'graded');
  readonly sections = computed(() => transcriptSections(this.session()?.transcript ?? []));

  ngOnInit(): void {
    this.api.results(this.assignmentId).pipe(take(1)).subscribe({
      next: (r) => this.results.set(r),
      error: (err) => this.loadError.set(extractErrorMessage(err, 'Az eredmények betöltése sikertelen.')),
    });
  }

  statusLabel(status: string | null): string {
    return status ? (ORAL_SESSION_STATUS_LABELS[status] ?? status) : 'Nem kezdte el';
  }

  select(row: TeacherOralResultRowDto): void {
    if (row.sessionId === null || row.sessionId === this.selectedId()) return;
    const sessionId = row.sessionId;
    this.selectedId.set(sessionId);
    this.session.set(null);
    this.sessionError.set(null);
    this.api.session(sessionId).pipe(take(1)).subscribe({
      next: (s) => {
        if (this.selectedId() === sessionId) this.applySession(s);
      },
      error: (err) => this.sessionError.set(extractErrorMessage(err, 'A szóbeli betöltése sikertelen.')),
    });
  }

  close(): void {
    this.selectedId.set(null);
    this.session.set(null);
  }

  setPoints(key: string, value: number | null): void {
    this.points.update((p) => ({ ...p, [key]: value }));
  }

  saveReview(): void {
    const s = this.session();
    if (!s || this.busy()) return;
    const scored = s.criteria.filter((c) => !c.feedbackOnly);
    // Az ürített mező null - a Number(null) === 0 miatt külön kell kiszűrni, különben csendben 0 pont menne.
    const valid = (p: number | null | undefined, max: number): p is number => p != null && Number.isInteger(p) && p >= 0 && p <= max;
    const invalid = scored.find((c) => !valid(this.points()[c.key], c.maxPoints));
    if (invalid) {
      this.reviewError.set(`„${invalid.title}”: 0 és ${invalid.maxPoints} közötti egész pont adható.`);
      return;
    }
    this.busy.set(true);
    this.reviewError.set(null);
    this.api
      .review(s.sessionId, { criteria: scored.map((c) => ({ key: c.key, points: this.points()[c.key]! })), note: this.note().trim() || null })
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.applySession(updated);
          this.toast.success('A tanári pontok mentve.');
        },
        error: (err) => this.reviewError.set(extractErrorMessage(err, 'A mentés nem sikerült.')),
      });
  }

  deleteReview(): void {
    const s = this.session();
    if (!s || this.busy()) return;
    this.busy.set(true);
    this.reviewError.set(null);
    this.api
      .deleteReview(s.sessionId)
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.applySession(updated);
          this.toast.success('A felülpontozás visszavonva - az MI-pont érvényes.');
        },
        error: (err) => this.reviewError.set(extractErrorMessage(err, 'A visszavonás nem sikerült.')),
      });
  }

  async publish(): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.ask({
      title: 'Eredmények közzététele',
      message: 'A diákok értesítést kapnak, és látják a pontjaikat (a felülpontozásaiddal együtt). A közzététel nem vonható vissza.',
      confirmLabel: 'Közzététel',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api
      .publishResults(this.assignmentId)
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (assignment) => {
          this.results.update((r) => (r ? { ...r, assignment } : r));
          this.toast.success('Az eredmények közzétéve.');
        },
        error: (err) => this.toast.warning(extractErrorMessage(err, 'A közzététel nem sikerült.')),
      });
  }

  async revoke(): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.ask({
      title: 'Kiadás visszavonása',
      message: 'A diákok nem látják és nem indíthatják többé ezt a szóbelit; a már elkészült szóbelik és az eredmények megmaradnak.',
      confirmLabel: 'Visszavonás',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api
      .revokeAssignment(this.assignmentId)
      .pipe(take(1), finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.results.update((r) => (r ? { ...r, assignment: { ...r.assignment, revokedAt: new Date().toISOString() } } : r));
          this.toast.success('A kiadás visszavonva.');
        },
        error: (err) => this.toast.warning(extractErrorMessage(err, 'A visszavonás nem sikerült.')),
      });
  }

  private applySession(s: TeacherOralSessionDto): void {
    this.session.set(s);
    const teacher = new Map((s.teacher?.criteria ?? []).map((c) => [c.key, c.points]));
    this.points.set(Object.fromEntries(s.criteria.filter((c) => !c.feedbackOnly).map((c) => [c.key, teacher.get(c.key) ?? c.points])));
    this.note.set(s.teacher?.note ?? '');
    this.reviewError.set(null);
    // A tábla tanári pontja a panel szerint.
    this.results.update((r) =>
      r ? { ...r, rows: r.rows.map((row) => (row.sessionId === s.sessionId ? { ...row, teacherTotalPoints: s.teacher?.totalPoints ?? null } : row)) } : r,
    );
  }
}
