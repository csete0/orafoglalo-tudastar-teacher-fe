import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Observable, finalize, take } from 'rxjs';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ToastService } from '../../shared/toast/toast.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import { CaseDetailDto, ExamPartResultDto, ExamSessionSnapshotDto } from '../../models/technikum.model';

/** Egy csoport kézi ítélete: a gépi marad, vagy kézzel átment / elbukott. */
const VERDICTS = ['gepi', 'atment', 'elbukott'] as const;
type Verdict = (typeof VERDICTS)[number];

function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}

interface CaseGroup {
  key: string;
  /** Egyetlen, csoport nélküli eset: a címe a csoport neve. */
  single: boolean;
  label: string;
  cases: CaseDetailDto[];
  points: number;
  /** Az eredeti gépi ítélet: a csoport minden esete átment. */
  machinePassed: boolean;
  /** A mentett kézi ítélet; 'gepi' = nincs felülbírálva. */
  saved: Verdict;
}

/** A gépi esetek csoportjai (csoport nélkül az eset a saját csoportja, a BE ExamPartTeacherReviewService szabálya szerint). */
export function caseGroups(cases: CaseDetailDto[]): CaseGroup[] {
  const byKey = new Map<string, CaseDetailDto[]>();
  for (const c of cases) {
    const key = c.groupKey ?? c.key;
    byKey.set(key, [...(byKey.get(key) ?? []), c]);
  }
  return [...byKey].map(([key, list]) => {
    const overridden = list.some((c) => c.machinePassed != null);
    const passed = list.every((c) => c.passed);
    const single = list.length === 1 && list[0].key === key;
    return {
      key,
      single,
      label: single ? list[0].title : key,
      cases: list,
      points: list.reduce((sum, c) => sum + c.points, 0),
      machinePassed: list.every((c) => c.machinePassed ?? c.passed),
      saved: overridden ? (passed ? 'atment' : 'elbukott') : 'gepi',
    };
  });
}

