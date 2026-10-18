import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { defer, repeat, retry, Subscription, takeWhile, throwError, timer } from 'rxjs';
import {
  ExcelStylePart,
  ExcelUndoOpName,
  OfficeProposalSubtask,
  OfficeRubricItem,
  OfficeSourceMode,
  OfficeTaskFileKind,
  OfficeTaskJobDto,
  OfficeTaskLevel,
  OfficeTaskProposal,
  OfficeTaskReport,
  OfficeTaskResultDto,
  OfficeUndoOp,
} from '../../models/office-task.model';
import { TeacherOfficeTaskService } from '../../services/teacher-office-task/teacher-office-task.service';
import { AiHelperQuotaItemDto, aiHelperBlock, aiHelperErrorMessage } from '../../shared/ai-helper-quota.util';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { saveBlob } from '../../shared/save-blob.util';
import { ToastService } from '../../shared/toast/toast.service';
import {
  canonicalOp,
  changeUndoOpKind,
  describeUndoOp,
  EXCEL_UNDO_OP_NAMES,
  EXCEL_UNDO_OPS,
  newUndoOp,
  opSpec,
  STYLE_PARTS,
  validateUndoOp,
} from './irodai-undo.util';

/** Az állapot-lekérdezés gyakorisága (ms). */
export const OFFICE_POLL_MS = 2000;
/** A BE-vel azonos korlátok (TeacherOfficeTaskService / OfficeTaskPrompt). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NOTES = 2000;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_LABEL = 50;
const MAX_SUBTASK_TEXT = 2000;
const MAX_ITEM_TEXT = 1000;
const MAX_POINTS = 100;
const MAX_UNDO = 20;
const MAX_ITEMS = 15;

const ACTIVE_STATUSES = new Set(['queued', 'generating', 'running']);

export const OFFICE_PREMIUM_MESSAGE =
  'Az irodai feladat a megoldott fájlból csak Prémium tanári előfizetéssel érhető el. Prémium előfizetéssel havonta 20 feladatot készíthetsz.';

type Step = 'input' | 'running' | 'preview';
type Tab = 'feladat' | 'visszacsinalas' | 'szempontok' | 'elonezet' | 'ellenorzes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'feladat', label: 'Feladat' },
  { id: 'visszacsinalas', label: 'Visszacsinálás' },
  { id: 'szempontok', label: 'Szempontok' },
  { id: 'elonezet', label: 'Előnézet' },
  { id: 'ellenorzes', label: 'Ellenőrzés' },
];

const UNDO_RESULT: Record<'ok' | 'noop' | 'error', { label: string; badge: string }> = {
  ok: { label: 'végrehajtva', badge: 'badge-success' },
  noop: { label: 'nem talált mit visszacsinálni', badge: 'badge-warning' },
  error: { label: 'hiba', badge: 'badge-danger' },
};

const GATE: Record<'ok' | 'failed' | 'source' | 'none', { label: string; badge: string }> = {
  ok: { label: 'gépi szabály: rendben', badge: 'badge-success' },
  source: { label: 'a kiinduló fájlon is teljesül → AI-szempont', badge: 'badge-warning' },
  failed: { label: 'a gépi szabály a megoldáson sem teljesül → AI-szempont', badge: 'badge-danger' },
  none: { label: 'AI-szempont', badge: 'badge-neutral' },
};

/** Kulcs-sorrendtől független JSON (a szerver és a kliens objektumai más sorrendben is tarthatják a mezőket). */
function canon(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

/** A ★ (szerver által töltött) mezők nélkül - ezek a szerver hash-ébe sem számítanak bele. */
export function stripServerFields(p: OfficeTaskProposal): OfficeTaskProposal {
  return {
    ...p,
    subtasks: p.subtasks.map((s) => ({
      ...s,
      undo: s.undo.map((o) => ({ ...o, result: null, message: null })),
      rubric: s.rubric.map((r) => ({ ...r, machine: false, gate: null, gateReason: null })),
    })),
  };
}

const sameProposal = (a: OfficeTaskProposal | null, b: OfficeTaskProposal | null) =>
  a === b || (!!a && !!b && canon(stripServerFields(a)) === canon(stripServerFields(b)));

const isXlsx = (file: File) => /\.xlsx$/i.test(file.name);

/**
 * „Irodai feladat a megoldott fájlból (Excel)” párbeszédablak a feladatsor-szerkesztőben
 * (PATRICKS-IRODAI-FELADAT-MEGOLDASBOL-TERV.md, 1. fázis). A tanár a kész munkafüzetet tölti fel; a háttérben az MI megírja a
 * feladatot, a részfeladatonkénti visszacsinálást és a szempontlistát, a szerver előállítja a kiinduló fájlt és lefuttatja a kettős
 * kaput. Szerkesztés után Újraellenőrzés (MI nélkül), csak az utoljára ellenőrzött változat menthető.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-irodai-megoldasbol',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <div class="absolute inset-0 bg-black/40" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="io-title" tabindex="-1" data-testid="io-dialog"
        class="card relative w-full max-w-4xl p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none min-w-0">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-secondary shrink-0"><app-icon name="chart" class="w-5 h-5 block" /></div>
            <div class="min-w-0">
              <h2 id="io-title" class="font-bold text-lg">Irodai feladat a megoldott fájlból (Excel)</h2>
              @if (jobFileName()) {
                <p class="text-sm text-text-muted truncate">{{ jobFileName() }}</p>
              }
            </div>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="io-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        @switch (step()) {
          @case ('running') {
            <div class="space-y-3" data-testid="io-running">
              <div role="status" aria-live="polite">
                <app-local-spinner [label]="progressText() || 'Indítás…'" />
              </div>
              <p class="text-sm text-text-muted text-center">
                Az AI megírja a feladatot és a szempontokat, a rendszer előállítja a kiinduló fájlt, és ellenőrzi a gépi szabályokat.
                Ez néhány percig is tarthat. Ha bezárod az ablakot, a készítés a háttérben folytatódik, és a gombbal később újra megnyithatod.
              </p>
              @if (pollError()) {
                <p class="text-sm text-danger text-center" role="alert" data-testid="io-poll-error">{{ pollError() }}</p>
              }
              <div class="flex justify-center">
                <button type="button" class="btn btn-ghost" (click)="close()">Bezárás</button>
              </div>
            </div>
          }
          @case ('preview') {
            @if (report(); as r) {
              <div class="space-y-4 min-w-0" data-testid="io-preview">
                @if (r.canSave) {
                  <p class="bg-success-subtle border border-success/40 rounded-xl p-3 text-sm text-success flex items-start gap-2" data-testid="io-valid">
                    <app-icon name="check" class="w-5 h-5 block shrink-0" />
                    <span>Elkészült a kiinduló fájl, és lefutott a kettős ellenőrzés: {{ r.machineItems }} gépi és {{ r.aiItems }} AI-szempont.
                      Nézd át a füleket, mentés előtt bármit módosíthatsz.</span>
                  </p>
                } @else {
                  <div class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" data-testid="io-invalid">
                    <p class="font-semibold mb-1">Az ellenőrzés hibát talált - így nem menthető. Javítsd a füleken, majd ellenőrizd újra:</p>
                    <ul class="list-disc pl-5 space-y-0.5 break-words">
                      @for (e of r.errors; track $index) { <li>{{ e }}</li> }
                    </ul>
                  </div>
                }

                @if (notes()) {
                  <p class="text-sm text-text-muted break-words"><span class="font-medium">Az AI megjegyzése:</span> {{ notes() }}</p>
                }

                <div role="tablist" aria-label="Az elkészült feladat részei" class="flex gap-1 overflow-x-auto border-b border-border-default -mx-1 px-1">
                  @for (t of tabs; track t.id; let i = $index) {
                    <button type="button" role="tab" [id]="'io-tab-' + t.id" [attr.aria-selected]="tab() === t.id"
                      [attr.aria-controls]="'io-panel-' + t.id" [attr.tabindex]="tab() === t.id ? 0 : -1"
                      (click)="tab.set(t.id)" (keydown)="onTabKey($event, i)" [attr.data-testid]="'io-tab-' + t.id"
                      class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px"
                      [class.border-primary]="tab() === t.id" [class.text-primary]="tab() === t.id" [class.font-semibold]="tab() === t.id"
                      [class.border-transparent]="tab() !== t.id" [class.text-text-muted]="tab() !== t.id">
                      {{ t.label }}
                      @if (t.id === 'ellenorzes') {
                        @if (r.canSave) { <span class="text-success" aria-hidden="true">✔</span> }
                        @else { <span class="text-danger" aria-hidden="true">✘</span> }
                        @if (r.warnings.length > 0) { <span class="badge badge-warning ml-1">{{ r.warnings.length }}</span> }
                      }
                    </button>
                  }
                </div>

                @if (proposal(); as p) {
                  <div role="tabpanel" [id]="'io-panel-' + tab()" [attr.aria-labelledby]="'io-tab-' + tab()" class="min-w-0">
                    @switch (tab()) {
                      @case ('feladat') {
                        <div class="space-y-3" data-testid="io-panel-feladat">
                          <div>
                            <label for="io-p-title" class="text-sm font-medium block mb-1">Cím</label>
                            <input id="io-p-title" class="input !px-2 !py-1" [maxlength]="maxTitle" [ngModel]="p.title"
                              (ngModelChange)="setField('title', $event)" [ngModelOptions]="{ standalone: true }" data-testid="io-p-title" />
                          </div>
                          <div>
                            <label for="io-p-description" class="text-sm font-medium block mb-1">Leírás</label>
                            <textarea id="io-p-description" rows="8" class="input !px-2 !py-1 !text-sm" [maxlength]="maxDescription" [ngModel]="p.description"
                              (ngModelChange)="setField('description', $event)" [ngModelOptions]="{ standalone: true }" data-testid="io-p-description"></textarea>
                          </div>
                          <div class="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 class="font-semibold text-sm">Részfeladatok</h3>
                            <span class="text-xs text-text-muted">Összesen {{ pointsSum() }} pont</span>
                          </div>
                          @for (s of p.subtasks; track $index; let i = $index) {
                            <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'io-subtask-' + i">
                              <div class="flex flex-wrap items-end gap-2">
                                <div class="w-24">
                                  <label [for]="'io-st-label-' + i" class="text-xs text-text-muted block">Címke</label>
                                  <input [id]="'io-st-label-' + i" class="input !bg-bg-panel !px-2 !py-1" [maxlength]="maxLabel"
                                    [ngModel]="s.label" (ngModelChange)="setSubtask(i, { label: $event })" [ngModelOptions]="{ standalone: true }" />
                                </div>
                                <div class="w-24">
                                  <label [for]="'io-st-points-' + i" class="text-xs text-text-muted block">Pont</label>
                                  <input [id]="'io-st-points-' + i" type="number" min="1" [max]="maxPoints" class="input !bg-bg-panel !px-2 !py-1"
                                    [ngModel]="s.points" (ngModelChange)="setSubtask(i, { points: toInt($event) })" [ngModelOptions]="{ standalone: true }"
                                    [attr.data-testid]="'io-st-points-' + i" />
                                </div>
                              </div>
                              <div>
                                <label [for]="'io-st-text-' + i" class="text-xs text-text-muted block">Szöveg</label>
                                <textarea [id]="'io-st-text-' + i" rows="3" class="input !bg-bg-panel !px-2 !py-1 !text-sm" [maxlength]="maxSubtaskText"
                                  [ngModel]="s.text" (ngModelChange)="setSubtask(i, { text: $event })" [ngModelOptions]="{ standalone: true }"
                                  [attr.data-testid]="'io-st-text-' + i"></textarea>
                              </div>
                            </div>
                          }
                        </div>
                      }
                      @case ('visszacsinalas') {
                        <div class="space-y-3" data-testid="io-panel-visszacsinalas">
                          <fieldset class="bg-bg-element rounded-xl p-3 space-y-2">
                            <legend class="text-sm font-medium px-1">Kiinduló fájl (ezt kapja a diák)</legend>
                            <label class="flex items-start gap-2 text-sm">
                              <input type="radio" name="io-source-mode" class="mt-1" [checked]="p.sourceMode === 'derived'" (change)="setSourceMode('derived')"
                                data-testid="io-source-derived" />
                              <span>A megoldásból visszacsinálva <span class="text-text-muted">(az alábbi műveletekkel)</span></span>
                            </label>
                            <label class="flex items-start gap-2 text-sm">
                              <input type="radio" name="io-source-mode" class="mt-1" [checked]="p.sourceMode === 'own'" (change)="setSourceMode('own')"
                                data-testid="io-source-own" />
                              <span>Saját kiinduló fájl <span class="text-text-muted">(a visszacsinálás kimarad, csak az ellenőrzés fut)</span></span>
                            </label>
                            <div class="flex flex-wrap items-center gap-2 pl-6">
                              <label class="btn btn-ghost !px-2 !py-1 text-sm">
                                Saját kiinduló fájl feltöltése
                                <input type="file" accept=".xlsx" class="sr-only" (change)="loadOwnSource($event)" data-testid="io-own-upload" />
                              </label>
                              @if (pendingOwnSource(); as f) {
                                <span class="text-sm break-all" data-testid="io-own-pending">{{ f.name }} (az Újraellenőrzéssel kerül fel)</span>
                              } @else if (hasOwnSource()) {
                                <span class="text-xs text-text-muted">Már feltöltöttél saját kiinduló fájlt.</span>
                              }
                            </div>
                            @if (ownSourceError()) { <p class="text-sm text-danger pl-6" role="alert" data-testid="io-own-error">{{ ownSourceError() }}</p> }
                          </fieldset>

                          @if (p.sourceMode === 'own') {
                            <p class="text-sm text-text-muted" data-testid="io-undo-skipped">Saját kiinduló fájlnál az alábbi műveletek nem futnak (a listájuk megmarad).</p>
                          }

                          @for (s of p.subtasks; track $index; let si = $index) {
                            <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'io-undo-subtask-' + si">
                              <h3 class="font-semibold text-sm break-words">{{ s.label }} {{ s.text.length > 80 ? s.text.slice(0, 80) + '…' : s.text }}</h3>
                              @for (o of s.undo; track $index; let oi = $index) {
                                <div class="bg-bg-panel rounded-lg p-2 space-y-2" [class.opacity-60]="!o.enabled" [attr.data-testid]="'io-undo-' + si + '-' + oi">
                                  <div class="flex flex-wrap items-start gap-2">
                                    <label class="flex items-start gap-2 text-sm flex-1 min-w-0">
                                      <input type="checkbox" class="mt-1" [checked]="o.enabled" (change)="toggleUndo(si, oi)"
                                        [attr.aria-label]="'Művelet bekapcsolva: ' + describe(o)" [attr.data-testid]="'io-undo-toggle-' + si + '-' + oi" />
                                      <span class="break-words" [attr.data-testid]="'io-undo-text-' + si + '-' + oi">{{ describe(o) }}</span>
                                    </label>
                                    @if (o.result && !dirty()) {
                                      <span class="badge" [class]="undoBadge(o)" [attr.data-testid]="'io-undo-result-' + si + '-' + oi">{{ undoLabel(o) }}</span>
                                    }
                                    <button type="button" class="text-sm text-primary hover:underline" (click)="toggleEdit(si, oi)"
                                      [attr.aria-expanded]="isEditing(si, oi)" [attr.data-testid]="'io-undo-edit-' + si + '-' + oi">Módosítás</button>
                                    <button type="button" class="text-sm text-danger hover:underline" (click)="removeUndo(si, oi)"
                                      [attr.aria-label]="'Művelet törlése: ' + describe(o)" [attr.data-testid]="'io-undo-remove-' + si + '-' + oi">Törlés</button>
                                  </div>
                                  @if (o.message && !dirty()) { <p class="text-xs text-text-muted break-words">{{ o.message }}</p> }
                                  @if (undoError(si, oi); as err) {
                                    <p class="text-xs text-danger" role="alert" [attr.data-testid]="'io-undo-error-' + si + '-' + oi">{{ err }}</p>
                                  }
                                  @if (isEditing(si, oi)) {
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + si + '-' + oi">
                                      <div>
                                        <label [for]="'io-op-' + si + '-' + oi" class="text-xs text-text-muted block">Művelet</label>
                                        <select [id]="'io-op-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="canonical(o.op)"
                                          (ngModelChange)="changeKind(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + si + '-' + oi">
                                          @for (n of opNames; track n) { <option [ngValue]="n">{{ opLabel(n) }}</option> }
                                        </select>
                                      </div>
                                      <div>
                                        <label [for]="'io-sheet-' + si + '-' + oi" class="text-xs text-text-muted block">Munkalap</label>
                                        <input [id]="'io-sheet-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" maxlength="31" [ngModel]="o.sheet ?? ''"
                                          (ngModelChange)="setUndo(si, oi, { sheet: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
                                          placeholder="egylapos munkafüzetnél elhagyható" [attr.data-testid]="'io-sheet-' + si + '-' + oi" />
                                      </div>
                                      @if (has(o, 'range')) {
                                        <div>
                                          <label [for]="'io-range-' + si + '-' + oi" class="text-xs text-text-muted block">Tartomány{{ rangeOptional(o) ? ' (elhagyható = az egész lap)' : '' }}</label>
                                          <input [id]="'io-range-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" [ngModel]="o.range ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { range: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
                                            placeholder="pl. B2:D10" [attr.data-testid]="'io-range-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (has(o, 'columns')) {
                                        <div>
                                          <label [for]="'io-columns-' + si + '-' + oi" class="text-xs text-text-muted block">Oszlopok</label>
                                          <input [id]="'io-columns-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" [ngModel]="o.columns ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { columns: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
                                            placeholder="pl. B:D" [attr.data-testid]="'io-columns-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (has(o, 'name')) {
                                        <div>
                                          <label [for]="'io-name-' + si + '-' + oi" class="text-xs text-text-muted block">{{ canonical(o.op) === 'removeChart' ? 'Diagram neve vagy címe' : 'Név' }}</label>
                                          <input [id]="'io-name-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" maxlength="255" [ngModel]="o.name ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { name: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
                                            [attr.data-testid]="'io-name-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (has(o, 'index')) {
                                        <div>
                                          <label [for]="'io-index-' + si + '-' + oi" class="text-xs text-text-muted block">VAGY: a diagram sorszáma a lapon (1-től)</label>
                                          <input [id]="'io-index-' + si + '-' + oi" type="number" min="1" max="100" class="input !px-2 !py-1 !text-sm"
                                            [ngModel]="o.index == null ? null : o.index + 1" (ngModelChange)="setChartNumber(si, oi, $event)"
                                            [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-index-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (has(o, 'parts')) {
                                        <fieldset class="sm:col-span-2">
                                          <legend class="text-xs text-text-muted">Mit állítson alapra? (semmi bejelölve = mindent)</legend>
                                          <div class="flex flex-wrap gap-x-4 gap-y-1">
                                            @for (part of styleParts; track part.key) {
                                              <label class="flex items-center gap-1.5 text-sm">
                                                <input type="checkbox" [checked]="!!o.parts?.includes(part.key)" (change)="togglePart(si, oi, part.key)"
                                                  [attr.data-testid]="'io-part-' + si + '-' + oi + '-' + part.key" />
                                                {{ part.label }}
                                              </label>
                                            }
                                          </div>
                                        </fieldset>
                                      }
                                    </div>
                                  }
                                </div>
                              } @empty {
                                <p class="text-sm text-text-muted">Ehhez a részfeladathoz nincs visszacsinálási művelet.</p>
                              }
                              @if (s.undo.length < maxUndo) {
                                <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="addUndo(si)" [attr.data-testid]="'io-undo-add-' + si">Művelet hozzáadása</button>
                              }
                            </div>
                          }
                        </div>
                      }
                      @case ('szempontok') {
                        <div class="space-y-3" data-testid="io-panel-szempontok">
                          <p class="text-sm text-text-muted">
                            A gépi szempontot a rendszer a diák fájljából ellenőrzi - csak az marad gépi, ami a megoldáson teljesül, a kiinduló fájlon nem.
                            A többit (és az általad felvett szempontokat) az AI értékeli. Mentéskor a lista jóváhagyottként kerül a feladathoz.
                          </p>
                          @for (s of p.subtasks; track $index; let si = $index) {
                            <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'io-rubric-subtask-' + si">
                              <div class="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 class="font-semibold text-sm">{{ s.label }} részfeladat</h3>
                                <span class="text-xs" [class.text-warning]="rubricSum(s) !== s.points" [class.text-text-muted]="rubricSum(s) === s.points">
                                  Szempontok: {{ rubricSum(s) }} / {{ s.points }} pont
                                </span>
                              </div>
                              @for (it of s.rubric; track $index; let ri = $index) {
                                <div class="bg-bg-panel rounded-lg p-2 space-y-2" [attr.data-testid]="'io-item-' + si + '-' + ri">
                                  <div class="flex flex-wrap items-center gap-2">
                                    @if (!dirty()) {
                                      @if (it.machine) { <span class="badge badge-primary" [attr.data-testid]="'io-item-machine-' + si + '-' + ri">gépi</span> }
                                      <span class="badge" [class]="gateBadge(it)" [attr.data-testid]="'io-item-gate-' + si + '-' + ri">{{ gateLabel(it) }}</span>
                                    } @else if (it.key === null) {
                                      <span class="badge badge-neutral">új - AI-szempont</span>
                                    }
                                    <span class="ml-auto flex items-center gap-2">
                                      <label [for]="'io-item-points-' + si + '-' + ri" class="text-xs text-text-muted">Pont</label>
                                      <input [id]="'io-item-points-' + si + '-' + ri" type="number" min="1" [max]="maxPoints" class="input !px-2 !py-1 !w-20"
                                        [ngModel]="it.points" (ngModelChange)="setRubric(si, ri, { points: toInt($event) })" [ngModelOptions]="{ standalone: true }"
                                        [attr.data-testid]="'io-item-points-' + si + '-' + ri" />
                                      <button type="button" class="text-sm text-danger hover:underline" (click)="removeRubric(si, ri)"
                                        [attr.aria-label]="s.label + ' részfeladat ' + (ri + 1) + '. szempontjának törlése'" [attr.data-testid]="'io-item-remove-' + si + '-' + ri">Törlés</button>
                                    </span>
                                  </div>
                                  @if (it.gateReason && !dirty()) { <p class="text-xs text-text-muted break-words">{{ it.gateReason }}</p> }
                                  <label [for]="'io-item-text-' + si + '-' + ri" class="sr-only">{{ s.label }} részfeladat {{ ri + 1 }}. szempont</label>
                                  <textarea [id]="'io-item-text-' + si + '-' + ri" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxItemText"
                                    [ngModel]="it.text" (ngModelChange)="setRubric(si, ri, { text: $event })" [ngModelOptions]="{ standalone: true }"
                                    [attr.data-testid]="'io-item-text-' + si + '-' + ri"></textarea>
                                </div>
                              }
                              @if (s.rubric.length < maxItems) {
                                <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="addRubric(si)" [attr.data-testid]="'io-item-add-' + si">Szempont hozzáadása (AI értékeli)</button>
                              }
                            </div>
                          }
                        </div>
                      }
                      @case ('elonezet') {
                        <div class="space-y-3" data-testid="io-panel-elonezet">
                          @if (dirty()) {
                            <p class="text-sm text-warning">Ez a módosítások előtti állapot - az Újraellenőrzés után frissül.</p>
                          }
                          @if (r.preview; as pv) {
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div class="min-w-0" data-testid="io-preview-source">
                                <h3 class="font-semibold text-sm mb-1">Kiinduló fájl</h3>
                                @for (img of pv.source; track $index) {
                                  <img [src]="img" [alt]="'Kiinduló fájl, ' + ($index + 1) + '. oldal'" class="w-full h-auto rounded-lg border border-border-default mb-2 bg-white" />
                                } @empty { <p class="text-sm text-text-muted">Nincs oldalkép.</p> }
                              </div>
                              <div class="min-w-0" data-testid="io-preview-solution">
                                <h3 class="font-semibold text-sm mb-1">Megoldás</h3>
                                @for (img of pv.solution; track $index) {
                                  <img [src]="img" [alt]="'Megoldás, ' + ($index + 1) + '. oldal'" class="w-full h-auto rounded-lg border border-border-default mb-2 bg-white" />
                                } @empty { <p class="text-sm text-text-muted">Nincs oldalkép.</p> }
                              </div>
                            </div>
                          } @else {
                            <p class="text-sm text-text-muted" data-testid="io-preview-unavailable">
                              Az oldalképes előnézet most nem érhető el (a fájl-átalakító nem válaszolt). Töltsd le a két fájlt, és nézd meg Excelben.
                            </p>
                          }
                        </div>
                      }
                      @case ('ellenorzes') {
                        <div class="space-y-3" data-testid="io-panel-ellenorzes">
                          @if (dirty()) {
                            <p class="text-sm text-warning">Ez a módosítások előtti ellenőrzés eredménye - futtasd le újra.</p>
                          }
                          <p class="text-sm">{{ r.machineItems }} gépi és {{ r.aiItems }} AI-szempont.
                            Kiinduló fájl: <span class="font-mono break-all">{{ r.sourceFileName }}</span>, megoldás: <span class="font-mono break-all">{{ r.solutionFileName }}</span>.</p>
                          @if (!r.recalculated) {
                            <p class="text-sm text-warning" data-testid="io-not-recalculated">A kiinduló fájl képletértékeit most nem sikerült újraszámolni - a kapu a megoldás
                              tárolt értékeivel futott (emiatt több szempont lehet AI-szempont).</p>
                          }
                          @if (r.warnings.length > 0) {
                            <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="io-warnings">
                              <p class="font-semibold mb-1 flex items-center gap-2"><app-icon name="warning-triangle" class="w-4 h-4 block" /> Nézd át:</p>
                              <ul class="list-disc pl-5 space-y-0.5 break-words">
                                @for (w of r.warnings; track $index) { <li>{{ w }}</li> }
                              </ul>
                            </div>
                          } @else {
                            <p class="text-sm text-text-muted" data-testid="io-no-warnings">Nincs figyelmeztetés.</p>
                          }
                        </div>
                      }
                    }
                  </div>
                }

                <div class="flex flex-wrap gap-2" data-testid="io-downloads">
                  <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="download('source')" [disabled]="downloading() !== null"
                    [attr.aria-label]="'Kiinduló fájl letöltése: ' + r.sourceFileName" data-testid="io-download-source">
                    {{ downloading() === 'source' ? 'Letöltés…' : 'Kiinduló fájl letöltése' }}
                  </button>
                  <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="download('solution')" [disabled]="downloading() !== null"
                    [attr.aria-label]="'Megoldás letöltése: ' + r.solutionFileName" data-testid="io-download-solution">
                    {{ downloading() === 'solution' ? 'Letöltés…' : 'Megoldás letöltése' }}
                  </button>
                  @if (dirty()) { <span class="text-xs text-text-muted self-center">A kiinduló fájl a legutóbbi ellenőrzésé.</span> }
                </div>
                @if (downloadError()) { <p class="text-sm text-danger" role="alert" data-testid="io-download-error">{{ downloadError() }}</p> }

                @if (dirty()) {
                  <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning space-y-2" role="status" data-testid="io-dirty">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span>Módosítottad a feladatot - mentés előtt ellenőrizd újra (ez nem használ AI-t).</span>
                      <button type="button" class="btn btn-primary !px-3 !py-1" (click)="revalidate()" [disabled]="revalidating() || clientErrors().length > 0"
                        data-testid="io-revalidate">
                        {{ revalidating() ? 'Ellenőrzés…' : 'Újraellenőrzés' }}
                      </button>
                    </div>
                    @if (clientErrors().length > 0) {
                      <ul class="list-disc pl-5 text-danger break-words" data-testid="io-client-errors">
                        @for (e of clientErrors(); track $index) { <li>{{ e }}</li> }
                      </ul>
                    }
                  </div>
                }
                @if (revalidateError()) {
                  <p class="text-sm text-danger" role="alert" data-testid="io-revalidate-error">{{ revalidateError() }}</p>
                }
                @if (saveError()) {
                  <p class="text-sm text-danger" role="alert" data-testid="io-save-error">{{ saveError() }}</p>
                }

                <div class="flex flex-wrap justify-end gap-2 pt-2">
                  <button type="button" class="btn btn-ghost mr-auto" (click)="discard()" [disabled]="saving() || discarding()" data-testid="io-discard">{{ discarding() ? 'Elvetés…' : 'Elvetés' }}</button>
                  @if (changedFromGenerated()) {
                    <button type="button" class="btn btn-ghost" (click)="restore()" [disabled]="saving()" data-testid="io-restore">Visszaállítás</button>
                  }
                  <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!canSave() || saving() || discarding()" data-testid="io-save">
                    {{ saving() ? 'Mentés…' : 'Mentés' }}
                  </button>
                </div>
              </div>
            }
          }
          @default {
            <div class="space-y-4" data-testid="io-input">
              @if (premiumRequired()) {
                <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex items-start gap-2" data-testid="io-premium">
                  <app-icon name="warning-triangle" class="w-5 h-5 block shrink-0" />
                  <span>{{ premiumMessage }}</span>
                </p>
              } @else if (quota(); as q) {
                <p class="text-sm" [class.text-danger]="quotaExhausted()" [class.text-text-muted]="!quotaExhausted()" data-testid="io-quota">
                  @if (quotaExhausted()) {
                    Elfogyott a havi kereted ({{ q.used }}/{{ q.limit }}) - a következő hónapban újra kérhetsz.
                  } @else {
                    Költség: 1 egység a havi keretedből (ebben a hónapban még {{ q.limit - q.used }} / {{ q.limit }} maradt). Az újraellenőrzés ingyenes.
                  }
                </p>
              }

              <p class="text-sm text-text-muted">
                Töltsd fel a kész, megoldott munkafüzetet. Az AI érettségi stílusban megírja a feladatot és a részfeladatokat pontokkal, a rendszer a
                megoldásból „visszacsinálja” a kiinduló fájlt, és szempontlistát készít gépi szabályokkal. Mentés előtt mindent átnézhetsz és módosíthatsz.
              </p>

              <div>
                <label for="io-file" class="text-sm font-medium block mb-1">Megoldott munkafüzet (.xlsx, legfeljebb 20 MB)</label>
                <input id="io-file" type="file" accept=".xlsx" class="text-sm max-w-full" (change)="pickFile($event)" data-testid="io-file" />
                @if (fileError()) { <p class="text-sm text-danger mt-1" role="alert" data-testid="io-file-error">{{ fileError() }}</p> }
              </div>

              <div class="flex flex-wrap gap-4">
                <fieldset>
                  <legend class="text-sm font-medium mb-1">Szint</legend>
                  <div class="flex gap-3">
                    @for (lv of levels; track lv.value) {
                      <label class="flex items-center gap-1.5 text-sm">
                        <input type="radio" name="io-level" [value]="lv.value" [checked]="level() === lv.value" (change)="level.set(lv.value)"
                          [attr.data-testid]="'io-level-' + lv.value" />
                        {{ lv.label }}
                      </label>
                    }
                  </div>
                </fieldset>
                <div>
                  <label for="io-count" class="text-sm font-medium block mb-1">Részfeladatok száma</label>
                  <select id="io-count" class="input !px-2 !py-1 !w-24" [ngModel]="subtaskCount()" (ngModelChange)="subtaskCount.set(+$event)"
                    [ngModelOptions]="{ standalone: true }" data-testid="io-count">
                    @for (n of subtaskCounts; track n) { <option [ngValue]="n">{{ n }}</option> }
                  </select>
                </div>
              </div>

              <div>
                <label for="io-notes" class="text-sm font-medium block mb-1">Megjegyzés az AI-nak (nem kötelező)</label>
                <textarea id="io-notes" rows="3" class="input !px-2 !py-1 !text-sm" [maxlength]="maxNotes" [ngModel]="notesInput()" (ngModelChange)="notesInput.set($event)"
                  [ngModelOptions]="{ standalone: true }" placeholder="Pl. az átlagszámítás és a diagram legyen külön részfeladat." data-testid="io-notes"></textarea>
                <p class="text-xs text-text-muted mt-1">{{ notesInput().length }}/{{ maxNotes }}</p>
              </div>

              @if (startError()) {
                <p class="text-sm text-danger" role="alert" data-testid="io-error">{{ startError() }}</p>
              }

              <div class="flex flex-wrap justify-end gap-2">
                <button type="button" class="btn btn-ghost" (click)="close()">Mégse</button>
                <button type="button" class="btn btn-primary" (click)="start()" [disabled]="!canStart()" data-testid="io-start">
                  {{ starting() ? 'Indítás…' : 'Elkészítés' }}
                </button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class IrodaiMegoldasbolComponent implements OnInit {
  private readonly service = inject(TeacherOfficeTaskService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly taskSetId = input.required<number>();
  readonly closed = output<void>();
  /** Sikeres mentés után az új feladat azonosítójával - a szerkesztő újratölt és kinyitja. */
  readonly saved = output<number>();

  readonly tabs = TABS;
  readonly levels: { value: OfficeTaskLevel; label: string }[] = [
    { value: 'kozep', label: 'Középszint' },
    { value: 'emelt', label: 'Emelt szint' },
  ];
  readonly subtaskCounts = [3, 4, 5, 6, 7, 8];
  readonly opNames = EXCEL_UNDO_OP_NAMES;
  readonly styleParts = STYLE_PARTS;
  readonly maxNotes = MAX_NOTES;
  readonly maxTitle = MAX_TITLE;
  readonly maxDescription = MAX_DESCRIPTION;
  readonly maxLabel = MAX_LABEL;
  readonly maxSubtaskText = MAX_SUBTASK_TEXT;
  readonly maxItemText = MAX_ITEM_TEXT;
  readonly maxPoints = MAX_POINTS;
  readonly maxUndo = MAX_UNDO;
  readonly maxItems = MAX_ITEMS;
  readonly premiumMessage = OFFICE_PREMIUM_MESSAGE;

  readonly step = signal<Step>('input');
  readonly tab = signal<Tab>('feladat');

  // ── Kérés ──
  readonly quota = signal<AiHelperQuotaItemDto | null>(null);
  private readonly premium = signal<boolean | null>(null);
  /** A szerver is mondhatja (pl. közben lejárt az előfizetés). */
  private readonly premiumRejected = signal(false);
  readonly premiumRequired = computed(() => this.premiumRejected() || this.premium() === false);
  readonly quotaExhausted = computed(() => {
    const q = this.quota();
    return !!q && q.used >= q.limit;
  });
  readonly file = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly level = signal<OfficeTaskLevel>('kozep');
  readonly subtaskCount = signal(5);
  readonly notesInput = signal('');
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);
  /** Nyitáskor a szerveren lévő aktív job lekérdezése - addig nem indítható új. */
  readonly checkingActive = signal(false);

  readonly canStart = computed(
    () =>
      !this.starting() &&
      !this.checkingActive() &&
      !this.premiumRequired() &&
      !this.quotaExhausted() &&
      !!this.file() &&
      !this.fileError() &&
      this.notesInput().length <= MAX_NOTES,
  );

  // ── Készítés ──
  readonly jobId = signal<number | null>(null);
  readonly jobFileName = signal<string | null>(null);
  readonly progressText = signal<string | null>(null);
  readonly pollError = signal<string | null>(null);
  private startSub: Subscription | null = null;
  private polling: Subscription | null = null;

  // ── Előnézet ──
  private readonly generated = signal<OfficeTaskResultDto | null>(null);
  readonly proposal = signal<OfficeTaskProposal | null>(null);
  /** Az utoljára ellenőrzött, szerver által normalizált változat - mentéskor PONTOSAN ez megy. */
  private readonly validated = signal<OfficeTaskProposal | null>(null);
  readonly report = signal<OfficeTaskReport | null>(null);
  readonly notes = computed(() => this.generated()?.notes ?? null);
  readonly hasOwnSource = signal(false);
  /** A még fel nem küldött saját kiinduló fájl (az Újraellenőrzés viszi fel). */
  readonly pendingOwnSource = signal<File | null>(null);
  readonly ownSourceError = signal<string | null>(null);
  readonly revalidating = signal(false);
  readonly revalidateError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly discarding = signal(false);
  readonly downloading = signal<OfficeTaskFileKind | null>(null);
  readonly downloadError = signal<string | null>(null);
  private readonly editing = signal<string | null>(null);
  private revalidation: Subscription | null = null;
  private discardSub: Subscription | null = null;
  private downloadSub: Subscription | null = null;

  readonly dirty = computed(() => this.pendingOwnSource() !== null || !sameProposal(this.proposal(), this.validated()));
  readonly changedFromGenerated = computed(
    () => !!this.generated() && (this.pendingOwnSource() !== null || !sameProposal(this.proposal(), this.generated()!.proposal)),
  );
  readonly canSave = computed(() => !!this.report()?.canSave && !this.dirty() && !!this.validated());
  readonly pointsSum = computed(() => (this.proposal()?.subtasks ?? []).reduce((sum, s) => sum + (s.points || 0), 0));

  /** Műveletenkénti kliensoldali hibák („si-oi” → üzenet). */
  private readonly undoErrors = computed(() => {
    const map = new Map<string, string>();
    (this.proposal()?.subtasks ?? []).forEach((s, si) =>
      s.undo.forEach((o, oi) => {
        const err = validateUndoOp(o);
        if (err) map.set(`${si}-${oi}`, err);
      }),
    );
    return map;
  });

  /** Amit a szerver úgyis elutasítana (400) - ezek javításáig az Újraellenőrzés nem indítható. */
  readonly clientErrors = computed(() => {
    const p = this.proposal();
    if (!p) return [];
    const errors: string[] = [];
    const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_POINTS;
    if (!p.title.trim()) errors.push('Add meg a feladat címét.');
    if (!p.description.trim()) errors.push('Add meg a feladat leírását.');
    p.subtasks.forEach((s, si) => {
      const name = s.label.trim() || `${si + 1}.`;
      if (!s.text.trim()) errors.push(`${name}: a részfeladat szövege üres.`);
      if (!inRange(s.points)) errors.push(`${name}: a pont 1 és ${MAX_POINTS} közötti egész szám lehet.`);
      s.undo.forEach((o, oi) => {
        const err = this.undoErrors().get(`${si}-${oi}`);
        if (err) errors.push(`${name}: ${oi + 1}. visszacsinálási művelet - ${err}.`);
      });
      s.rubric.forEach((it, ri) => {
        if (!it.text.trim()) errors.push(`${name}: a(z) ${ri + 1}. szempont szövege üres.`);
        if (!inRange(it.points)) errors.push(`${name}: a(z) ${ri + 1}. szempont pontja 1 és ${MAX_POINTS} közötti egész szám lehet.`);
      });
    });
    if (p.sourceMode === 'own' && !this.pendingOwnSource() && !this.hasOwnSource()) errors.push('Saját kiinduló fájlhoz tölts fel egy .xlsx fájlt.');
    return errors;
  });

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit(): void {
    this.loadQuota();
    this.reconnect();
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  /** Visszakapcsolódás a futó / elkészült, még nem mentett jobhoz (oldal-újratöltés, bezárt ablak után is). */
  private reconnect(): void {
    this.checkingActive.set(true);
    this.service
      .getActiveJob(this.taskSetId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.checkingActive.set(false);
          if (job && this.step() === 'input') this.resume(job.jobId);
        },
        error: () => this.checkingActive.set(false),
      });
  }

  private loadQuota(): void {
    this.service
      .getQuota()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          this.premium.set(q.premium);
          this.quota.set(q.officeTask ?? null);
        },
        error: () => this.quota.set(null),
      });
  }

  pickFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.fileError.set(file ? this.fileProblem(file) : null);
  }

  private fileProblem(file: File): string | null {
    if (!isXlsx(file)) return 'Egyelőre csak Excel-munkafüzet (.xlsx) tölthető fel.';
    if (file.size === 0) return 'A fájl üres.';
    if (file.size > MAX_FILE_BYTES) return 'A fájl túl nagy (legfeljebb 20 MB).';
    return null;
  }

  start(): void {
    const file = this.file();
    if (!this.canStart() || !file) return;
    this.starting.set(true);
    this.startError.set(null);
    this.startSub = this.service
      .startJob(this.taskSetId(), { file, level: this.level(), subtaskCount: this.subtaskCount(), notes: this.notesInput().trim() || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.starting.set(false);
          this.quota.set({ used: res.quota.used, limit: res.quota.limit });
          this.poll(res.jobId);
        },
        error: (err) => {
          this.starting.set(false);
          if (err?.error?.errorType === 'OfficeTaskAlreadyRunning') {
            const details = err.error.details as { jobId?: number; taskSetId?: number } | undefined;
            if (details?.jobId && details.taskSetId === this.taskSetId()) {
              this.resume(details.jobId);
              return;
            }
            this.startError.set('Egy másik feladatsorodon már készül egy irodai feladat - várd meg, amíg elkészül (ott a gombbal meg is nyithatod).');
            return;
          }
          const block = aiHelperBlock(err);
          if (block === 'premium') this.premiumRejected.set(true);
          if (block === 'quota') this.loadQuota();
          this.startError.set(this.errorText(err, 'Az irodai feladat indítása nem sikerült.'));
        },
      });
  }

  resume(jobId: number): void {
    this.startError.set(null);
    this.poll(jobId);
  }

  private poll(jobId: number): void {
    this.stopPolling();
    this.jobId.set(jobId);
    this.progressText.set(null);
    this.pollError.set(null);
    this.step.set('running');
    this.polling = defer(() => this.service.getJob(this.taskSetId(), jobId))
      .pipe(
        // Átmeneti hálózati hiba: néhányszor újra; a 404 (lejárt / nem a tiéd) végleges.
        retry({ count: 3, resetOnSuccess: true, delay: (err) => (err?.status === 404 ? throwError(() => err) : timer(OFFICE_POLL_MS)) }),
        repeat({ delay: OFFICE_POLL_MS }),
        takeWhile((job) => ACTIVE_STATUSES.has(job.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (job) => {
          if (this.jobId() === jobId) this.onJob(job);
        },
        error: (err) => {
          if (this.jobId() !== jobId) return;
          if (err?.status === 404) this.backToInput('Ez a generálás már nem érhető el (24 óra után lejár). Indíts újat.');
          else this.pollError.set(extractErrorMessage(err, 'Az állapot lekérdezése nem sikerült - zárd be, és nyisd meg újra később.'));
        },
      });
  }

  private onJob(job: OfficeTaskJobDto): void {
    this.jobFileName.set(job.fileName || null);
    this.progressText.set(job.progressText);
    this.hasOwnSource.set(job.hasOwnSource);
    if (job.status === 'failed') {
      // A szerver üzenete mondja meg, visszajár-e a keret.
      this.loadQuota();
      this.backToInput(job.error || 'Az irodai feladat elkészítése nem sikerült.');
    } else if (job.status === 'done') {
      if (job.appliedTaskId != null) this.backToInput('Ezt a feladatot már elmentetted.');
      else if (job.result) this.showResult(job.result);
    }
  }

  private backToInput(message: string | null): void {
    this.stopPolling();
    this.resetPreview();
    this.jobId.set(null);
    this.jobFileName.set(null);
    this.step.set('input');
    this.startError.set(message);
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }

  private showResult(result: OfficeTaskResultDto): void {
    this.cancelRevalidation();
    this.generated.set(result);
    this.proposal.set(result.proposal);
    this.validated.set(result.proposal);
    this.report.set(result.report);
    this.pendingOwnSource.set(null);
    this.editing.set(null);
    this.tab.set(result.report.canSave ? 'feladat' : 'ellenorzes');
    this.saveError.set(null);
    this.revalidateError.set(null);
    this.ownSourceError.set(null);
    this.downloadError.set(null);
    this.step.set('preview');
  }

  private resetPreview(): void {
    this.cancelRevalidation();
    this.generated.set(null);
    this.proposal.set(null);
    this.validated.set(null);
    this.report.set(null);
    this.pendingOwnSource.set(null);
    this.editing.set(null);
    this.saveError.set(null);
    this.revalidateError.set(null);
  }

  private cancelRevalidation(): void {
    this.revalidation?.unsubscribe();
    this.revalidation = null;
    this.revalidating.set(false);
  }

  // ── Szerkesztés ──
  private update(fn: (p: OfficeTaskProposal) => OfficeTaskProposal): void {
    const current = this.proposal();
    if (current) this.proposal.set(fn(current));
  }

  private updateSubtask(si: number, fn: (s: OfficeProposalSubtask) => OfficeProposalSubtask): void {
    this.update((p) => ({ ...p, subtasks: p.subtasks.map((s, i) => (i === si ? fn(s) : s)) }));
  }

  setField(field: 'title' | 'description', value: string): void {
    this.update((p) => ({ ...p, [field]: value }));
  }

  setSubtask(si: number, patch: Partial<Pick<OfficeProposalSubtask, 'label' | 'text' | 'points'>>): void {
    this.updateSubtask(si, (s) => ({ ...s, ...patch }));
  }

  toInt(value: unknown): number {
    return value === null || value === '' || value === undefined ? Number.NaN : Number(value);
  }

  emptyToNull(value: string): string | null {
    return value.trim() ? value : null;
  }

  setUndo(si: number, oi: number, patch: Partial<OfficeUndoOp>): void {
    this.updateSubtask(si, (s) => ({ ...s, undo: s.undo.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }));
  }

  toggleUndo(si: number, oi: number): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (op) this.setUndo(si, oi, { enabled: !op.enabled });
  }

  changeKind(si: number, oi: number, next: ExcelUndoOpName): void {
    this.updateSubtask(si, (s) => ({ ...s, undo: s.undo.map((o, j) => (j === oi ? changeUndoOpKind(o, next) : o)) }));
  }

  /** A diagram sorszáma a felületen 1-től, a szerződésben 0-alapú index. */
  setChartNumber(si: number, oi: number, value: unknown): void {
    const n = this.toInt(value);
    this.setUndo(si, oi, { index: Number.isNaN(n) ? null : n - 1 });
  }

  togglePart(si: number, oi: number, part: ExcelStylePart): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (!op) return;
    const current = new Set(op.parts ?? []);
    if (current.has(part)) current.delete(part);
    else current.add(part);
    const parts = STYLE_PARTS.map((p) => p.key).filter((k) => current.has(k));
    this.setUndo(si, oi, { parts: parts.length === 0 ? null : parts });
  }

  removeUndo(si: number, oi: number): void {
    this.editing.set(null);
    this.updateSubtask(si, (s) => ({ ...s, undo: s.undo.filter((_, j) => j !== oi) }));
  }

  addUndo(si: number): void {
    const s = this.proposal()?.subtasks[si];
    if (!s || s.undo.length >= MAX_UNDO) return;
    const sheet = s.undo.find((o) => o.sheet)?.sheet ?? null;
    this.updateSubtask(si, (st) => ({ ...st, undo: [...st.undo, newUndoOp('clearFormulas', sheet)] }));
    this.editing.set(`${si}-${s.undo.length}`);
  }

  toggleEdit(si: number, oi: number): void {
    const key = `${si}-${oi}`;
    this.editing.set(this.editing() === key ? null : key);
  }

  isEditing(si: number, oi: number): boolean {
    return this.editing() === `${si}-${oi}`;
  }

  undoError(si: number, oi: number): string | null {
    return this.undoErrors().get(`${si}-${oi}`) ?? null;
  }

  setRubric(si: number, ri: number, patch: Partial<Pick<OfficeRubricItem, 'text' | 'points'>>): void {
    this.updateSubtask(si, (s) => ({ ...s, rubric: s.rubric.map((it, j) => (j === ri ? { ...it, ...patch } : it)) }));
  }

  removeRubric(si: number, ri: number): void {
    this.updateSubtask(si, (s) => ({ ...s, rubric: s.rubric.filter((_, j) => j !== ri) }));
  }

  addRubric(si: number): void {
    this.updateSubtask(si, (s) =>
      s.rubric.length >= MAX_ITEMS ? s : { ...s, rubric: [...s.rubric, { key: null, text: '', points: 1, machine: false, gate: null, gateReason: null }] },
    );
  }

  setSourceMode(mode: OfficeSourceMode): void {
    this.update((p) => ({ ...p, sourceMode: mode }));
    if (mode === 'derived') this.pendingOwnSource.set(null);
  }

  loadOwnSource(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    const problem = this.fileProblem(file);
    this.ownSourceError.set(problem);
    if (problem) return;
    this.pendingOwnSource.set(file);
    this.update((p) => ({ ...p, sourceMode: 'own' }));
  }

  /** A generált változat vissza; ha a szerver legutóbb is azt ellenőrizte, a generáláskori eredmény ismét érvényes. */
  restore(): void {
    const generated = this.generated();
    if (!generated) return;
    this.proposal.set(generated.proposal);
    this.pendingOwnSource.set(null);
    this.ownSourceError.set(null);
    this.editing.set(null);
    if (sameProposal(generated.proposal, this.validated())) this.report.set(generated.report);
  }

  discard(): void {
    const jobId = this.jobId();
    if (jobId == null || this.discarding() || this.saving()) return;
    this.discarding.set(true);
    this.saveError.set(null);
    this.discardSub = this.service
      .dismiss(this.taskSetId(), jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.afterDiscard(jobId),
        error: (err) => {
          // 404: már nincs ilyen job - az eredmény úgyis elveszett.
          if (err?.status === 404) {
            this.afterDiscard(jobId);
            return;
          }
          this.discarding.set(false);
          this.saveError.set(this.errorText(err, 'Az elvetés nem sikerült - próbáld újra.'));
        },
      });
  }

  private afterDiscard(jobId: number): void {
    this.discarding.set(false);
    if (this.jobId() === jobId) this.backToInput(null);
  }

  /** Ellenőrzés a szerveren MI nélkül; a válasz normalizált javaslata lesz a menthető változat. */
  revalidate(): void {
    const jobId = this.jobId();
    const sent = this.proposal();
    const ownFile = this.pendingOwnSource();
    if (this.revalidating() || jobId == null || !sent || this.clientErrors().length > 0) return;
    const basis = this.generated();
    this.revalidating.set(true);
    this.revalidateError.set(null);
    this.saveError.set(null);
    this.revalidation = this.service
      .validate(this.taskSetId(), jobId, sent, ownFile)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.revalidating.set(false);
          // Közben Elvetés / másik job: az elavult válasz eldobva.
          if (this.generated() !== basis || this.jobId() !== jobId) return;
          this.validated.set(res.proposal);
          this.report.set(res.report);
          if (ownFile) {
            this.hasOwnSource.set(true);
            if (this.pendingOwnSource() === ownFile) this.pendingOwnSource.set(null);
          }
          // Ha a tanár közben nem módosított, a normalizált változat kerül a szerkesztőbe; különben a módosítása marad.
          if (this.proposal() === sent) this.proposal.set(res.proposal);
        },
        error: (err) => {
          this.revalidating.set(false);
          if (this.generated() !== basis || this.jobId() !== jobId) return;
          if (aiHelperBlock(err) === 'premium') this.premiumRejected.set(true);
          this.revalidateError.set(this.errorText(err, 'Az ellenőrzés nem sikerült.'));
        },
      });
  }

  save(): void {
    const jobId = this.jobId();
    const proposal = this.validated();
    if (!this.canSave() || this.saving() || jobId == null || !proposal) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.service.apply(this.taskSetId(), jobId, proposal).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.toastService.success(`Elmentve: ${res.saved.join(', ')}.`);
        this.saved.emit(res.taskId);
        this.closed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        if (aiHelperBlock(err) === 'premium') this.premiumRejected.set(true);
        this.saveError.set(this.errorText(err, 'A mentés nem sikerült.'));
      },
    });
  }

  download(kind: OfficeTaskFileKind): void {
    const jobId = this.jobId();
    const r = this.report();
    if (jobId == null || !r || this.downloading()) return;
    const fileName = kind === 'source' ? r.sourceFileName : r.solutionFileName;
    this.downloading.set(kind);
    this.downloadError.set(null);
    this.downloadSub = this.service
      .downloadFile(this.taskSetId(), jobId, kind)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloading.set(null);
          saveBlob(blob, fileName);
        },
        error: (err) => {
          this.downloading.set(null);
          this.downloadError.set(
            err?.status === 404 && kind === 'source'
              ? 'A kiinduló fájl még nem készült el - javítsd a hibákat, és futtasd le az Újraellenőrzést.'
              : extractErrorMessage(err, 'A letöltés nem sikerült.'),
          );
        },
      });
  }

  close(): void {
    if (this.saving()) return;
    this.startSub?.unsubscribe();
    this.startSub = null;
    this.starting.set(false);
    this.stopPolling();
    this.cancelRevalidation();
    this.discardSub?.unsubscribe();
    this.downloadSub?.unsubscribe();
    this.closed.emit();
  }

  onTabKey(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    this.tab.set(next.id);
    setTimeout(() => (document.getElementById(`io-tab-${next.id}`) as HTMLElement | null)?.focus());
  }

  private errorText(err: unknown, fallback: string): string {
    const helper = aiHelperErrorMessage(err);
    if (helper) return aiHelperBlock(err) === 'premium' ? OFFICE_PREMIUM_MESSAGE : helper;
    const e = err as { status?: number; error?: { errorType?: string } } | null;
    switch (e?.error?.errorType) {
      case 'OfficeTaskAlreadyRunning':
        return 'Már készül egy irodai feladatod - várd meg, amíg elkészül.';
      case 'FeatureDisabled':
        return 'Az irodai feladat a megoldott fájlból most nincs bekapcsolva. Próbáld később.';
    }
    if (e?.status === 429) return 'Túl sok kérés rövid időn belül - várj néhány percet, és próbáld újra.';
    if (e?.status === 413) return 'A fájl túl nagy (legfeljebb 20 MB).';
    return extractErrorMessage(err, fallback);
  }

  // ── Megjelenítés ──
  describe(op: OfficeUndoOp): string {
    return describeUndoOp(op);
  }

  canonical(op: string): ExcelUndoOpName | null {
    return canonicalOp(op);
  }

  opLabel(name: ExcelUndoOpName): string {
    return EXCEL_UNDO_OPS[name].label;
  }

  has(op: OfficeUndoOp, field: 'range' | 'name' | 'index' | 'columns' | 'parts'): boolean {
    return !!opSpec(op.op)?.fields.includes(field);
  }

  rangeOptional(op: OfficeUndoOp): boolean {
    return !!opSpec(op.op)?.rangeOptional;
  }

  undoLabel(op: OfficeUndoOp): string {
    return op.result ? UNDO_RESULT[op.result].label : '';
  }

  undoBadge(op: OfficeUndoOp): string {
    return op.result ? UNDO_RESULT[op.result].badge : '';
  }

  gateLabel(item: OfficeRubricItem): string {
    return GATE[item.gate ?? 'none'].label;
  }

  gateBadge(item: OfficeRubricItem): string {
    return GATE[item.gate ?? 'none'].badge;
  }

  rubricSum(s: OfficeProposalSubtask): number {
    return s.rubric.reduce((sum, it) => sum + (it.points || 0), 0);
  }
}
