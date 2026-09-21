import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminAiSpendingService } from '../../services/admin/admin-ai-spending.service';
import {
  AI_SOURCES,
  AiRequestLogDto,
  AiSpendingDayDto,
  AiSpendingOverviewDto,
  AiSpendingTopSpenderDto,
  AutomationStatusDto,
  MAINTENANCE_ACTION_BADGES,
  MAINTENANCE_ACTION_LABELS,
  OpenRouterCreditsDto,
  QuizMaintenanceDecisionDto,
  QuizMaintenanceRunDto,
  sourceColor,
  sourceLabel,
} from '../../models/ai-spending.model';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';

type Tab = 'attekintes' | 'naplo' | 'karbantartas' | 'eredmenyek' | 'automatizmus';

function extractErrorMessage(err: any, fallback: string): string {
  const body = err?.error;
  if (typeof body?.errorMessage === 'string' && body.errorMessage.trim()) {
    return body.errorMessage;
  }
  return fallback;
}

interface ChartBar {
  date: string;
  dayLabel: string;
  x: number;
  segments: { source: string; label: string; color: string; y: number; height: number; valueUsd: number }[];
  totalUsd: number;
}

const CHART_WIDTH = 860;
const CHART_HEIGHT = 220;
const CHART_PAD_LEFT = 40;
const CHART_PAD_RIGHT = 8;
const CHART_PAD_TOP = 10;
const CHART_PAD_BOTTOM = 24;