/**
 * Saját gépes (build-módú) kliens-rész gépi eseteinek kézi felülbírálata csoportonként (a jsdom-mérő korlátainak ellensúlya): kézi
 * „átment / elbukott” ítélet + a diák elől rejtett megjegyzés. Az eredeti gépi ítélet megmarad (visszavonható); mentés után a
 * frissített beadott dolgozat a szülőhöz megy (a szempont-felülírás mintája a vizsgarész-térképen).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-gepi-felulbiralas',
  standalone: true,
  imports: [DatePipe],
  template: `
    @let rid = result().id;
    <ul class="text-xs mt-1 space-y-2" [attr.data-testid]="'machine-groups-' + rid">
      @for (g of groups(); track g.key) {
        <li class="group-row" [class.group-row--overridden]="g.saved !== 'gepi'" [attr.data-testid]="'machine-group-' + g.key">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ g.label }}</span>
            <span class="text-text-muted">{{ g.points }} pont · gépi ítélet: {{ g.machinePassed ? 'átment' : 'elbukott' }}</span>
            @if (g.saved !== 'gepi') { <span class="badge badge-primary !text-[0.625rem]" data-testid="group-teacher-judged">tanár bírálta</span> }
            <label class="sr-only" [for]="'machine-verdict-' + rid + '-' + $index">Ítélet: {{ g.label }}</label>
            <select class="input !w-auto !px-1.5 !py-0.5 !text-xs ml-auto" [id]="'machine-verdict-' + rid + '-' + $index"
                    #verdictSelect [value]="verdictOf(g)" [attr.data-testid]="'machine-verdict-' + g.key" (change)="setVerdict(g.key, verdictSelect.value)">
              <option value="gepi">Gépi ítélet</option>
              <option value="atment">Kézi: átment</option>
              <option value="elbukott">Kézi: elbukott</option>
            </select>
          </div>
          @if (!g.single) {
            <ul class="mt-1 space-y-0.5">
              @for (k of g.cases; track k.key) {
                <li><span [class]="k.passed ? 'text-success' : 'text-danger'">{{ k.passed ? '✓' : '✗' }}</span> {{ k.title }}
                  @if (k.reason) { <span class="text-text-muted">– {{ k.reason }}</span> }</li>
              }
            </ul>
          } @else if (g.cases[0].reason) {
            <p class="text-text-muted mt-0.5">{{ g.cases[0].reason }}</p>
          }
        </li>
      }
    </ul>
    <label class="block text-xs font-semibold mt-2" [for]="'machine-note-' + rid">Megjegyzés a felülbíráláshoz (a diák nem látja)</label>
    <textarea #noteBox class="form-input !text-xs w-full mt-1" rows="2" maxlength="500" [id]="'machine-note-' + rid" [value]="note()"
              [attr.data-testid]="'machine-note-' + rid" (input)="setNote(noteBox.value)"
              placeholder="Pl.: a lista a böngészőben helyesen frissül, a mérő nem várta meg."></textarea>
    <div class="flex flex-wrap items-center gap-2 mt-2">
      <button type="button" class="btn btn-primary !px-2 !py-1 !text-xs" [disabled]="busy() || !dirty()"
              [attr.data-testid]="'machine-save-' + rid" (click)="save()">Mentés</button>
      @if (result().detail.machineReview; as mr) {
        <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" [disabled]="busy()"
                [attr.data-testid]="'machine-revert-' + rid" (click)="revert()">Visszavonás</button>
        <span class="text-text-muted">kézzel felülbírálva: {{ utc(mr.reviewedAt) | date: 'yyyy.MM.dd. HH:mm' }}</span>
      }
    </div>
    @if (error(); as err) { <p class="text-danger text-xs mt-1" role="alert" data-testid="machine-error">{{ err }}</p> }
  `,
  styles: [`
    .group-row { padding: 0.375rem 0.5rem; border-radius: 0.5rem; border: 1px solid var(--color-border-default); }
    .group-row--overridden { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  `],
})
export class GepiFelulbiralasComponent {
  private readonly api = inject(TeacherTechnikumService);
  private readonly toast = inject(ToastService);

  /** Értékelt, lefutott gépi bírálatú, build-módú kliens-rész. */
  readonly result = input.required<ExamPartResultDto>();
  /** A felülbírálás (vagy visszavonás) utáni friss beadott dolgozat. */
  readonly saved = output<ExamSessionSnapshotDto>();

  readonly utc = parseUtc;
  readonly groups = computed(() => caseGroups(this.result().detail.machine?.cases ?? []));
  /** A mentetlen kézi ítéletek (csoportkulcs → ítélet) és megjegyzés; új eredménynél (mentés után) eldobva. */
  private readonly drafts = signal<Record<string, Verdict>>({});
  readonly note = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly dirty = computed(() =>
    this.groups().some((g) => this.verdictOf(g) !== g.saved) || this.note().trim() !== this.savedNote());

  constructor() {
    effect(() => {
      this.result();
      untracked(() => {
        this.drafts.set({});
        this.note.set(this.savedNote());
        this.error.set(null);
      });
    });
  }

  private savedNote(): string {
    return this.result().detail.machineReview?.note ?? '';
  }

  verdictOf(g: CaseGroup): Verdict {
    return this.drafts()[g.key] ?? g.saved;
  }

  /** A legördülő értéke (a három opció egyike). */
  setVerdict(key: string, verdict: string): void {
    if (!isVerdict(verdict)) return;
    this.drafts.update((d) => ({ ...d, [key]: verdict }));
    this.error.set(null);
  }

  setNote(value: string): void {
    this.note.set(value);
    this.error.set(null);
  }

  /** A teljes felülbírálás mentése; ha minden csoport a gépi ítéleten maradt, az a visszavonás. */
  save(): void {
    const groups = this.groups()
      .map((g) => ({ groupKey: g.key, verdict: this.verdictOf(g) }))
      .filter((g) => g.verdict !== 'gepi')
      .map((g) => ({ groupKey: g.groupKey, passed: g.verdict === 'atment' }));
    if (!groups.length) {
      if (this.result().detail.machineReview) this.revert();
      else this.error.set('Válassz legalább egy csoportnál kézi ítéletet.');
      return;
    }
    this.run(this.api.scoreMachine(this.result().id, groups, this.note().trim() || null), 'A gépi esetek kézi ítélete mentve.');
  }

  revert(): void {
    this.run(this.api.revertMachine(this.result().id), 'Visszaállítva a gépi ítéletekre.');
  }

  private run(request: Observable<ExamSessionSnapshotDto>, message: string): void {
    this.busy.set(true);
    this.error.set(null);
    request.pipe(take(1), finalize(() => this.busy.set(false))).subscribe({
      next: (sn) => {
        this.toast.success(message);
        this.saved.emit(sn);
      },
      error: (e) => this.error.set(extractErrorMessage(e, 'A gépi felülbírálás mentése sikertelen.')),
    });
  }
}
