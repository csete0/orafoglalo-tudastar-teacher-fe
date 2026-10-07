import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  GradingQualityDto,
  RubricQuotaDto,
  TeacherRubricDto,
  TeacherRubricItemDto,
  TeacherTaskDto,
} from '../../models/teacher-content.model';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** Részfeladatonkénti tétel-csoport (összecsukható). `key` = subTaskId, vagy 0 a részfeladathoz nem kötött tételeknek. */
interface RubricGroup {
  key: number;
  label: string;
  items: TeacherRubricItemDto[];
  points: number;
  gateFailed: number;
}

/** Ennél több tételnél a csoportok alapból összecsukva jelennek meg, hogy a lista áttekinthető maradjon. */
const COLLAPSE_ABOVE_ITEMS = 8;

/**
 * Tanári szempontlista egy feladathoz: MI-vázlat készítése (havi keretből), a vázlat
 * átnézése részfeladatonként, szerkesztés, jóváhagyás.
 *
 * A gépi szabályt (RuleJson) a tanár NEM szerkesztheti (tulajdonosi döntés, 2026-10-07): a
 * gépi tétel szövegét és pontját átírhatja, de ha a szabály nem jó, csak a tételt törölheti.
 * A kapu (a tanár megoldásán nem teljesülő gépi szabály) eredményét a backend már a
 * generáláskor alkalmazza - az ilyen tétel MI-tételként jön vissza, `gate="failed"`-del.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-szempontlista',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="border-t border-border-default mt-3 pt-3 space-y-3" data-testid="rubric-panel">
      <div class="flex items-center gap-2 flex-wrap">
        <p class="text-sm font-medium">Szempontlista</p>
        @if (rubric(); as r) {
          @if (r.status === 'approved') {
            <span class="badge badge-success" data-testid="rubric-status">Jóváhagyva</span>
          } @else {
            <span class="badge badge-warning" data-testid="rubric-status">Vázlat – még nincs érvényben</span>
          }
        }
      </div>

      @if (loadError()) {
        <p class="text-sm text-danger">{{ loadError() }}</p>
      }

      <!-- ── Vázlat készítése: a költség és a keret a gomb ELŐTT látszik ── -->
      @if (generating()) {
        <div class="flex items-start gap-3 bg-primary-subtle rounded-xl p-3 text-sm" data-testid="rubric-generating" role="status">
          <span class="inline-block w-4 h-4 mt-0.5 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true"></span>
          <span>Az MI most írja a szempontlistát a feladatszövegből és a megoldásodból. Ez 1–2 percig is eltarthat –
            ne zárd be az oldalt.</span>
        </div>
      } @else if (!loading()) {
        <div class="space-y-1">
          @if (!rubric()) {
            <p class="text-sm text-text-muted">
              A szempontlista (javítási útmutató) tételenként rögzíti, mire mennyi pont jár – ettől lesz egyenletes
              és pontos a beadások automatikus javítása. Az MI megírja a vázlatot, te átnézed és jóváhagyod.
            </p>
          }
          <p class="text-sm" data-testid="rubric-cost">{{ costText() }}</p>
          @if (draftBlockedReason(); as reason) {
            <p class="text-sm text-warning" data-testid="rubric-draft-blocked">{{ reason }}</p>
          }
          <button type="button" class="btn btn-primary !px-3 !py-1.5" data-testid="rubric-draft-button"
            [disabled]="!!draftBlockedReason() || busy()" (click)="createDraft()">
            {{ rubric() ? 'Új vázlat' : 'Szempontlista készítése' }}
          </button>
        </div>
      }

      @if (draftError()) {
        <p class="text-sm text-danger" data-testid="rubric-draft-error">{{ draftError() }}</p>
      }

      <!-- ── A lista részfeladatonként ── -->
      @if (rubric(); as r) {
        <p class="text-xs text-text-muted">
          {{ r.items.length }} tétel ({{ machineCount() }} gépi) · {{ r.rawTotal }} pont
          @if (r.rawTotal !== r.examPoints) {
            – a feladat {{ r.examPoints }} pontjára arányosan átszámolva
          }
        </p>

        <div class="space-y-2">
          @for (group of groups(); track group.key) {
            <div class="bg-bg-element rounded-xl" data-testid="rubric-group">
              <button type="button" class="w-full flex items-center justify-between gap-2 p-3 text-left"
                [attr.aria-expanded]="isGroupOpen(group.key)" (click)="toggleGroup(group.key)">
                <span class="min-w-0 flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">{{ group.label }}</span>
                  <span class="text-xs text-text-muted">{{ group.items.length }} tétel · {{ group.points }} pont</span>
                  @if (group.gateFailed > 0) {
                    <span class="badge badge-warning">{{ group.gateFailed }} MI-re állítva</span>
                  }
                </span>
                <app-icon name="chevron-down" class="w-4 h-4 block shrink-0 text-text-muted transition-transform"
                  [class.-rotate-90]="!isGroupOpen(group.key)" />
              </button>

              @if (isGroupOpen(group.key)) {
                <ul class="px-3 pb-3 space-y-2">
                  @for (item of group.items; track item.id) {
                    <li class="bg-bg-panel rounded-lg p-3 space-y-2" data-testid="rubric-item">
                      <div class="flex items-center gap-2 flex-wrap">
                        @if (item.machine) {
                          <span class="badge badge-primary" data-testid="rubric-item-kind"
                            title="Ezt a tételt a rendszer a beadott fájlból gépileg ellenőrzi">gépi</span>
                        } @else {
                          <span class="badge badge-neutral" data-testid="rubric-item-kind"
                            title="Ezt a tételt az MI értékeli">MI</span>
                        }
                        @if (item.gate === 'ok') {
                          <span class="text-xs text-success flex items-center gap-1" data-testid="rubric-item-gate">
                            <app-icon name="check" class="w-3.5 h-3.5 block" /> teljesült a megoldásodon
                          </span>
                        } @else if (item.gate === 'failed') {
                          <span class="text-xs text-warning" data-testid="rubric-item-gate">
                            nem teljesült a megoldásodon – MI-re állítva{{ item.gateReason ? ': ' + item.gateReason : '' }}
                          </span>
                        }
                      </div>

                      @if (r.status === 'draft') {
                        <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
                          <label class="flex-1 min-w-0">
                            <span class="text-xs text-text-muted">Tétel</span>
                            <textarea rows="2" class="input !px-2 !py-1 text-sm"
                              [ngModel]="itemDraft(item).text" (ngModelChange)="setItemText(item.id, $event)"
                              [ngModelOptions]="{ standalone: true }"></textarea>
                          </label>
                          <div class="flex gap-2 items-end">
                            <label class="w-20">
                              <span class="text-xs text-text-muted">Pont</span>
                              <input type="number" min="0" class="input !px-2 !py-1"
                                [ngModel]="itemDraft(item).points" (ngModelChange)="setItemPoints(item.id, $event)"
                                [ngModelOptions]="{ standalone: true }" />
                            </label>
                            @if (isItemDirty(item)) {
                              <button type="button" class="btn btn-primary !px-3 !py-1.5" data-testid="rubric-item-save"
                                [disabled]="busy() || !isItemDraftValid(item.id)" (click)="saveItem(item)">Mentés</button>
                            }
                            <button type="button" class="btn btn-ghost text-danger !px-3 !py-1.5" data-testid="rubric-item-delete"
                              [disabled]="busy()" (click)="deleteItem(item)">Törlés</button>
                          </div>
                        </div>
                        @if (item.machine) {
                          <p class="text-xs text-text-muted">A gépi ellenőrzés szabálya nem szerkeszthető – ha nem jó, töröld a tételt.</p>
                        }
                      } @else {
                        <p class="text-sm break-words">{{ item.text }} <span class="text-text-muted">({{ item.points }} pont)</span></p>
                      }
                    </li>
                  }
                </ul>
              }
            </div>
          } @empty {
            <p class="text-sm text-text-muted">A lista üres.</p>
          }
        </div>

        @if (r.status === 'draft') {
          @if (r.problems.length > 0) {
            <ul class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger space-y-1" data-testid="rubric-problems">
              @for (problem of r.problems; track problem) {
                <li>{{ problem }}</li>
              }
            </ul>
          }
          <div class="space-y-1">
            <button type="button" class="btn btn-primary" data-testid="rubric-approve"
              [disabled]="!!approveBlockedReason() || busy()" (click)="approve()">Jóváhagyás</button>
            @if (approveBlockedReason(); as reason) {
              <p class="text-xs text-text-muted" data-testid="rubric-approve-blocked">{{ reason }}</p>
            } @else {
              <p class="text-xs text-text-muted">Jóváhagyás után a diákok beadásait ezzel a listával javítja a rendszer.</p>
            }
          </div>
        } @else {
          <p class="text-xs text-text-muted">A diákok beadásait ezzel a listával javítja a rendszer.</p>
        }
      }
    </div>
  `,
})
export class SzempontlistaComponent {
  private readonly rubricService = inject(TeacherRubricService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);

  readonly taskSetId = input.required<number>();
  readonly task = input.required<TeacherTaskDto>();
  /** A szülő blokk legutóbbi állapota - irodai feladatnál ebből tudjuk, van-e megoldásfájl. */
  readonly quality = input<GradingQualityDto | null>(null);
  /** A lista változott (vázlat, szerkesztés, jóváhagyás) - a szülő frissíti a javítás-minőséget. */
  readonly changed = output<void>();

  readonly rubric = signal<TeacherRubricDto | null>(null);
  readonly quota = signal<RubricQuotaDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly generating = signal(false);
  readonly draftError = signal<string | null>(null);
  /** Tétel-mentés/törlés/jóváhagyás folyamatban - dupla-kattintás ellen. */
  readonly busy = signal(false);

  private readonly itemDrafts = signal<Record<number, { text: string; points: number }>>({});
  /** A tanár által kézzel nyitott/zárt csoportok; a többi az alapértelmezést követi. */
  private readonly groupToggles = signal<Record<number, boolean>>({});

  private readonly taskId = computed(() => this.task().id);

  readonly machineCount = computed(() => this.rubric()?.items.filter((i) => i.machine).length ?? 0);

  readonly groups = computed<RubricGroup[]>(() => {
    const rubric = this.rubric();
    if (!rubric) return [];
    const subTasks = this.task().subTasks;
    const byKey = new Map<number, TeacherRubricItemDto[]>();
    for (const item of [...rubric.items].sort((a, b) => a.order - b.order)) {
      const key = item.subTaskId ?? 0;
      byKey.set(key, [...(byKey.get(key) ?? []), item]);
    }
    // A részfeladatok sorrendjében, a részfeladathoz nem köthető tételek a végén.
    const order = (key: number) => {
      const index = subTasks.findIndex((s) => s.id === key);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...byKey.entries()]
      .sort(([a], [b]) => order(a) - order(b))
      .map(([key, items]) => ({
        key,
        label: this.groupLabel(key, items),
        items,
        points: items.reduce((sum, i) => sum + i.points, 0),
        gateFailed: items.filter((i) => i.gate === 'failed').length,
      }));
  });

  readonly costText = computed(() => {
    const quota = this.quota();
    if (!quota) return 'Költség: 1 egység a havi szempontlista-keretedből.';
    const left = Math.max(0, quota.limit - quota.used);
    return `Költség: 1 egység a havi keretedből – ebben a hónapban ${quota.limit} egységből még ${left} maradt.`;
  });

  readonly draftBlockedReason = computed<string | null>(() => {
    const quota = this.quota();
    if (quota && quota.used >= quota.limit) {
      return 'Elfogyott a havi keret – a következő hónap elején újra készíthetsz szempontlistát.';
    }
    const solutionCheck = this.quality()?.checks.find((c) => c.key === 'solutionFile');
    if (solutionCheck && !solutionCheck.ok) {
      return 'Előbb töltsd fel a saját megoldásodat a „Fájlok” részen – ebből készül a szempontlista.';
    }
    return null;
  });

  readonly approveBlockedReason = computed<string | null>(() => {
    const rubric = this.rubric();
    if (!rubric) return null;
    if (rubric.problems.length > 0) return 'A jóváhagyáshoz előbb javítsd a fenti problémákat.';
    if (rubric.items.some((i) => this.isItemDirty(i))) return 'Előbb mentsd el a módosított tételeket.';
    return null;
  });

  constructor() {
    // Csak a feladat CSERÉJEKOR töltünk újra - a feladatsor minden mentés utáni újratöltése
    // (új task-objektum) ne dobja el a tanár mentetlen tétel-szerkesztéseit.
    effect(() => {
      const taskSetId = this.taskSetId();
      const taskId = this.taskId();
      untracked(() => this.load(taskSetId, taskId));
    });
  }

  private load(taskSetId: number, taskId: number): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.rubricService.getRubric(taskSetId, taskId).subscribe({
      next: (rubric) => {
        this.setRubric(rubric);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(extractErrorMessage(err, 'A szempontlista nem tölthető be.'));
        this.loading.set(false);
      },
    });
    this.loadQuota();
  }

  private loadQuota(): void {
    // A keret-kijelzés hiánya nem akadályozhatja a munkát - hiba esetén általános szöveg marad.
    this.rubricService.getRubricQuota().subscribe({
      next: (quota) => this.quota.set(quota),
      error: () => this.quota.set(null),
    });
  }

  private setRubric(rubric: TeacherRubricDto | null): void {
    this.rubric.set(rubric);
    this.itemDrafts.set({});
  }

  private groupLabel(key: number, items: TeacherRubricItemDto[]): string {
    const subTask = this.task().subTasks.find((s) => s.id === key);
    if (subTask) return subTask.label?.trim() || subTask.description?.trim() || `Részfeladat #${subTask.id}`;
    return items.find((i) => i.section?.trim())?.section?.trim() || 'Általános';
  }

  isGroupOpen(key: number): boolean {
    return this.groupToggles()[key] ?? (this.rubric()?.items.length ?? 0) <= COLLAPSE_ABOVE_ITEMS;
  }

  toggleGroup(key: number): void {
    const open = this.isGroupOpen(key);
    this.groupToggles.update((current) => ({ ...current, [key]: !open }));
  }

  itemDraft(item: TeacherRubricItemDto): { text: string; points: number } {
    return this.itemDrafts()[item.id] ?? { text: item.text, points: item.points };
  }

  setItemText(itemId: number, text: string): void {
    const item = this.rubric()?.items.find((i) => i.id === itemId);
    if (item) this.itemDrafts.update((d) => ({ ...d, [itemId]: { ...this.itemDraft(item), text } }));
  }

  setItemPoints(itemId: number, points: number): void {
    const item = this.rubric()?.items.find((i) => i.id === itemId);
    if (item) this.itemDrafts.update((d) => ({ ...d, [itemId]: { ...this.itemDraft(item), points: Number(points) } }));
  }

  isItemDirty(item: TeacherRubricItemDto): boolean {
    const draft = this.itemDrafts()[item.id];
    return !!draft && (draft.text !== item.text || draft.points !== item.points);
  }

  isItemDraftValid(itemId: number): boolean {
    const draft = this.itemDrafts()[itemId];
    return !!draft && !!draft.text.trim() && Number.isFinite(draft.points) && draft.points > 0;
  }

  async createDraft(): Promise<void> {
    if (this.generating() || this.busy() || this.draftBlockedReason()) return;
    const current = this.rubric();
    if (current) {
      const ok = await this.confirmService.ask({
        title: 'Új vázlat',
        message:
          (current.status === 'draft'
            ? 'Az új vázlat lecseréli a mostanit, a módosításaiddal együtt.'
            : 'A jóváhagyott lista addig érvényben marad, amíg az új vázlatot jóvá nem hagyod.') +
          '\n\n' +
          this.costText(),
        confirmLabel: 'Új vázlat készítése',
      });
      if (!ok) return;
    }

    this.generating.set(true);
    this.draftError.set(null);
    this.rubricService.createRubricDraft(this.taskSetId(), this.taskId()).subscribe({
      next: (rubric) => {
        this.generating.set(false);
        this.setRubric(rubric);
        this.groupToggles.set({});
        this.loadQuota();
        this.toastService.success('Elkészült a szempontlista-vázlat – nézd át, és hagyd jóvá.');
        this.changed.emit();
      },
      error: (err) => {
        this.generating.set(false);
        this.draftError.set(this.draftErrorMessage(err));
        this.loadQuota();
      },
    });
  }

  private draftErrorMessage(err: any): string {
    switch (err?.error?.errorType) {
      case 'RubricDraftQuotaExceeded':
        return 'Elfogyott a havi szempontlista-keret – a következő hónap elején újra készíthetsz vázlatot.';
      case 'RubricDraftNeedsSolution':
        return 'Előbb töltsd fel a saját megoldásodat a „Fájlok” részen – ebből készül a szempontlista.';
      default:
        return extractErrorMessage(err, 'A szempontlista-vázlat nem készült el. Próbáld újra később.');
    }
  }

  saveItem(item: TeacherRubricItemDto): void {
    const draft = this.itemDrafts()[item.id];
    if (!draft || !this.isItemDraftValid(item.id)) return;
    this.mutate(
      this.rubricService.updateRubricItem(this.taskSetId(), this.taskId(), item.id, { text: draft.text.trim(), points: draft.points }),
      'Tétel mentve.',
    );
  }

  async deleteItem(item: TeacherRubricItemDto): Promise<void> {
    const ok = await this.confirmService.ask({
      message: item.machine
        ? `Biztosan törlöd ezt a gépi tételt? A pontja nem lesz kiosztva, amíg a többi tétel pontját nem igazítod.\n\n„${item.text}”`
        : `Biztosan törlöd ezt a tételt?\n\n„${item.text}”`,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    this.mutate(this.rubricService.deleteRubricItem(this.taskSetId(), this.taskId(), item.id), 'Tétel törölve.');
  }

  approve(): void {
    if (this.approveBlockedReason()) return;
    this.mutate(
      this.rubricService.approveRubric(this.taskSetId(), this.taskId()),
      'Szempontlista jóváhagyva – a diákok beadásait ezzel javítja a rendszer.',
    );
  }

  /** Tétel-mentés/törlés/jóváhagyás: a válasz a teljes friss lista. */
  private mutate(request: Observable<TeacherRubricDto>, successMessage: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    request.subscribe({
      next: (rubric) => {
        this.busy.set(false);
        // A szerver-válasz a teljes lista; a többi tétel mentetlen szerkesztését megtartjuk.
        const drafts = this.itemDrafts();
        this.rubric.set(rubric);
        this.itemDrafts.set(
          Object.fromEntries(
            Object.entries(drafts).filter(([id, d]) => {
              const fresh = rubric.items.find((i) => i.id === Number(id));
              return rubric.status === 'draft' && !!fresh && (d.text !== fresh.text || d.points !== fresh.points);
            }),
          ),
        );
        this.toastService.success(successMessage);
        this.changed.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.toastService.danger(extractErrorMessage(err, 'A művelet sikertelen.'));
      },
    });
  }
}
