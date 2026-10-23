import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { finalize, take } from 'rxjs';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import { HeatmapStudentDto, HeatmapTestDto } from '../../models/technikum.model';

/**
 * A csoport technikumi dolgozatai a vizsgarész-térkép fölött: a beadott dolgozatok száma, a befejezés, és az eredmények közzététele
 * (megerősítéssel; csak ha mindenki befejezte, vagy elmúlt a befejezés).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-technikum-dolgozatok',
  imports: [DatePipe],
  host: { class: 'block' },
  template: `
    <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">Technikumi dolgozatok</h3>
    <ul class="space-y-2 mb-6" data-testid="technikum-tests">
      @for (t of tests(); track t.assignmentId) {
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
  `,
})
export class TechnikumDolgozatokComponent {
  private readonly api = inject(TeacherTechnikumService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly tests = input.required<HeatmapTestDto[]>();
  /** A térkép sorai: a megerősítő üzenet a dolgozat celláiból számol. */
  readonly students = input.required<HeatmapStudentDto[]>();
  /** Sikeres közzététel után a kiadás azonosítója (a szülő a térképen „közzétett”-re állítja). */
  readonly published = output<number>();

  readonly utc = parseUtc;
  readonly publishing = signal<number | null>(null);
  readonly publishError = signal<Record<number, string>>({});
  readonly publishWarning = signal<Record<number, string>>({});

  /** Közzétehető: mindenki befejezte (a szerver szerint), vagy elmúlt a befejezés (a nyitva hagyott lapon is). */
  canPublish(t: HeatmapTestDto): boolean {
    return !!t.everyoneFinished || (!!t.dueAt && parseUtc(t.dueAt) <= Date.now());
  }

  /** Közzététel megerősítéssel: hány beadott dolgozat, és hány rész 0 pontos (végleg sikertelen) / nem értékelt MI-szempontú. */
  async publish(t: HeatmapTestDto): Promise<void> {
    const cells = this.students().flatMap((s) => s.cells).filter((c) => c.fromClassTest && c.assignmentId === t.assignmentId);
    const failed = cells.filter((c) => c.gradingFailed).length;
    const notEvaluated = cells.filter((c) => !!c.aiNotEvaluatedPoints).length;
    const lines = [`${t.closedSessions} beadott dolgozat eredménye lesz látható a diákoknak (${t.projectTitle}), és értesítést kapnak róla.`];
    if (failed) lines.push(`${failed} rész bírálata végleg sikertelen – ezek 0 pontot kapnak.`);
    if (notEvaluated) lines.push(`${notEvaluated} részben nem értékelt MI-szempontok vannak (0 pont) – előbb kézzel is pontozhatod őket a cellára kattintva.`);
    const ok = await this.confirm.ask({ title: 'Eredmények közzététele', message: lines.join(' '), confirmLabel: 'Közzététel' });
    if (!ok) return;
    this.publishing.set(t.assignmentId);
    this.publishError.update(({ [t.assignmentId]: _, ...rest }) => rest);
    // Írás: a komponens megszűnésekor sem bontjuk (a közzététel a szerveren úgyis lefut, a visszajelzés a toast).
    this.api.publish(t.assignmentId).pipe(take(1), finalize(() => this.publishing.set(null))).subscribe({
      next: (r) => {
        this.published.emit(t.assignmentId);
        this.toast.success(`Közzétéve: ${t.projectTitle} (${r.published} dolgozat)`);
        if (r.sessionsWithFailedParts > 0) {
          this.publishWarning.update((w) => ({ ...w, [t.assignmentId]:
            `${r.sessionsWithFailedParts} dolgozat egy vagy több részének bírálata végleg sikertelen volt – azok a részek 0 pontot kaptak.` }));
        }
      },
      error: (e) => this.publishError.update((errs) => ({ ...errs, [t.assignmentId]: extractErrorMessage(e, 'A közzététel sikertelen.') })),
    });
  }
}