/**
 * AI-KOLTES-PULT: platform-admin "AI-költés Pult" - kérésenkénti OpenRouter-
 * költés (AiRequestLog) áttekintése, kvíz-kérdés karbantartás kézi indítása/
 * eredmény-kezelése (a korábbi 2-naponkénti automatikus Hangfire-ütemezés
 * 2026-09-21-én megszűnt - innentől KIZÁRÓLAG erről a felületről indítható),
 * és egyéb token-fogyasztó automatizmusok (tanulási terv, napi kihívás)
 * kézi újraindítása.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-ai-koltes',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, LocalSpinnerComponent],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-10">
      <p class="text-xs font-bold text-text-muted uppercase tracking-wide mb-1">Platform-admin</p>
      <h1 class="page-title">AI-költés és automatizmusok</h1>
      <p class="text-sm text-text-muted mt-1 max-w-xl">
        Minden AI-hívás (OpenRouter) kérésenkénti költsége, a saját és az automata felhasználás,
        valamint a token-fogyasztó háttérfolyamatok kézi indítása egy helyen.
      </p>
      <div class="hairline"></div>

      <nav class="flex gap-5 border-b border-border-default mb-6 overflow-x-auto" role="tablist">
        @for (tab of tabs; track tab.id) {
          <button type="button" role="tab" [attr.aria-selected]="activeTab() === tab.id"
            class="tab-btn whitespace-nowrap" [class.tab-btn-active]="activeTab() === tab.id"
            (click)="setTab(tab.id)">
            {{ tab.label }}
          </button>
        }
      </nav>

      <!-- ══════════════════ ÁTTEKINTÉS ══════════════════ -->
      @if (activeTab() === 'attekintes') {
        @if (overviewError()) {
          <p class="text-danger text-sm mb-4">{{ overviewError() }}</p>
        }
        @if (overviewLoading()) {
          <app-local-spinner />
        } @else if (overview(); as ov) {
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div class="card p-4">
              <p class="text-xs text-text-muted font-semibold">Ma összesen</p>
              <p class="text-2xl font-extrabold mt-1">{{ fmtUsd(ov.todayTotalUsd) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-text-muted font-semibold">Ez a hónap</p>
              <p class="text-2xl font-extrabold mt-1">{{ fmtUsd(ov.monthTotalUsd) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-text-muted font-semibold">Saját (admin) költésem</p>
              <p class="text-2xl font-extrabold mt-1">{{ fmtUsd(ov.myOwnMonthUsd) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-text-muted font-semibold">Automatizmusok (e hónap)</p>
              <p class="text-2xl font-extrabold mt-1">{{ fmtUsd(ov.automationMonthUsd) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-text-muted font-semibold">OpenRouter egyenleg</p>
              @if (creditsError()) {
                <p class="text-xs text-danger mt-1">Nem sikerült lekérni.</p>
              } @else if (credits(); as c) {
                <p class="text-2xl font-extrabold mt-1">{{ fmtUsd(c.remainingCredits) }}</p>
                <p class="text-xs text-text-muted mt-0.5">/ {{ fmtUsd(c.totalCredits) }} feltöltve</p>
              } @else {
                <p class="text-2xl font-extrabold mt-1 text-text-muted">...</p>
              }
            </div>
          </div>

          <div class="card p-5 mb-6">
            <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h2 class="font-bold">Napi költés, forrás szerint</h2>
                <p class="text-xs text-text-muted mt-0.5">OpenRouter-hívások becsült USD-értéke</p>
              </div>
              <div class="inline-flex border border-border-default rounded-full p-0.5 gap-0.5">
                <button type="button" class="px-2.5 py-1 rounded-full text-xs font-bold"
                  [class.bg-primary]="chartRangeDays() === 30" [class.text-white]="chartRangeDays() === 30"
                  [class.text-text-muted]="chartRangeDays() !== 30" (click)="chartRangeDays.set(30)">30 nap</button>
                <button type="button" class="px-2.5 py-1 rounded-full text-xs font-bold"
                  [class.bg-primary]="chartRangeDays() === 7" [class.text-white]="chartRangeDays() === 7"
                  [class.text-text-muted]="chartRangeDays() !== 7" (click)="chartRangeDays.set(7)">7 nap</button>
              </div>
            </div>

            <svg [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight" class="w-full h-auto block" role="img"
              aria-label="Napi AI-költés forrás szerinti bontásban, sávdiagram">
              @for (tick of chartYTicks(); track tick.y) {
                <line [attr.x1]="chartPadLeft" [attr.x2]="chartWidth - chartPadRight" [attr.y1]="tick.y" [attr.y2]="tick.y"
                  stroke="var(--color-border-default)" stroke-width="1" />
                <text [attr.x]="chartPadLeft - 8" [attr.y]="tick.y + 3" text-anchor="end" font-size="10" fill="var(--color-text-muted)">
                  {{ tick.label }}
                </text>
              }
              @for (bar of chartBars(); track bar.date) {
                @for (seg of bar.segments; track seg.source) {
                  <rect [attr.x]="bar.x" [attr.y]="seg.y" [attr.width]="chartBarWidth()" [attr.height]="seg.height"
                    [attr.fill]="seg.color" rx="2">
                    <title>{{ bar.dayLabel }} · {{ seg.label }}: {{ fmtUsd(seg.valueUsd) }}</title>
                  </rect>
                }
                @if (bar.totalUsd > 0) {
                  <rect [attr.x]="bar.x" [attr.y]="chartPadTop" [attr.width]="chartBarWidth()" [attr.height]="chartHeight - chartPadTop - chartPadBottom"
                    fill="transparent">
                    <title>{{ bar.dayLabel }} · összesen: {{ fmtUsd(bar.totalUsd) }}</title>
                  </rect>
                }
              }
            </svg>

            <div class="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-border-default">
              @for (s of sourceLegend(); track s.source) {
                <span class="inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <span class="w-2 h-2 rounded-sm inline-block" [style.background]="s.color"></span>
                  {{ s.label }} <strong class="text-text-primary">{{ fmtUsd(s.totalUsd) }}</strong>
                </span>
              }
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="card p-4">
              <h2 class="font-bold mb-3">Havi megoszlás forrás szerint</h2>
              @for (s of ov.monthTotalsBySource; track s.source) {
                <div class="mb-2.5">
                  <div class="flex justify-between text-xs mb-1">
                    <span>{{ sourceLabel(s.source) }}</span>
                    <strong>{{ fmtUsd(s.totalUsd) }}</strong>
                  </div>
                  <div class="h-2 rounded-full bg-bg-element overflow-hidden">
                    <div class="h-full rounded-full" [style.background]="sourceColor(s.source)"
                      [style.width.%]="monthBarPercent(s.totalUsd, ov.monthTotalsBySource)"></div>
                  </div>
                </div>
              } @empty {
                <p class="text-xs text-text-muted">Nincs adat ebben a hónapban.</p>
              }
            </div>

            <div class="card p-4">
              <h2 class="font-bold mb-1">Legtöbbet költő felhasználók</h2>
              <p class="text-xs text-text-muted mb-3">utolsó 30 nap</p>
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-text-muted uppercase">
                    <th class="text-left font-bold pb-2">Felhasználó</th>
                    <th class="text-right font-bold pb-2">Kérés</th>
                    <th class="text-right font-bold pb-2">Költés</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of topSpenders(); track u.userId) {
                    <tr class="border-t border-border-default">
                      <td class="py-1.5 truncate max-w-[10rem]">{{ u.userName }}</td>
                      <td class="py-1.5 text-right tabular-nums">{{ u.requestCount }}</td>
                      <td class="py-1.5 text-right tabular-nums font-semibold">{{ fmtUsd(u.totalUsd) }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="3" class="py-3 text-center text-text-muted text-xs">Nincs adat.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }

      <!-- ══════════════════ KÉRÉSNAPLÓ ══════════════════ -->
      @if (activeTab() === 'naplo') {
        <h2 class="font-bold text-lg mb-1">Kérésnapló</h2>
        <p class="text-xs text-text-muted mb-4">Minden egyes AI-hívás - ki, mikor, milyen forrásból, mennyiért.</p>

        <div class="flex gap-2 mb-4 flex-wrap items-center">
          <input class="input !w-auto min-w-[12rem]" type="text" placeholder="Felhasználó (email/név)..."
            [(ngModel)]="logFilter.userQuery" (ngModelChange)="onFilterChange()" />
          <select class="input !w-auto" [(ngModel)]="logFilter.source" (ngModelChange)="onFilterChange()">
            <option [ngValue]="undefined">Minden forrás</option>
            @for (s of sourceOptions; track s.key) {
              <option [ngValue]="s.key">{{ s.label }}</option>
            }
          </select>
          <input class="input !w-auto" type="date" [(ngModel)]="logFilter.fromDate" (ngModelChange)="onFilterChange()" />
          <span class="text-text-muted text-xs">–</span>
          <input class="input !w-auto" type="date" [(ngModel)]="logFilter.toDate" (ngModelChange)="onFilterChange()" />
          <button type="button" class="btn btn-ghost !px-3 !py-1.5 !text-xs" (click)="clearLogFilter()">Szűrés törlése</button>
        </div>

        @if (logError()) {
          <p class="text-danger text-sm mb-4">{{ logError() }}</p>
        }
        @if (logLoading()) {
          <app-local-spinner />
        } @else {
          <div class="card overflow-x-auto">
            <table class="w-full text-sm min-w-[46rem]">
              <thead>
                <tr class="text-xs text-text-muted uppercase border-b border-border-default">
                  <th class="text-left font-bold px-3 py-2">Időpont</th>
                  <th class="text-left font-bold px-3 py-2">Felhasználó</th>
                  <th class="text-left font-bold px-3 py-2">Forrás</th>
                  <th class="text-left font-bold px-3 py-2">Modell</th>
                  <th class="text-right font-bold px-3 py-2">Prompt tok.</th>
                  <th class="text-right font-bold px-3 py-2">Válasz tok.</th>
                  <th class="text-right font-bold px-3 py-2">Költés</th>
                </tr>
              </thead>
              <tbody>
                @for (row of logItems(); track row.id) {
                  <tr class="border-b border-border-default last:border-0">
                    <td class="px-3 py-2 text-text-muted tabular-nums whitespace-nowrap">{{ row.createdAt | date: 'MM.dd. HH:mm' }}</td>
                    <td class="px-3 py-2 truncate max-w-[9rem]">{{ row.userName }}</td>
                    <td class="px-3 py-2">
                      <span class="w-2 h-2 rounded-sm inline-block mr-1.5" [style.background]="sourceColor(row.source)"></span>
                      {{ sourceLabel(row.source) }}
                    </td>
                    <td class="px-3 py-2 font-mono text-xs text-text-muted">{{ row.model }}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{{ row.promptTokens | number: '1.0-0':'hu' }}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{{ row.completionTokens | number: '1.0-0':'hu' }}</td>
                    <td class="px-3 py-2 text-right tabular-nums font-semibold">
                      {{ row.costUsd !== null ? fmtUsd(row.costUsd) : '(becsült)' }}
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="py-6 text-center text-text-muted text-sm">Nincs a szűrésnek megfelelő kérés.</td></tr>
                }
              </tbody>
            </table>
          </div>

          <div class="flex justify-between items-center mt-3 text-xs text-text-muted">
            <span>{{ logRangeLabel() }}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost !px-3 !py-1.5 !text-xs" [disabled]="logPage() <= 1" (click)="changeLogPage(-1)">Előző</button>
              <button type="button" class="btn btn-ghost !px-3 !py-1.5 !text-xs" [disabled]="!logHasNextPage()" (click)="changeLogPage(1)">Következő</button>
            </div>
          </div>
        }
      }

      <!-- ══════════════════ KVÍZ-KARBANTARTÁS ══════════════════ -->
      @if (activeTab() === 'karbantartas') {
        <div class="flex gap-3 p-4 rounded-xl bg-primary-subtle border border-primary/30 mb-6">
          <p class="text-sm">
            <strong class="block mb-0.5">Az automatikus ütemezés eltávolítva.</strong>
            A kvíz-kérdés karbantartás korábban 2 naponta, 03:00-kor magától lefutott - ez mostantól
            kizárólag innen, kézzel indítható.
          </p>
        </div>

        <div class="card p-5 mb-6">
          <h2 class="font-bold mb-3">Új futtatás indítása</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-text-muted block mb-1">Kérdés-tartomány kezdete</label>
              <input class="input" type="number" placeholder="üresen: alapértelmezett minta"
                [(ngModel)]="maintenanceForm.rangeStartId" (ngModelChange)="estimate.set(null)" />
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Kérdés-tartomány vége</label>
              <input class="input" type="number" placeholder="üresen: alapértelmezett minta"
                [(ngModel)]="maintenanceForm.rangeEndId" (ngModelChange)="estimate.set(null)" />
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Modell</label>
              <select class="input" [(ngModel)]="maintenanceForm.model" (ngModelChange)="estimate.set(null)">
                <option value="openai/gpt-4o-mini">openai/gpt-4o-mini (olcsó, alap)</option>
                <option value="openai/gpt-4o">openai/gpt-4o (pontosabb)</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Mód</label>
              <select class="input" [ngModel]="maintenanceForm.dryRun" (ngModelChange)="maintenanceForm.dryRun = $event">
                <option [ngValue]="true">Próbafuttatás (dry-run, nem ír adatot)</option>
                <option [ngValue]="false">Éles futtatás</option>
              </select>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <div class="text-xs text-text-muted">
              @if (estimating()) {
                Becslés...
              } @else if (estimate(); as est) {
                Becsült költség: <strong class="text-text-primary">{{ fmtUsd(est.estimatedCostUsd) }}</strong>
                ({{ est.candidateCount }} kérdés · {{ maintenanceForm.model }})
              } @else {
                <button type="button" class="underline" (click)="loadEstimate()">Költség-becslés lekérése</button>
              }
            </div>
            <button type="button" class="btn btn-primary" [disabled]="running()" (click)="runMaintenance()">
              {{ running() ? 'Indítás...' : 'Futtatás indítása' }}
            </button>
          </div>
        </div>

        <h2 class="font-bold mb-1">Futtatási előzmények</h2>
        <p class="text-xs text-text-muted mb-3">Kézi és korábbi automata futások.</p>

        @if (runsLoading()) {
          <app-local-spinner />
        } @else {
          <div class="card divide-y divide-border-default">
            @for (run of runs(); track run.id) {
              <div class="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap font-bold text-sm">
                    #{{ run.id.slice(0, 8) }}
                    <span class="badge" [class]="run.triggeredByUserId ? 'badge-primary' : 'badge-neutral'">
                      {{ run.triggeredByUserId ? 'kézi' : 'automata (archív)' }}
                    </span>
                    @if (run.dryRun) {
                      <span class="badge badge-warning">próbafuttatás</span>
                    }
                  </div>
                  <p class="text-xs text-text-muted mt-1 tabular-nums">
                    {{ run.startedAt | date: 'yyyy.MM.dd. HH:mm' }}
                    @if (run.triggeredByName) { · {{ run.triggeredByName }} }
                    · tartomány: {{ run.rangeStartId ? run.rangeStartId + '–' + run.rangeEndId : 'alapértelmezett' }}
                    · {{ run.candidatesReviewed }} kérdés vizsgálva
                    @if (run.estimatedCostUsd !== null) { · {{ fmtUsd(run.estimatedCostUsd) }} }
                  </p>
                </div>
                <button type="button" class="btn btn-ghost !border !border-border-default !px-3 !py-1.5 !text-xs shrink-0"
                  (click)="openRunDecisions(run.id)">
                  Eredmények
                </button>
              </div>
            } @empty {
              <p class="p-6 text-center text-text-muted text-sm">Még nem volt karbantartó-futás.</p>
            }
          </div>
        }
      }

      <!-- ══════════════════ EREDMÉNYEK KEZELÉSE ══════════════════ -->
      @if (activeTab() === 'eredmenyek') {
        <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 class="font-bold text-lg">Karbantartási eredmények</h2>
            @if (selectedRunId()) {
              <p class="text-xs text-text-muted mt-0.5">Futás: #{{ selectedRunId()!.slice(0, 8) }}</p>
            } @else {
              <p class="text-xs text-text-muted mt-0.5">Válassz egy futást a Kvíz-karbantartás fülön ("Eredmények" gomb).</p>
            }
          </div>
        </div>

        @if (selectedRunId()) {
          <div class="flex gap-2 mb-4 flex-wrap text-xs">
            <button type="button" class="btn btn-ghost !px-3 !py-1.5" [class.!bg-bg-element]="!decisionActionFilter()"
              (click)="setDecisionFilter(null)">Mind ({{ decisions().length }})</button>
            @for (a of maintenanceActions; track a) {
              <button type="button" class="btn btn-ghost !px-3 !py-1.5" [class.!bg-bg-element]="decisionActionFilter() === a"
                (click)="setDecisionFilter(a)">
                {{ actionLabel(a) }} ({{ countByAction(a) }})
              </button>
            }
          </div>

          <div class="flex items-center gap-3 mb-3">
            <span class="text-xs text-text-muted">
              {{ selectedForMerge().size === 2 ? '2 kérdés kijelölve - összevonhatók.' : 'Jelölj ki 2 kérdést az összevonáshoz (' + selectedForMerge().size + '/2).' }}
            </span>
            <button type="button" class="btn btn-primary !px-3 !py-1.5 !text-xs" [disabled]="selectedForMerge().size !== 2"
              (click)="openMergeModal()">
              Kijelöltek összevonása
            </button>
          </div>

          @if (decisionsLoading()) {
            <app-local-spinner />
          } @else {
            <div class="card divide-y divide-border-default">
              @for (d of filteredDecisions(); track d.questionId) {
                <div class="p-4">
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <input type="checkbox" [checked]="selectedForMerge().has(d.questionId)"
                      (change)="toggleMergeSelection(d.questionId)" />
                    <span class="badge" [class]="actionBadgeClass(d.action)">{{ actionLabel(d.action) }}</span>
                    @if (d.isTeacherOwned) {
                      <span class="badge badge-neutral">{{ d.teacherName }} tanár kérdése</span>
                    } @else {
                      <span class="badge badge-neutral">közös bank</span>
                    }
                  </div>
                  <p class="text-sm">{{ d.newQuestionText || d.oldQuestionText }}</p>
                  @if (d.reasoning) {
                    <p class="text-xs text-text-muted italic mt-1">{{ d.reasoning }}</p>
                  }
                  <div class="mt-2">
                    <button type="button" class="btn btn-danger !px-3 !py-1 !text-xs" (click)="deactivateQuestion(d)">Törlés</button>
                  </div>
                </div>
              } @empty {
                <p class="p-6 text-center text-text-muted text-sm">Nincs ebbe a szűrésbe eső döntés.</p>
              }
            </div>
          }
        }
      }

      <!-- ══════════════════ EGYÉB AUTOMATIZMUSOK ══════════════════ -->
      @if (activeTab() === 'automatizmus') {
        <h2 class="font-bold text-lg mb-1">Token-fogyasztó háttérfolyamatok</h2>
        <p class="text-xs text-text-muted mb-4">
          A projektben jelenleg ez a 2 ütemezett feladat + 1 tanár-indított funkció éget AI-tokent
          az automata kvíz-karbantartáson kívül.
        </p>

        @if (automationLoading()) {
          <app-local-spinner />
        } @else {
          @for (a of automationStatus(); track a.key) {
            <div class="card p-4 mb-3 flex gap-4 items-start">
              <div class="icon-tile icon-tile-warning">
                <span class="text-lg" aria-hidden="true">⏱</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex justify-between gap-3 flex-wrap items-baseline">
                  <h3 class="font-bold text-sm">{{ automationTitle(a.key) }}</h3>
                  <span class="badge badge-neutral">{{ a.scheduleDescription }}</span>
                </div>
                <p class="text-xs text-text-muted mt-1 mb-3">
                  @if (a.lastRunAt) {
                    Utoljára lefutott: {{ a.lastRunAt | date: 'yyyy.MM.dd. HH:mm' }}
                    @if (a.lastRunCostUsd !== null) { · {{ fmtUsd(a.lastRunCostUsd) }} }
                  } @else {
                    Még nem futott le AiRequestLog-bejegyzés szerint.
                  }
                </p>
                <button type="button" class="btn btn-ghost !border !border-border-default !px-3 !py-1.5 !text-xs"
                  [disabled]="triggering() === a.key" (click)="triggerAutomation(a.key)">
                  {{ triggering() === a.key ? 'Indítás...' : 'Kézi újraindítás most' }}
                </button>
              </div>
            </div>
          }

          <div class="card p-4 flex gap-4 items-start">
            <div class="icon-tile icon-tile-secondary">
              <span class="text-lg" aria-hidden="true">✎</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex justify-between gap-3 flex-wrap items-baseline">
                <h3 class="font-bold text-sm">Kvíz-kérdés generálás (tanári)</h3>
                <span class="badge badge-neutral">nem ütemezett - tanár indítja</span>
              </div>
              <p class="text-xs text-text-muted mt-1">
                Nem háttérfolyamat, tanári kérésre fut - a költése a Kérésnaplóban szűrhető
                ("Kvíz-generálás (tanári)"), kézi indítás innen nem értelmezhető.
              </p>
            </div>
          </div>
        }

        <p class="text-xs text-text-muted mt-5 text-center">
          Ha a projektbe új, tokent fogyasztó háttérfolyamat kerül, ide kell felvenni - nincs ehhez
          automatikus felismerés.
        </p>
      }
    </div>

    <!-- ── Összevonás modal ── -->
    @if (mergeModalOpen()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" (click)="closeMergeModal()">
        <div class="card w-full max-w-lg p-6" (click)="$event.stopPropagation()">
          <h2 class="font-bold text-lg mb-2">Kérdések összevonása</h2>
          <p class="text-xs text-text-muted mb-4">
            A megtartott kérdés marad a rendszerben, a duplikátum inaktiválódik.
          </p>

          @for (q of mergeCandidates(); track q.questionId) {
            <label class="flex gap-2.5 items-start p-3 border border-border-default rounded-lg cursor-pointer mb-2">
              <input type="radio" name="merge-target" class="mt-1"
                [checked]="mergeKeepId() === q.questionId" (change)="mergeKeepId.set(q.questionId)" />
              <span class="text-sm">
                <strong>{{ mergeKeepId() === q.questionId ? 'Megtartva:' : 'Duplikátum:' }}</strong>
                "{{ q.newQuestionText || q.oldQuestionText }}"
                @if (q.isTeacherOwned) {
                  <span class="badge badge-warning ml-1">{{ q.teacherName }} tanár kérdése</span>
                } @else {
                  <span class="badge badge-neutral ml-1">közös bank</span>
                }
              </span>
            </label>
          }

          @if (mergeDuplicateIsTeacherOwned()) {
            <div class="flex gap-3 p-3 rounded-lg bg-warning-subtle border border-warning/30 mt-3">
              <p class="text-xs">
                <strong class="block mb-0.5">Az egyik kérdés tanári tulajdon.</strong>
                A duplikátum nem törlődik, hanem inaktiválódik, és a tulajdonos tanár értesítést kap.
              </p>
            </div>
          }

          <div class="flex justify-end gap-2 mt-5">
            <button type="button" class="btn btn-ghost" (click)="closeMergeModal()">Mégse</button>
            <button type="button" class="btn btn-primary" [disabled]="!mergeKeepId() || merging()" (click)="confirmMerge()">
              {{ merging() ? 'Összevonás...' : 'Összevonás - tanár értesítése' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminAiKoltesComponent implements OnInit {
  private readonly svc = inject(AdminAiSpendingService);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'attekintes', label: 'Áttekintés' },
    { id: 'naplo', label: 'Kérésnapló' },
    { id: 'karbantartas', label: 'Kvíz-karbantartás' },
    { id: 'eredmenyek', label: 'Eredmények kezelése' },
    { id: 'automatizmus', label: 'Egyéb automatizmusok' },
  ];
  readonly sourceOptions = AI_SOURCES;
  readonly maintenanceActions = ['Fixed', 'Deactivated', 'FlaggedForTeacher', 'ReplacementAdded', 'NoAction'];

  readonly activeTab = signal<Tab>('attekintes');

  readonly chartWidth = CHART_WIDTH;
  readonly chartHeight = CHART_HEIGHT;
  readonly chartPadLeft = CHART_PAD_LEFT;
  readonly chartPadRight = CHART_PAD_RIGHT;
  readonly chartPadTop = CHART_PAD_TOP;
  readonly chartPadBottom = CHART_PAD_BOTTOM;

  // ── Áttekintés ─────────────────────────────────────────────────────
  readonly overview = signal<AiSpendingOverviewDto | null>(null);
  readonly topSpenders = signal<AiSpendingTopSpenderDto[]>([]);
  // Külön a többi áttekintés-adattól: élő, közvetlen OpenRouter API-hívás,
  // a saját hibaállapota nem akadályozhatja a többi (DB-ből jövő) csempe
  // megjelenítését, ha az OpenRouter épp nem elérhető.
  readonly credits = signal<OpenRouterCreditsDto | null>(null);
  readonly creditsError = signal(false);
  readonly overviewLoading = signal(false);
  readonly overviewError = signal<string | null>(null);
  readonly chartRangeDays = signal<7 | 30>(30);

  readonly visibleDays = computed<AiSpendingDayDto[]>(() => {
    const days = this.overview()?.dailyBySource ?? [];
    return days.slice(Math.max(0, days.length - this.chartRangeDays()));
  });

  readonly chartMaxTotal = computed(() => {
    const totals = this.visibleDays().map((d) => Object.values(d.bySource).reduce((s, v) => s + v, 0));
    return Math.max(0.5, ...totals);
  });

  readonly chartBarWidth = computed(() => {
    const n = Math.max(1, this.visibleDays().length);
    const plotW = this.chartWidth - this.chartPadLeft - this.chartPadRight;
    return Math.min(22, plotW / n - 4);
  });

  readonly chartYTicks = computed(() => {
    const plotH = this.chartHeight - this.chartPadTop - this.chartPadBottom;
    const max = this.chartMaxTotal();
    const ticks = 4;
    return Array.from({ length: ticks + 1 }, (_, i) => {
      const val = (max / ticks) * i;
      return { y: this.chartPadTop + plotH - (val / max) * plotH, label: '$' + val.toFixed(val < 1 ? 1 : 0) };
    });
  });

  readonly chartBars = computed<ChartBar[]>(() => {
    const days = this.visibleDays();
    const plotW = this.chartWidth - this.chartPadLeft - this.chartPadRight;
    const plotH = this.chartHeight - this.chartPadTop - this.chartPadBottom;
    const step = plotW / Math.max(1, days.length);
    const barW = this.chartBarWidth();
    const max = this.chartMaxTotal();

    return days.map((day, i) => {
      const x = this.chartPadLeft + i * step + (step - barW) / 2;
      let yCursor = this.chartPadTop + plotH;
      const segments = AI_SOURCES.filter((s) => (day.bySource[s.key] ?? 0) > 0).map((s) => {
        const v = day.bySource[s.key] ?? 0;
        const h = (v / max) * plotH;
        const y = yCursor - h;
        yCursor -= h;
        return { source: s.key, label: s.label, color: s.color, y, height: Math.max(0, h - 1), valueUsd: v };
      });
      const totalUsd = Object.values(day.bySource).reduce((s, v) => s + v, 0);
      const parsed = new Date(day.date);
      return { date: day.date, dayLabel: parsed.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }), x, segments, totalUsd };
    });
  });

  readonly sourceLegend = computed(() => {
    const days = this.visibleDays();
    return AI_SOURCES.map((s) => ({
      source: s.key,
      label: s.label,
      color: s.color,
      totalUsd: days.reduce((sum, d) => sum + (d.bySource[s.key] ?? 0), 0),
    })).filter((s) => s.totalUsd > 0.0001);
  });

  // ── Kérésnapló ─────────────────────────────────────────────────────
  readonly logItems = signal<AiRequestLogDto[]>([]);
  readonly logTotalCount = signal(0);
  readonly logPage = signal(1);
  readonly logLoading = signal(false);
  readonly logError = signal<string | null>(null);
  private readonly logPageSize = 20;
  logFilter: { source?: string; userQuery?: string; fromDate?: string; toDate?: string } = {};

  readonly logHasNextPage = computed(() => this.logPage() * this.logPageSize < this.logTotalCount());
  readonly logRangeLabel = computed(() => {
    const total = this.logTotalCount();
    if (total === 0) return '0 kérés';
    const from = (this.logPage() - 1) * this.logPageSize + 1;
    const to = Math.min(total, this.logPage() * this.logPageSize);
    return `${from}–${to} / ${total} kérés`;
  });

  // ── Kvíz-karbantartás ────────────────────────────────────────────
  maintenanceForm: { rangeStartId: number | null; rangeEndId: number | null; model: string; dryRun: boolean } = {
    rangeStartId: null,
    rangeEndId: null,
    model: 'openai/gpt-4o-mini',
    dryRun: true,
  };
  readonly estimate = signal<{ candidateCount: number; estimatedCostUsd: number } | null>(null);
  readonly estimating = signal(false);
  readonly running = signal(false);
  readonly runs = signal<QuizMaintenanceRunDto[]>([]);
  readonly runsLoading = signal(false);

  // ── Eredmények kezelése ──────────────────────────────────────────
  readonly selectedRunId = signal<string | null>(null);
  readonly decisions = signal<QuizMaintenanceDecisionDto[]>([]);
  readonly decisionsLoading = signal(false);
  readonly decisionActionFilter = signal<string | null>(null);
  readonly selectedForMerge = signal<Set<number>>(new Set());
  readonly mergeModalOpen = signal(false);
  readonly mergeKeepId = signal<number | null>(null);
  readonly merging = signal(false);

  readonly filteredDecisions = computed(() => {
    const filter = this.decisionActionFilter();
    const all = this.decisions();
    return filter ? all.filter((d) => d.action === filter) : all;
  });

  readonly mergeCandidates = computed(() => {
    const ids = this.selectedForMerge();
    return this.decisions().filter((d) => ids.has(d.questionId));
  });

  readonly mergeDuplicateIsTeacherOwned = computed(() => {
    const keepId = this.mergeKeepId();
    return this.mergeCandidates().some((q) => q.questionId !== keepId && q.isTeacherOwned);
  });

  // ── Egyéb automatizmusok ─────────────────────────────────────────
  readonly automationStatus = signal<AutomationStatusDto[]>([]);
  readonly automationLoading = signal(false);
  readonly triggering = signal<string | null>(null);

  sourceLabel = sourceLabel;
  sourceColor = sourceColor;

  ngOnInit(): void {
    this.loadOverview();
  }

  private logLoadedOnce = false;
  private runsLoadedOnce = false;
  private automationLoadedOnce = false;

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    // Egy `loaded`-jelző, NEM a lista `.length === 0`-ja dönti el az első
    // betöltést - egy legitim ÜRES eredményhalmaz (pl. nincs egyetlen AI-
    // hívás sem a szűrésnek megfelelően) különben minden fülváltáskor
    // újra lekérdezné az adatot.
    if (tab === 'naplo' && !this.logLoadedOnce) {
      this.logLoadedOnce = true;
      this.loadLog();
    }
    if (tab === 'karbantartas' && !this.runsLoadedOnce) {
      this.runsLoadedOnce = true;
      this.loadRuns();
    }
    if (tab === 'automatizmus' && !this.automationLoadedOnce) {
      this.automationLoadedOnce = true;
      this.loadAutomationStatus();
    }
  }

  fmtUsd(v: number): string {
    return '$' + v.toFixed(v < 1 ? 3 : 2);
  }

  monthBarPercent(value: number, all: { totalUsd: number }[]): number {
    const max = Math.max(0.0001, ...all.map((a) => a.totalUsd));
    return (value / max) * 100;
  }

  // ── Áttekintés ─────────────────────────────────────────────────────
  private loadOverview(): void {
    this.overviewLoading.set(true);
    this.overviewError.set(null);
    this.svc.getOverview(30).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.overviewLoading.set(false);
      },
      error: (err) => {
        this.overviewError.set(extractErrorMessage(err, 'Az áttekintés betöltése sikertelen.'));
        this.overviewLoading.set(false);
      },
    });
    this.svc.getTopSpenders(30, 10).subscribe({ next: (data) => this.topSpenders.set(data), error: () => this.topSpenders.set([]) });
    this.svc.getCredits().subscribe({
      next: (data) => {
        this.credits.set(data);
        this.creditsError.set(false);
      },
      error: () => this.creditsError.set(true),
    });
  }

  // ── Kérésnapló ─────────────────────────────────────────────────────
  onFilterChange(): void {
    this.logPage.set(1);
    this.loadLog();
  }

  clearLogFilter(): void {
    this.logFilter = {};
    this.logPage.set(1);
    this.loadLog();
  }

  changeLogPage(delta: number): void {
    this.logPage.update((p) => Math.max(1, p + delta));
    this.loadLog();
  }

  private loadLog(): void {
    this.logLoading.set(true);
    this.logError.set(null);
    this.svc.getRequestLog(this.logFilter, this.logPage(), this.logPageSize).subscribe({
      next: (page) => {
        this.logItems.set(page.items);
        this.logTotalCount.set(page.totalCount);
        this.logLoading.set(false);
      },
      error: (err) => {
        this.logError.set(extractErrorMessage(err, 'A kérésnapló betöltése sikertelen.'));
        this.logLoading.set(false);
      },
    });
  }

  // ── Kvíz-karbantartás ────────────────────────────────────────────
  loadEstimate(): void {
    this.estimating.set(true);
    this.svc
      .estimateMaintenanceRun({
        rangeStartId: this.maintenanceForm.rangeStartId,
        rangeEndId: this.maintenanceForm.rangeEndId,
        model: this.maintenanceForm.model,
      })
      .subscribe({
        next: (est) => {
          this.estimate.set(est);
          this.estimating.set(false);
        },
        error: (err) => {
          this.estimating.set(false);
          this.toast.danger(extractErrorMessage(err, 'A becslés lekérése sikertelen.'));
        },
      });
  }

  async runMaintenance(): Promise<void> {
    const ok = await this.confirmService.ask({
      message: this.maintenanceForm.dryRun
        ? 'Elindítod a próbafuttatást? Az eredmény csak megjelenik, az adatbázisba semmi nem íródik.'
        : 'Elindítod az ÉLES kvíz-karbantartó futtatást? Ez valódi módosításokat végez a kérdésbankban.',
      danger: !this.maintenanceForm.dryRun,
      confirmLabel: 'Futtatás indítása',
    });
    if (!ok) return;

    this.running.set(true);
    this.svc
      .runMaintenance({
        rangeStartId: this.maintenanceForm.rangeStartId,
        rangeEndId: this.maintenanceForm.rangeEndId,
        model: this.maintenanceForm.model,
        dryRun: this.maintenanceForm.dryRun,
      })
      .subscribe({
        next: (result) => {
          this.running.set(false);
          this.toast.success(`Futtatás kész: ${result.candidatesReviewed} kérdés átnézve.`);
          this.loadRuns();
        },
        error: (err) => {
          this.running.set(false);
          this.toast.danger(extractErrorMessage(err, 'A futtatás indítása sikertelen.'));
        },
      });
  }

  private loadRuns(): void {
    this.runsLoading.set(true);
    this.svc.getMaintenanceRuns(1, 20).subscribe({
      next: (page) => {
        this.runs.set(page.items);
        this.runsLoading.set(false);
      },
      error: () => this.runsLoading.set(false),
    });
  }

  openRunDecisions(runId: string): void {
    this.selectedRunId.set(runId);
    this.decisionActionFilter.set(null);
    this.selectedForMerge.set(new Set());
    this.activeTab.set('eredmenyek');
    this.loadDecisions(runId);
  }

  private loadDecisions(runId: string): void {
    this.decisionsLoading.set(true);
    this.svc.getRunDecisions(runId).subscribe({
      next: (data) => {
        this.decisions.set(data);
        this.decisionsLoading.set(false);
      },
      error: (err) => {
        this.decisionsLoading.set(false);
        this.toast.danger(extractErrorMessage(err, 'Az eredmények betöltése sikertelen.'));
      },
    });
  }

  setDecisionFilter(action: string | null): void {
    this.decisionActionFilter.set(action);
  }

  countByAction(action: string): number {
    return this.decisions().filter((d) => d.action === action).length;
  }

  actionLabel(action: string): string {
    return MAINTENANCE_ACTION_LABELS[action] ?? action;
  }

  actionBadgeClass(action: string): string {
    return MAINTENANCE_ACTION_BADGES[action] ?? 'badge-neutral';
  }

  async deactivateQuestion(d: QuizMaintenanceDecisionDto): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Inaktiválod ezt a kérdést? A közös bankban/kvízben többé nem jelenik meg diákoknak.',
      danger: true,
      confirmLabel: 'Inaktiválás',
    });
    if (!ok) return;

    this.svc.deactivateQuestion(d.questionId).subscribe({
      next: () => {
        this.toast.success('Kérdés inaktiválva.');
        this.decisions.update((list) => list.filter((x) => x.questionId !== d.questionId));
        this.selectedForMerge.update((set) => {
          const next = new Set(set);
          next.delete(d.questionId);
          return next;
        });
      },
      error: (err) => this.toast.danger(extractErrorMessage(err, 'Az inaktiválás sikertelen.')),
    });
  }

  toggleMergeSelection(questionId: number): void {
    this.selectedForMerge.update((set) => {
      const next = new Set(set);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else if (next.size < 2) {
        next.add(questionId);
      }
      return next;
    });
  }

  openMergeModal(): void {
    const [first] = this.selectedForMerge();
    this.mergeKeepId.set(first ?? null);
    this.mergeModalOpen.set(true);
  }

  closeMergeModal(): void {
    this.mergeModalOpen.set(false);
  }

  confirmMerge(): void {
    const keepId = this.mergeKeepId();
    const ids = [...this.selectedForMerge()];
    const duplicateId = ids.find((id) => id !== keepId);
    if (!keepId || !duplicateId) return;

    this.merging.set(true);
    this.svc.mergeQuestions({ keepQuestionId: keepId, duplicateQuestionId: duplicateId }).subscribe({
      next: (result) => {
        this.merging.set(false);
        this.mergeModalOpen.set(false);
        this.toast.success(result.teacherNotified ? 'Összevonva - a tanár értesítést kapott.' : 'Kérdések összevonva.');
        this.decisions.update((list) => list.filter((x) => x.questionId !== duplicateId));
        this.selectedForMerge.set(new Set());
      },
      error: (err) => {
        this.merging.set(false);
        this.toast.danger(extractErrorMessage(err, 'Az összevonás sikertelen.'));
      },
    });
  }

  // ── Egyéb automatizmusok ─────────────────────────────────────────
  private loadAutomationStatus(): void {
    this.automationLoading.set(true);
    this.svc.getAutomationStatus().subscribe({
      next: (data) => {
        this.automationStatus.set(data);
        this.automationLoading.set(false);
      },
      error: () => this.automationLoading.set(false),
    });
  }

  automationTitle(key: string): string {
    return key === 'studyplan' ? 'Tanulási terv újraszámítás' : key === 'dailychallenge' ? 'Napi kihívás előgenerálás' : key;
  }

  async triggerAutomation(key: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Elindítod a(z) "${this.automationTitle(key)}" folyamatot kézzel, most?`,
      confirmLabel: 'Indítás',
    });
    if (!ok) return;

    this.triggering.set(key);
    const call = key === 'studyplan' ? this.svc.triggerStudyPlan() : this.svc.triggerDailyChallenge();
    call.subscribe({
      next: (res) => {
        this.triggering.set(null);
        this.toast.success(res.message);
        this.loadAutomationStatus();
      },
      error: (err) => {
        this.triggering.set(null);
        this.toast.danger(extractErrorMessage(err, 'A folyamat indítása sikertelen.'));
      },
    });
  }
}
