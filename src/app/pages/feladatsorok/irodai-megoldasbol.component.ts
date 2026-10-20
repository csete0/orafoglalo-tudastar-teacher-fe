import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, OnInit, output, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, defer, forkJoin, from, map, of, repeat, retry, Subscription, switchMap, takeWhile, throwError, timer } from 'rxjs';
import {
  ExcelUndoOpName,
  OfficeFileKind,
  OfficeParagraphAnchor,
  OfficeProposalSubtask,
  OfficeRubricItem,
  OfficeSlideShape,
  OfficeSourceMode,
  OfficeTaskFileKind,
  OfficeTaskJobDto,
  OfficeTaskLevel,
  OfficeTaskProposal,
  OfficeTaskReport,
  OfficeTaskResultDto,
  OfficeUndoOp,
  OfficeWebElement,
  PptUndoOpName,
  WebUndoOpName,
  WordUndoOpName,
} from '../../models/office-task.model';
import { TeacherOfficeTaskService } from '../../services/teacher-office-task/teacher-office-task.service';
import { AiHelperQuotaItemDto, aiHelperBlock, aiHelperErrorMessage } from '../../shared/ai-helper-quota.util';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { saveBlob } from '../../shared/save-blob.util';
import { ToastService } from '../../shared/toast/toast.service';
import {
  canonicalOp,
  canonicalPptOp,
  canonicalWebOp,
  canonicalWordOp,
  changeUndoOpKind,
  changePptUndoOpKind,
  changeWebUndoOpKind,
  changeWordUndoOpKind,
  describeUndoOp,
  EXCEL_UNDO_OP_NAMES,
  EXCEL_UNDO_OPS,
  MAX_REPLACE,
  newUndoOp,
  isCssFile,
  isHtmlFile,
  newPptUndoOp,
  newWebUndoOp,
  newWordUndoOp,
  opSpec,
  parseAnchorMismatch,
  parseElementMismatch,
  parseShapeMismatch,
  PPT_FONT_PARTS,
  PPT_UNDO_OP_NAMES,
  PPT_UNDO_OPS,
  pptOpSpec,
  STYLE_PARTS,
  validateUndoOp,
  WORD_FIELDS,
  WORD_PARTS,
  WORD_UNDO_OP_NAMES,
  WORD_UNDO_OPS,
  WEB_UNDO_OP_NAMES,
  WEB_UNDO_OPS,
  webOpSpec,
  wordOpSpec,
} from './irodai-undo.util';
import { webPreviewFromBlob } from './web-preview.util';
import { WordParagraphPickerComponent } from './word-paragraph-picker.component';

/** Az állapot-lekérdezés gyakorisága (ms). */
export const OFFICE_POLL_MS = 2000;
/** A BE-vel azonos korlátok (TeacherOfficeTaskService / OfficeTaskPrompt). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Grafikánál a megoldás + a saját kiinduló kép együtt (az nginx 26 MB-os kérés-korlátja miatt). */
export const MAX_GRAPHICS_TOTAL_BYTES = 25 * 1024 * 1024;
const GRAPHICS_TOTAL_MESSAGE = 'A két kép együtt legfeljebb 25 MB lehet – kicsinyítsd vagy tömörítsd őket.';
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

interface WebFrame {
  html: SafeHtml | null;
  error: string | null;
}

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

/**
 * Kulcs-sorrendtől független JSON (a szerver és a kliens objektumai más sorrendben is tarthatják a mezőket); a null mező = hiányzó
 * (a szerver a Word-paramétereket csak kitöltve küldi).
 */
function canon(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).filter((k) => v[k] != null).sort().map((k) => [k, v[k]]))
      : v,
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

const EXTENSION: Record<OfficeFileKind, string> = { excel: '.xlsx', word: '.docx', powerpoint: '.pptx', web: '.zip vagy .html', graphics: '.png, .jpg, .gif vagy .svg' };
const ACCEPT: Record<OfficeFileKind, string> = { excel: '.xlsx', word: '.docx', powerpoint: '.pptx', web: '.zip,.html', graphics: '.png,.jpg,.jpeg,.gif,.svg' };
const KIND_LABEL: Record<OfficeFileKind, string> = { excel: 'Excel', word: 'Word', powerpoint: 'PowerPoint', web: 'Weblap', graphics: 'Grafika' };
const KIND_ICON: Record<OfficeFileKind, IconName> = { excel: 'chart', word: 'document', powerpoint: 'academic-cap', web: 'link', graphics: 'eye' };
const KINDS: OfficeFileKind[] = ['excel', 'word', 'powerpoint', 'web', 'graphics'];

/** A fájl fajtája a kiterjesztéséből (mint a szerveren), vagy null. */
export function officeFileKind(file: File): OfficeFileKind | null {
  if (/\.(png|jpe?g|gif|svg)$/i.test(file.name)) return 'graphics';
  if (/\.pptx$/i.test(file.name)) return 'powerpoint';
  return /\.xlsx$/i.test(file.name) ? 'excel' : /\.docx$/i.test(file.name) ? 'word' : /\.(zip|html?)$/i.test(file.name) ? 'web' : null;
}

/**
 * „Irodai feladat a megoldott fájlból” párbeszédablak a feladatsor-szerkesztőben (PATRICKS-IRODAI-FELADAT-MEGOLDASBOL-TERV.md,
 * Excel, Word, PowerPoint, weblap, grafika - a fajta a feltöltött fájlból). A tanár a kész fájlt tölti fel; a háttérben az MI megírja a
 * feladatot, a részfeladatonkénti visszacsinálást és a szempontlistát, a szerver előállítja a kiinduló fájlt és lefuttatja a kettős
 * kaput. Szerkesztés után Újraellenőrzés (MI nélkül), csak az utoljára ellenőrzött változat menthető.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-irodai-megoldasbol',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent, WordParagraphPickerComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <div class="absolute inset-0 bg-black/40" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="io-title" tabindex="-1" data-testid="io-dialog"
        class="card relative w-full max-w-4xl p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none min-w-0">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-secondary shrink-0"><app-icon [name]="kindIcon()" class="w-5 h-5 block" /></div>
            <div class="min-w-0">
              <h2 id="io-title" class="font-bold text-lg">Irodai feladat a megoldott fájlból ({{ kindLabel() }})</h2>
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

                <div role="tablist" aria-label="Az elkészült feladat részei" class="flex flex-wrap gap-x-1 border-b border-border-default -mx-1 px-1" data-testid="io-tablist">
                  @for (t of tabs; track t.id; let i = $index) {
                    <button type="button" role="tab" [id]="'io-tab-' + t.id" [attr.aria-selected]="tab() === t.id"
                      [attr.aria-controls]="'io-panel-' + t.id" [attr.tabindex]="tab() === t.id ? 0 : -1"
                      (click)="tab.set(t.id)" (keydown)="onTabKey($event, i)" [attr.data-testid]="'io-tab-' + t.id"
                      class="px-2 sm:px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px"
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
                            @if (isGraphics()) {
                              <p class="text-sm text-text-muted" data-testid="io-graphics-own">Grafikánál nincs visszacsinálás: a diák a saját kiinduló képedet kapja. Itt lecserélheted.</p>
                            } @else {
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
                            }
                            <div class="flex flex-wrap items-center gap-2 pl-6">
                              <label class="btn btn-ghost !px-2 !py-1 text-sm">
                                Saját kiinduló fájl feltöltése
                                <input type="file" [accept]="accept()" class="sr-only" (change)="loadOwnSource($event)" data-testid="io-own-upload" />
                              </label>
                              @if (pendingOwnSource(); as f) {
                                <span class="text-sm break-all" data-testid="io-own-pending">{{ f.name }} (az Újraellenőrzéssel kerül fel)</span>
                              } @else if (hasOwnSource()) {
                                <span class="text-xs text-text-muted">Már feltöltöttél saját kiinduló fájlt.</span>
                              }
                            </div>
                            @if (ownSourceError()) { <p class="text-sm text-danger pl-6" role="alert" data-testid="io-own-error">{{ ownSourceError() }}</p> }
                          </fieldset>

                          @if (p.sourceMode === 'own' && !isGraphics()) {
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
                                  @if (o.message && !dirty()) {
                                    <div class="flex flex-wrap items-start gap-2">
                                      <p class="text-xs break-words flex-1 min-w-0" [class.text-danger]="o.result === 'error'" [class.text-text-muted]="o.result !== 'error'"
                                        [attr.data-testid]="'io-undo-message-' + si + '-' + oi">{{ o.message }}</p>
                                      @if (isWord() && mismatch(o); as mm) {
                                        <button type="button" class="text-xs text-primary hover:underline" (click)="fixAnchor(si, oi)"
                                          [attr.data-testid]="'io-undo-fix-anchor-' + si + '-' + oi">A(z) [{{ mm.index + 1 }}] bekezdés valódi szövegének átvétele</button>
                                      }
                                      @if (isPpt() && shapeMismatch(o); as sm) {
                                        <button type="button" class="text-xs text-primary hover:underline" (click)="fixShape(si, oi)"
                                          [attr.data-testid]="'io-undo-fix-shape-' + si + '-' + oi">Az alakzat valódi nevének („{{ sm.name }}”) átvétele</button>
                                      }
                                      @if (isWeb() && elementMismatch(o); as em) {
                                        <button type="button" class="text-xs text-primary hover:underline" (click)="fixElement(si, oi)"
                                          [attr.data-testid]="'io-undo-fix-element-' + si + '-' + oi">A(z) [{{ em.index + 1 }}] elem valódi címkéjének (&lt;{{ em.tag }}&gt;) átvétele</button>
                                      }
                                    </div>
                                  }
                                  @if (undoError(si, oi); as err) {
                                    <p class="text-xs text-danger" role="alert" [attr.data-testid]="'io-undo-error-' + si + '-' + oi">{{ err }}</p>
                                  }
                                  @if (isEditing(si, oi) && isWeb()) {
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + si + '-' + oi">
                                      <div class="sm:col-span-2">
                                        <label [for]="'io-op-' + si + '-' + oi" class="text-xs text-text-muted block">Művelet</label>
                                        <select [id]="'io-op-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="canonicalWeb(o.op)"
                                          (ngModelChange)="changeWebKind(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + si + '-' + oi">
                                          @for (n of webOpNames; track n) { <option [ngValue]="n">{{ webOpLabel(n) }}</option> }
                                        </select>
                                      </div>
                                      <div class="sm:col-span-2">
                                        <label [for]="'io-file-' + si + '-' + oi" class="text-xs text-text-muted block">Fájl</label>
                                        <select [id]="'io-file-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="o.file ?? null"
                                          (ngModelChange)="setWebFile(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-file-' + si + '-' + oi">
                                          <option [ngValue]="null" disabled>válassz…</option>
                                          @for (f of webFiles(o); track f) { <option [ngValue]="f">{{ f }}</option> }
                                        </select>
                                      </div>
                                      @if (webHas(o, 'element')) {
                                        @if (elementOptions(o.file).length > 0) {
                                          <div class="sm:col-span-2">
                                            <label [for]="'io-element-' + si + '-' + oi" class="text-xs text-text-muted block">Elem (a megoldásban; a behúzás a beágyazást mutatja)</label>
                                            <select [id]="'io-element-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" [ngModel]="o.element?.index ?? null"
                                              (ngModelChange)="setElement(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-element-' + si + '-' + oi">
                                              <option [ngValue]="null" disabled>válassz…</option>
                                              @for (e of elementOptions(o.file); track e.index) { <option [ngValue]="e.index">{{ elementLabel(e) }}</option> }
                                            </select>
                                          </div>
                                        } @else {
                                          <div>
                                            <label [for]="'io-element-index-' + si + '-' + oi" class="text-xs text-text-muted block">Az elem sorszáma a fájlban (1-től)</label>
                                            <input [id]="'io-element-index-' + si + '-' + oi" type="number" min="1" max="3000" class="input !px-2 !py-1 !text-sm"
                                              [ngModel]="o.element?.index == null ? null : o.element!.index! + 1" (ngModelChange)="setElementManual(si, oi, { index: $event })"
                                              [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-element-index-' + si + '-' + oi" />
                                          </div>
                                          <div>
                                            <label [for]="'io-element-tag-' + si + '-' + oi" class="text-xs text-text-muted block">Az elem címkéje (pl. img)</label>
                                            <input [id]="'io-element-tag-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" maxlength="20" [ngModel]="o.element?.tag ?? ''"
                                              (ngModelChange)="setElementManual(si, oi, { tag: $event })" [ngModelOptions]="{ standalone: true }"
                                              [attr.data-testid]="'io-element-tag-' + si + '-' + oi" />
                                          </div>
                                        }
                                      }
                                      @if (webHas(o, 'selector')) {
                                        <div>
                                          <label [for]="'io-selector-' + si + '-' + oi" class="text-xs text-text-muted block">CSS-szelektor (pontosan, ahogy a stíluslapban áll)</label>
                                          <input [id]="'io-selector-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" maxlength="300" [ngModel]="o.selector ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { selector: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. #fejlec h1"
                                            [attr.data-testid]="'io-selector-' + si + '-' + oi" />
                                        </div>
                                        <div>
                                          <label [for]="'io-media-' + si + '-' + oi" class="text-xs text-text-muted block">@media-feltétel (elhagyható = a @media blokkokon kívül)</label>
                                          <input [id]="'io-media-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" maxlength="200" [ngModel]="o.media ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { media: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }" placeholder="pl. (max-width: 600px)"
                                            [attr.data-testid]="'io-media-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (webHas(o, 'property')) {
                                        <div>
                                          <label [for]="'io-property-' + si + '-' + oi" class="text-xs text-text-muted block">CSS-tulajdonság</label>
                                          <input [id]="'io-property-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" maxlength="60" [ngModel]="o.property ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { property: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. background-color"
                                            [attr.data-testid]="'io-property-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (webHas(o, 'attribute')) {
                                        <div>
                                          <label [for]="'io-attribute-' + si + '-' + oi" class="text-xs text-text-muted block">Attribútum</label>
                                          <input [id]="'io-attribute-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" maxlength="60" [ngModel]="o.attribute ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { attribute: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. alt"
                                            [attr.data-testid]="'io-attribute-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (canonicalWeb(o.op) === 'renameElement') {
                                        <div>
                                          <label [for]="'io-original-tag-' + si + '-' + oi" class="text-xs text-text-muted block">Az eredeti címke (ezt kapja a diák)</label>
                                          <input [id]="'io-original-tag-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm font-mono" maxlength="20" [ngModel]="o.original ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { original: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. td"
                                            [attr.data-testid]="'io-original-tag-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (webHas(o, 'find')) {
                                        <div>
                                          <label [for]="'io-find-' + si + '-' + oi" class="text-xs text-text-muted block">Az elem szövegében álló szövegrész (pontosan, címke nélkül)</label>
                                          <textarea [id]="'io-find-' + si + '-' + oi" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.find ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { find: $event })" [ngModelOptions]="{ standalone: true }"
                                            [attr.data-testid]="'io-find-' + si + '-' + oi"></textarea>
                                        </div>
                                        <div>
                                          <label [for]="'io-original-' + si + '-' + oi" class="text-xs text-text-muted block">Az eredeti szöveg (ezt kapja a diák; üres = törlés)</label>
                                          <textarea [id]="'io-original-' + si + '-' + oi" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.original ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { original: $event })" [ngModelOptions]="{ standalone: true }"
                                            [attr.data-testid]="'io-original-' + si + '-' + oi"></textarea>
                                        </div>
                                      }
                                    </div>
                                  } @else if (isEditing(si, oi) && isPpt()) {
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + si + '-' + oi">
                                      <div class="sm:col-span-2">
                                        <label [for]="'io-op-' + si + '-' + oi" class="text-xs text-text-muted block">Művelet</label>
                                        <select [id]="'io-op-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="canonicalPpt(o.op)"
                                          (ngModelChange)="changePptKind(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + si + '-' + oi">
                                          @for (n of pptOpNames; track n) { <option [ngValue]="n">{{ pptOpLabel(n) }}</option> }
                                        </select>
                                      </div>
                                      <div>
                                        <label [for]="'io-slide-' + si + '-' + oi" class="text-xs text-text-muted block">Dia (a megoldás szerinti sorszám)</label>
                                        <select [id]="'io-slide-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="o.slide ?? null"
                                          (ngModelChange)="setSlide(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-slide-' + si + '-' + oi">
                                          @if (pptSpec(o)?.allSlides) { <option [ngValue]="null">minden dia</option> } @else { <option [ngValue]="null" disabled>válassz…</option> }
                                          @for (n of slideOptions(o); track n) { <option [ngValue]="n">{{ n }}. dia</option> }
                                        </select>
                                      </div>
                                      @if (pptHas(o, 'shape')) {
                                        @if (shapeOptions(o.slide).length > 0) {
                                          <div class="sm:col-span-2">
                                            <label [for]="'io-shape-' + si + '-' + oi" class="text-xs text-text-muted block">Alakzat{{ pptSpec(o)?.needsShape ? '' : ' (elhagyható = a dia összes animációja)' }}</label>
                                            <select [id]="'io-shape-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="o.shape?.id ?? null"
                                              (ngModelChange)="setShape(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-shape-' + si + '-' + oi">
                                              <option [ngValue]="null" [disabled]="pptSpec(o)?.needsShape">{{ pptSpec(o)?.needsShape ? 'válassz…' : 'a dia összes animációja' }}</option>
                                              @for (sh of shapeOptions(o.slide); track sh.id) { <option [ngValue]="sh.id">{{ shapeLabel(sh) }}</option> }
                                            </select>
                                          </div>
                                        } @else {
                                          <div>
                                            <label [for]="'io-shape-id-' + si + '-' + oi" class="text-xs text-text-muted block">Az alakzat azonosítója</label>
                                            <input [id]="'io-shape-id-' + si + '-' + oi" type="number" min="0" class="input !px-2 !py-1 !text-sm"
                                              [ngModel]="o.shape?.id ?? null" (ngModelChange)="setShapeManual(si, oi, { id: $event })"
                                              [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-shape-id-' + si + '-' + oi" />
                                          </div>
                                          <div>
                                            <label [for]="'io-shape-name-' + si + '-' + oi" class="text-xs text-text-muted block">Az alakzat neve (pontosan)</label>
                                            <input [id]="'io-shape-name-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" maxlength="255" [ngModel]="o.shape?.name ?? ''"
                                              (ngModelChange)="setShapeManual(si, oi, { name: $event })" [ngModelOptions]="{ standalone: true }"
                                              [attr.data-testid]="'io-shape-name-' + si + '-' + oi" />
                                          </div>
                                        }
                                      }
                                      @if (pptHas(o, 'parts')) {
                                        <fieldset class="sm:col-span-2">
                                          <legend class="text-xs text-text-muted">Mit állítson alapra? (semmi bejelölve = mindent)</legend>
                                          <div class="flex flex-wrap gap-x-4 gap-y-1">
                                            @for (part of pptFontParts; track part.key) {
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
                                  } @else if (isEditing(si, oi) && isWord()) {
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + si + '-' + oi">
                                      <div class="sm:col-span-2">
                                        <label [for]="'io-op-' + si + '-' + oi" class="text-xs text-text-muted block">Művelet</label>
                                        <select [id]="'io-op-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="canonicalWord(o.op)"
                                          (ngModelChange)="changeWordKind(si, oi, $event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + si + '-' + oi">
                                          @for (n of wordOpNames; track n) { <option [ngValue]="n">{{ wordOpLabel(n) }}</option> }
                                        </select>
                                      </div>
                                      @if (wordHas(o, 'from')) {
                                        <div class="sm:col-span-2">
                                          <app-word-paragraph-picker [testId]="'io-from-' + si + '-' + oi" [anchor]="o.from"
                                            [label]="canonicalWord(o.op) === 'replaceText' ? 'Bekezdés' : canonicalWord(o.op) === 'removeHyperlinks' ? 'Első bekezdés (elhagyható = az egész dokumentum, élőfejjel, élőlábbal, jegyzetekkel együtt)' : 'Első bekezdés'"
                                            [optional]="canonicalWord(o.op) === 'removeHyperlinks'" clearLabel="Az egész dokumentum"
                                            [paragraphs]="paragraphs()" [unavailable]="paragraphsUnavailable()"
                                            (anchorChange)="setFrom(si, oi, $event)" />
                                        </div>
                                      }
                                      @if (wordHas(o, 'to') && canonicalWord(o.op) !== 'replaceText' && o.from) {
                                        <div class="sm:col-span-2">
                                          <app-word-paragraph-picker [testId]="'io-to-' + si + '-' + oi" [anchor]="o.to" label="Utolsó bekezdés (elhagyható = csak az első)"
                                            [optional]="true" clearLabel="Csak az első bekezdés" [minIndex]="o.from.index ?? 0"
                                            [paragraphs]="paragraphs()" [unavailable]="paragraphsUnavailable()"
                                            (anchorChange)="setUndo(si, oi, { to: $event })" />
                                        </div>
                                      }
                                      @if (wordHas(o, 'find')) {
                                        <div>
                                          <label [for]="'io-find-' + si + '-' + oi" class="text-xs text-text-muted block">A megoldásban álló szövegrész (pontosan)</label>
                                          <textarea [id]="'io-find-' + si + '-' + oi" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.find ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { find: $event })" [ngModelOptions]="{ standalone: true }"
                                            [attr.data-testid]="'io-find-' + si + '-' + oi"></textarea>
                                        </div>
                                        <div>
                                          <label [for]="'io-original-' + si + '-' + oi" class="text-xs text-text-muted block">Az eredeti szöveg (ezt kapja a diák; üres = törlés; sortörés megengedett, tabulátor nem)</label>
                                          <textarea [id]="'io-original-' + si + '-' + oi" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.original ?? ''"
                                            (ngModelChange)="setUndo(si, oi, { original: $event })" [ngModelOptions]="{ standalone: true }"
                                            [attr.data-testid]="'io-original-' + si + '-' + oi"></textarea>
                                        </div>
                                      }
                                      @if (wordHas(o, 'index')) {
                                        <div>
                                          <label [for]="'io-index-' + si + '-' + oi" class="text-xs text-text-muted block">A(z) {{ wordIndexOf(o) }} sorszáma a dokumentumban (1-től)</label>
                                          <input [id]="'io-index-' + si + '-' + oi" type="number" min="1" max="1000" class="input !px-2 !py-1 !text-sm"
                                            [ngModel]="o.index == null ? null : o.index + 1" (ngModelChange)="setChartNumber(si, oi, $event)"
                                            [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-index-' + si + '-' + oi" />
                                        </div>
                                      }
                                      @if (wordHas(o, 'section')) {
                                        <div>
                                          <label [for]="'io-section-' + si + '-' + oi" class="text-xs text-text-muted block">Szakasz</label>
                                          <select [id]="'io-section-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="o.section ?? null"
                                            (ngModelChange)="setUndo(si, oi, { section: $event })" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-section-' + si + '-' + oi">
                                            <option [ngValue]="null">minden szakasz</option>
                                            @for (n of sectionOptions(o); track n) { <option [ngValue]="n">{{ n + 1 }}. szakasz</option> }
                                          </select>
                                        </div>
                                      }
                                      @if (wordHas(o, 'field')) {
                                        <div>
                                          <label [for]="'io-field-' + si + '-' + oi" class="text-xs text-text-muted block">Mező</label>
                                          <select [id]="'io-field-' + si + '-' + oi" class="input !px-2 !py-1 !text-sm" [ngModel]="o.field ?? null"
                                            (ngModelChange)="setUndo(si, oi, { field: $event })" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-field-' + si + '-' + oi">
                                            <option [ngValue]="null" disabled>válassz…</option>
                                            @for (f of wordFields; track f.key) { <option [ngValue]="f.key">{{ f.key }} - {{ f.label }}</option> }
                                          </select>
                                        </div>
                                      }
                                      @if (wordHas(o, 'parts')) {
                                        <fieldset class="sm:col-span-2">
                                          <legend class="text-xs text-text-muted">Mit állítson vissza? (semmi bejelölve = mindent)</legend>
                                          <div class="flex flex-wrap gap-x-4 gap-y-1">
                                            @for (part of wordParts(o); track part.key) {
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
                                  } @else if (isEditing(si, oi)) {
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
                          @if (isWeb()) {
                            <div class="space-y-3" data-testid="io-web-preview">
                              <div class="flex flex-wrap items-center gap-2 text-sm">
                                <span id="io-web-width-label" class="font-medium">Szélesség:</span>
                                <div role="group" aria-labelledby="io-web-width-label" class="flex gap-1">
                                  <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" [attr.aria-pressed]="!webPhone()" (click)="webPhone.set(false)" data-testid="io-web-desktop">Asztali</button>
                                  <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" [attr.aria-pressed]="webPhone()" (click)="webPhone.set(true)" data-testid="io-web-phone">Telefon (390 px)</button>
                                </div>
                                <span class="text-text-muted">A szkriptek nem futnak, a külső (internetes) hivatkozások nem töltődnek be.</span>
                              </div>
                              @if (webPreview(); as wp) {
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                  @for (f of [{ id: 'solution', label: 'Megoldás', d: wp.solution }, { id: 'source', label: 'Kiinduló oldal', d: wp.source }]; track f.id) {
                                    <div class="min-w-0" [attr.data-testid]="'io-web-' + f.id">
                                      <h3 class="font-semibold text-sm mb-1">{{ f.label }}</h3>
                                      @if (f.d.html; as html) {
                                        <div class="overflow-x-auto">
                                          <iframe sandbox="" [srcdoc]="html" [title]="f.label + ' - élő előnézet'" class="h-[28rem] max-w-full rounded-lg border border-border-default bg-white"
                                            [style.width]="webPhone() ? '390px' : '100%'"></iframe>
                                        </div>
                                      } @else {
                                        <p class="text-sm text-text-muted">{{ f.d.error }}</p>
                                      }
                                    </div>
                                  }
                                </div>
                              } @else {
                                <p class="text-sm text-text-muted" role="status">Előnézet betöltése…</p>
                              }
                            </div>
                          } @else if (isGraphics()) {
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="io-graphics-preview">
                              @for (f of [{ id: 'source', label: 'Kiinduló kép', url: imagePreview()?.source }, { id: 'solution', label: 'Megoldás', url: imagePreview()?.solution }]; track f.id) {
                                <div class="min-w-0" [attr.data-testid]="'io-image-' + f.id">
                                  <h3 class="font-semibold text-sm mb-1">{{ f.label }}</h3>
                                  @if (f.url) {
                                    <img [src]="f.url" [alt]="f.label" class="max-w-full h-auto rounded-lg border border-border-default bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />
                                  } @else if (imagePreview()) {
                                    <p class="text-sm text-text-muted">A kép nem tölthető be - töltsd le.</p>
                                  } @else {
                                    <p class="text-sm text-text-muted" role="status">Betöltés…</p>
                                  }
                                </div>
                              }
                            </div>
                          } @else if (r.preview; as pv) {
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div class="min-w-0" data-testid="io-preview-source">
                                <h3 class="font-semibold text-sm mb-1">Kiinduló fájl</h3>
                                @for (img of pv.source; track $index) {
                                  @if (img) {
                                    <img [src]="img" [alt]="'Kiinduló fájl, ' + ($index + 1) + '. oldal'" class="w-full h-auto rounded-lg border border-border-default mb-2 bg-white" />
                                  } @else {
                                    <p class="aspect-video flex items-center justify-center text-center text-sm text-text-muted rounded-lg border border-dashed border-border-default mb-2 p-2"
                                      [attr.data-testid]="'io-preview-missing-source-' + $index">Ez a dia a kiinduló fájlban nincs meg (vagy rejtett).</p>
                                  }
                                } @empty { <p class="text-sm text-text-muted">Nincs oldalkép.</p> }
                              </div>
                              <div class="min-w-0" data-testid="io-preview-solution">
                                <h3 class="font-semibold text-sm mb-1">Megoldás</h3>
                                @for (img of pv.solution; track $index) {
                                  @if (img) {
                                    <img [src]="img" [alt]="'Megoldás, ' + ($index + 1) + '. oldal'" class="w-full h-auto rounded-lg border border-border-default mb-2 bg-white" />
                                  } @else {
                                    <p class="aspect-video flex items-center justify-center text-center text-sm text-text-muted rounded-lg border border-dashed border-border-default mb-2 p-2"
                                      [attr.data-testid]="'io-preview-missing-solution-' + $index">Ez a dia a megoldásban nincs meg (vagy rejtett - vetítéskor nem látszik).</p>
                                  }
                                } @empty { <p class="text-sm text-text-muted">Nincs oldalkép.</p> }
                              </div>
                            </div>
                          } @else {
                            <p class="text-sm text-text-muted" data-testid="io-preview-unavailable">
                              @if (isWeb()) {
                                Weblaphoz nincs oldalképes előnézet.
                              } @else {
                                Az oldalképes előnézet most nem érhető el (a fájl-átalakító nem válaszolt). Töltsd le a két fájlt, és nézd meg {{ isWord() ? 'Wordben' : isPpt() ? 'PowerPointban' : 'Excelben' }}.
                              }
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
                          @if (!r.recalculated && kind() === 'excel') {
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
              @if (lastSaved(); as ls) {
                <div class="bg-success-subtle border border-success/40 rounded-xl p-3 text-sm text-success flex flex-wrap items-center gap-2" role="status" data-testid="io-last-saved">
                  <app-icon name="check" class="w-5 h-5 block shrink-0" />
                  <span class="flex-1 min-w-0 break-words">Az előző generálás mentve: <span class="font-semibold">{{ ls.title }}</span></span>
                  <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="openTask.emit(ls.taskId)" data-testid="io-last-saved-open">Ugrás a feladathoz</button>
                </div>
                <h3 class="font-semibold text-sm">Új generálás</h3>
              }
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
                Töltsd fel a kész, megoldott munkafüzetet, dokumentumot, bemutatót vagy weblapot. Az AI érettségi stílusban megírja a feladatot és a részfeladatokat pontokkal, a rendszer a
                megoldásból „visszacsinálja” a kiinduló fájlt, és szempontlistát készít gépi szabályokkal. Mentés előtt mindent átnézhetsz és módosíthatsz.
              </p>

              <div>
                <label for="io-file" class="text-sm font-medium block mb-1">Megoldott fájl: Excel-munkafüzet (.xlsx), Word-dokumentum (.docx), PowerPoint-bemutató (.pptx), weblap (.zip a HTML-, CSS- és képfájlokkal, vagy egyetlen .html) vagy kép (.png, .jpg, .gif, .svg), legfeljebb 20 MB</label>
                <input id="io-file" type="file" accept=".xlsx,.docx,.pptx,.zip,.html,.png,.jpg,.jpeg,.gif,.svg" class="text-sm max-w-full" (change)="pickFile($event)" data-testid="io-file" />
                @if (fileError()) {
                  <p class="text-sm text-danger mt-1" role="alert" data-testid="io-file-error">{{ fileError() }}</p>
                } @else if (file()) {
                  <p class="text-sm text-text-muted mt-1" data-testid="io-file-kind">Felismert fájltípus: {{ kindDescription() }}</p>
                }
              </div>

              @if (isGraphics()) {
                <div>
                  <label for="io-source-file" class="text-sm font-medium block mb-1">Kiinduló kép (ezt kapja a diák - grafikánál nincs visszacsinálás): .png, .jpg, .gif vagy .svg, legfeljebb 20 MB</label>
                  <input id="io-source-file" type="file" accept=".png,.jpg,.jpeg,.gif,.svg" class="text-sm max-w-full" (change)="pickSourceFile($event)" data-testid="io-source-file" />
                  @if (sourceFileError()) {
                    <p class="text-sm text-danger mt-1" role="alert" data-testid="io-source-file-error">{{ sourceFileError() }}</p>
                  }
                </div>
              }

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
  /** A megnyitó blokk fajtája (Táblázatkezelés → Excel, Szövegszerkesztés → Word, Prezentáció → PowerPoint…) - amíg nincs fájl / job, ez látszik a címben. */
  readonly kindHint = input<OfficeFileKind>('excel');
  readonly closed = output<void>();
  /** Sikeres mentés után az új feladat azonosítójával - a szerkesztő újratölt és kinyitja. */
  readonly saved = output<number>();
  /** Sikeres mentés után a feladat azonosítója és címe - a szerkesztő megjegyzi, és újranyitáskor visszaadja (lastSaved). */
  readonly savedTask = output<{ taskId: number; title: string }>();
  /** Az ezen a feladatsoron legutóbb mentett feladat (a mentett job a jobs/active-ban már nem szerepel) - újranyitáskor jelezzük. */
  readonly lastSaved = input<{ taskId: number; title: string } | null>(null);
  /** „Ugrás a feladathoz”: a szerkesztő bezárja az ablakot, és a feladathoz görget. */
  readonly openTask = output<number>();

  readonly tabs = TABS;
  readonly levels: { value: OfficeTaskLevel; label: string }[] = [
    { value: 'kozep', label: 'Középszint' },
    { value: 'emelt', label: 'Emelt szint' },
  ];
  readonly subtaskCounts = [3, 4, 5, 6, 7, 8];
  readonly opNames = EXCEL_UNDO_OP_NAMES;
  readonly wordOpNames = WORD_UNDO_OP_NAMES;
  readonly wordFields = WORD_FIELDS;
  readonly webOpNames = WEB_UNDO_OP_NAMES;
  readonly pptOpNames = PPT_UNDO_OP_NAMES;
  readonly pptFontParts = PPT_FONT_PARTS;
  readonly maxReplace = MAX_REPLACE;
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
  /** Grafika: a tanár saját kiinduló képe (már az indításkor kell). */
  readonly sourceFile = signal<File | null>(null);
  readonly sourceFileError = signal<string | null>(null);
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
      (!this.isGraphics() || (!!this.sourceFile() && !this.sourceFileError())) &&
      this.notesInput().length <= MAX_NOTES,
  );

  // ── Készítés ──
  readonly jobId = signal<number | null>(null);
  readonly jobFileName = signal<string | null>(null);
  readonly progressText = signal<string | null>(null);
  readonly pollError = signal<string | null>(null);
  /** A job fajtája (a szerver mondja; ez dönti el a szókészletet). */
  private readonly jobKind = signal<OfficeFileKind | null>(null);
  /** Job → a kiválasztott fájl → a megnyitó blokk. */
  readonly kind = computed<OfficeFileKind>(() => {
    const file = this.file();
    return this.jobKind() ?? (file && officeFileKind(file)) ?? this.kindHint();
  });
  readonly isWord = computed(() => this.kind() === 'word');
  readonly isWeb = computed(() => this.kind() === 'web');
  readonly isGraphics = computed(() => this.kind() === 'graphics');
  readonly isPpt = computed(() => this.kind() === 'powerpoint');
  readonly kindLabel = computed(() => KIND_LABEL[this.kind()]);
  readonly kindIcon = computed(() => KIND_ICON[this.kind()]);
  readonly extension = computed(() => EXTENSION[this.kind()]);
  readonly accept = computed(() => ACCEPT[this.kind()]);
  readonly kindDescription = computed(
    () =>
      ({
        excel: 'Excel-munkafüzet - táblázatkezelési feladat',
        word: 'Word-dokumentum - szövegszerkesztési feladat',
        powerpoint: 'PowerPoint-bemutató - prezentációkészítési feladat',
        web: 'weblap - weblapkészítési (HTML/CSS) feladat',
        graphics: 'kép - képszerkesztési / rajzolási (grafika) feladat',
      })[this.kind()],
  );

  private startSub: Subscription | null = null;
  private polling: Subscription | null = null;

  // ── Előnézet ──
  private readonly generated = signal<OfficeTaskResultDto | null>(null);
  readonly proposal = signal<OfficeTaskProposal | null>(null);
  /** Az utoljára ellenőrzött, szerver által normalizált változat - mentéskor PONTOSAN ez megy. */
  private readonly validated = signal<OfficeTaskProposal | null>(null);
  readonly report = signal<OfficeTaskReport | null>(null);
  readonly notes = computed(() => this.generated()?.notes ?? null);
  /** Word: a megoldás bekezdései a horgony-választóhoz (a generálás eredményéből; korlát felett / hiányában csak kézi megadás). */
  readonly paragraphs = computed(() => {
    const result = this.generated();
    return result?.paragraphs?.length && !result.paragraphsCapped ? result.paragraphs : null;
  });
  readonly paragraphsUnavailable = computed(() => {
    const result = this.generated();
    if (!result || this.paragraphs()) return null;
    return result.paragraphsCapped
      ? 'A dokumentum túl sok bekezdésből áll a listához - add meg kézzel a sorszámot és a szöveg elejét.'
      : 'A megoldás bekezdéseinek listája nem érhető el - add meg kézzel a sorszámot és a szöveg elejét.';
  });
  /** Weblap: a megoldás HTML-elemei az elem-választóhoz és a csomag fájljai. */
  private readonly webElements = computed(() => this.generated()?.elements ?? []);
  private readonly webFileNames = computed(() => this.generated()?.files ?? []);
  /** PowerPoint: a megoldás alakzatai az alakzat-választóhoz és a diák száma. */
  private readonly slideShapes = computed(() => this.generated()?.shapes ?? []);
  private readonly slideCount = computed(() => this.generated()?.slideCount ?? 0);
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

  readonly webPhone = signal(false);
  readonly webPreview = signal<{ solution: WebFrame; source: WebFrame } | null>(null);
  private webUrls: string[] = [];
  private readonly sanitizer = inject(DomSanitizer);
  private webPreviewSub: Subscription | null = null;
  /** Melyik ellenőrzés (jelentés) fájljaiból készült az előnézet - újraellenőrzés után (pl. új kiinduló kép) újratöltődik. */
  private previewOf: OfficeTaskReport | null = null;
  /** Grafika: a két kép blob-URL-je (a jogosult letöltésből; az SVG is <img>-ként, így szkript nem fut); null = hiba. */
  readonly imagePreview = signal<{ solution: string | null; source: string | null } | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.releaseWebPreview());
    effect(() => {
      const report = this.report();
      if (this.step() === 'preview' && this.tab() === 'elonezet' && (this.isWeb() || this.isGraphics()))
        untracked(() => (this.isGraphics() ? this.loadImagePreview(report) : this.loadWebPreview(report)));
    });
  }

  private releaseWebPreview(): void {
    this.webPreviewSub?.unsubscribe();
    this.webUrls.forEach((u) => URL.revokeObjectURL(u));
    this.webUrls = [];
    this.webPreview.set(null);
    this.imagePreview.set(null);
    this.previewOf = null;
  }

  private loadImagePreview(report: OfficeTaskReport | null): void {
    const jobId = this.jobId();
    if (jobId == null || this.previewOf === report) return;
    this.releaseWebPreview();
    this.previewOf = report;
    const image = (kind: OfficeTaskFileKind) =>
      this.service.downloadFile(this.taskSetId(), jobId, kind).pipe(
        map((blob) => {
          const url = URL.createObjectURL(blob);
          this.webUrls.push(url);
          return url as string | null;
        }),
        catchError(() => of(null)),
      );
    this.webPreviewSub = forkJoin({ solution: image('solution'), source: image('source') })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.imagePreview.set(v));
  }

  private loadWebPreview(report: OfficeTaskReport | null): void {
    const jobId = this.jobId();
    if (jobId == null || this.previewOf === report) return;
    this.releaseWebPreview();
    this.previewOf = report;
    const frame = (kind: OfficeTaskFileKind) =>
      this.service.downloadFile(this.taskSetId(), jobId, kind).pipe(
        switchMap((blob) => from(webPreviewFromBlob(blob))),
        map((p): WebFrame => {
          this.webUrls.push(...p.urls);
          // Biztonságos: a sandbox="" iframe-ben nem fut szkript, és nincs same-origin.
          return { html: this.sanitizer.bypassSecurityTrustHtml(p.srcdoc), error: null };
        }),
        catchError(() => of<WebFrame>({ html: null, error: 'Az előnézet nem készíthető el - töltsd le a csomagot.' })),
      );
    this.webPreviewSub = forkJoin({ solution: frame('solution'), source: frame('source') })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.webPreview.set(v));
  }

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
        const err = validateUndoOp(o, this.kind());
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
    if (p.sourceMode === 'own' && !this.pendingOwnSource() && !this.hasOwnSource()) errors.push(`Saját kiinduló fájlhoz tölts fel egy ${this.extension()} fájlt.`);
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
    const source = this.sourceFile();
    if (source && this.isGraphics()) this.sourceFileError.set(this.sourceProblem(source));
  }

  private sourceProblem(source: File): string | null {
    const own = this.fileProblem(source, 'graphics');
    if (own) return own;
    return (this.file()?.size ?? 0) + source.size > MAX_GRAPHICS_TOTAL_BYTES ? GRAPHICS_TOTAL_MESSAGE : null;
  }

  /** `sameKindAs`: a saját kiinduló fájl a megoldással azonos fajtájú legyen. */
  private fileProblem(file: File, sameKindAs?: OfficeFileKind): string | null {
    const kind = officeFileKind(file);
    if (!kind) return 'Csak Excel-munkafüzet (.xlsx), Word-dokumentum (.docx), PowerPoint-bemutató (.pptx), weblap (.zip / .html) vagy kép (.png / .jpg / .gif / .svg) tölthető fel.';
    if (sameKindAs && kind !== sameKindAs)
      return sameKindAs === 'web'
        ? 'A saját kiinduló fájl is weblap legyen (.zip vagy .html).'
        : sameKindAs === 'graphics'
          ? 'A kiinduló fájl is kép legyen (.png / .jpg / .gif / .svg).'
          : `A saját kiinduló fájl is ${EXTENSION[sameKindAs]} legyen (mint a megoldás).`;
    if (file.size === 0) return 'A fájl üres.';
    if (file.size > MAX_FILE_BYTES) return 'A fájl túl nagy (legfeljebb 20 MB).';
    return null;
  }

  pickSourceFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.sourceFile.set(file);
    this.sourceFileError.set(file ? this.sourceProblem(file) : null);
  }

  start(): void {
    const file = this.file();
    if (!this.canStart() || !file) return;
    this.starting.set(true);
    this.startError.set(null);
    const sourceFile = this.isGraphics() ? this.sourceFile() : null;
    this.startSub = this.service
      .startJob(this.taskSetId(), { file, level: this.level(), subtaskCount: this.subtaskCount(), notes: this.notesInput().trim() || null, ...(sourceFile ? { sourceFile } : {}) })
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
    this.jobKind.set(KINDS.includes(job.fileKind) ? job.fileKind : 'excel');
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
    this.jobKind.set(null);
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
    this.releaseWebPreview();
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

  changeWordKind(si: number, oi: number, next: WordUndoOpName): void {
    this.updateSubtask(si, (s) => ({ ...s, undo: s.undo.map((o, j) => (j === oi ? changeWordUndoOpKind(o, next) : o)) }));
  }

  /** A „from” törlésével (removeHyperlinks: az egész dokumentum) a „to” is megszűnik. */
  setFrom(si: number, oi: number, anchor: OfficeParagraphAnchor | null): void {
    this.setUndo(si, oi, anchor ? { from: anchor } : { from: null, to: null });
  }

  /** Horgony-eltérésnél (szerver) a bekezdés valódi szövegének eleje kerül a horgonyba. */
  fixAnchor(si: number, oi: number): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    const mm = op && parseAnchorMismatch(op.message);
    if (!op || !mm) return;
    const anchor = { index: mm.index, startsWith: this.paragraphs()?.find((p) => p.index === mm.index)?.text ?? mm.actual };
    this.setUndo(si, oi, mm.which === 'from' ? { from: anchor } : { to: anchor });
  }

  /** A diagram / táblázat / rajz / szakasztörés sorszáma a felületen 1-től, a szerződésben 0-alapú index. */
  setChartNumber(si: number, oi: number, value: unknown): void {
    const n = this.toInt(value);
    this.setUndo(si, oi, { index: Number.isNaN(n) ? null : n - 1 });
  }

  togglePart(si: number, oi: number, part: string): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (!op) return;
    const current = new Set(op.parts ?? []);
    if (current.has(part)) current.delete(part);
    else current.add(part);
    const order = (this.isWord() ? this.wordParts(op) : this.isPpt() ? PPT_FONT_PARTS : STYLE_PARTS).map((p) => p.key);
    const parts = order.filter((k) => current.has(k));
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
    const op = this.isWeb()
      ? newWebUndoOp('removeCssRule', this.webFileNames().find(isCssFile) ?? this.webFileNames().find(isHtmlFile) ?? null)
      : this.isPpt()
        ? newPptUndoOp('removeShape', s.undo.find((o) => o.slide != null)?.slide ?? 1)
      : this.isWord()
        ? newWordUndoOp('clearRunFormatting')
        : newUndoOp('clearFormulas', sheet);
    this.updateSubtask(si, (st) => ({ ...st, undo: [...st.undo, op] }));
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
    const problem = this.fileProblem(file, this.kind());
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
        this.savedTask.emit({ taskId: res.taskId, title: proposal.title });
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
    if (e?.status === 413) return this.isGraphics() ? GRAPHICS_TOTAL_MESSAGE : 'A fájl túl nagy (legfeljebb 20 MB).';
    return extractErrorMessage(err, fallback);
  }

  // ── Megjelenítés ──
  describe(op: OfficeUndoOp): string {
    return describeUndoOp(op, this.kind());
  }

  canonicalWeb(op: string): WebUndoOpName | null {
    return canonicalWebOp(op);
  }

  webOpLabel(name: WebUndoOpName): string {
    return WEB_UNDO_OPS[name].label;
  }

  webHas(op: OfficeUndoOp, field: 'selector' | 'property' | 'media' | 'element' | 'attribute' | 'find' | 'original'): boolean {
    return !!webOpSpec(op.op)?.fields.includes(field);
  }

  changeWebKind(si: number, oi: number, next: WebUndoOpName): void {
    this.updateSubtask(si, (s) => ({ ...s, undo: s.undo.map((o, j) => (j === oi ? changeWebUndoOpKind(o, next) : o)) }));
  }

  /** A művelethez választható fájlok: elem-művelethez a HTML-ek, CSS-hez és fájl-elhagyáshoz a HTML-ek és a stíluslapok (+ a művelet saját fájlja). */
  webFiles(op: OfficeUndoOp): string[] {
    const htmlOnly = webOpSpec(op.op)?.on === 'html';
    const files = this.webFileNames().filter((f) => isHtmlFile(f) || (!htmlOnly && isCssFile(f)));
    return op.file && !files.includes(op.file) ? [...files, op.file] : files;
  }

  /** Fájlváltáskor az elem-horgony törlődik (a sorszám fájlon belüli). */
  setWebFile(si: number, oi: number, file: string): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (!op) return;
    this.setUndo(si, oi, op.element ? { file, element: { index: null, tag: null } } : { file });
  }

  elementOptions(file: string | null | undefined): OfficeWebElement[] {
    return file ? this.webElements().filter((e) => e.file === file) : [];
  }

  elementLabel(e: OfficeWebElement): string {
    const name = e.tag + (e.id ? `#${e.id}` : '') + (e.class ? '.' + e.class.trim().split(/\s+/).join('.') : '');
    const detail = e.text ? ` „${e.text}”` : e.attributes ? ` ${e.attributes}` : '';
    return `${'\u00a0\u00a0'.repeat(Math.min(e.depth, 8))}[${e.index + 1}] <${name}>${detail}`;
  }

  /** Az elem a listából: a címke a megoldás szerinti. */
  setElement(si: number, oi: number, index: number | null): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    const el = op && this.elementOptions(op.file).find((e) => e.index === index);
    this.setUndo(si, oi, { element: el ? { index: el.index, tag: el.tag } : { index: null, tag: null } });
  }

  /** Kézi megadás (nincs lista): a sorszám a felületen 1-től. */
  setElementManual(si: number, oi: number, patch: { index?: unknown; tag?: string }): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (!op) return;
    const current = op.element ?? { index: null, tag: null };
    const n = patch.index === undefined ? null : this.toInt(patch.index);
    this.setUndo(si, oi, {
      element: {
        index: patch.index === undefined ? current.index : Number.isNaN(n!) ? null : n! - 1,
        tag: patch.tag === undefined ? current.tag : patch.tag,
      },
    });
  }

  elementMismatch(op: OfficeUndoOp) {
    return op.result === 'error' ? parseElementMismatch(op.message) : null;
  }

  /** Elem-eltérésnél (szerver) a valódi címke kerül a horgonyba. */
  fixElement(si: number, oi: number): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    const em = op && parseElementMismatch(op.message);
    if (!op || !em) return;
    this.setUndo(si, oi, { element: { index: em.index, tag: em.tag } });
  }

  canonicalPpt(op: string): PptUndoOpName | null {
    return canonicalPptOp(op);
  }

  pptOpLabel(name: PptUndoOpName): string {
    return PPT_UNDO_OPS[name].label;
  }

  pptSpec(op: OfficeUndoOp) {
    return pptOpSpec(op.op);
  }

  pptHas(op: OfficeUndoOp, field: 'shape' | 'parts'): boolean {
    return !!pptOpSpec(op.op)?.fields.includes(field);
  }

  changePptKind(si: number, oi: number, next: PptUndoOpName): void {
    this.updateSubtask(si, (s) => ({ ...s, undo: s.undo.map((o, j) => (j === oi ? changePptUndoOpKind(o, next) : o)) }));
  }

  /** A választható diák (1-től; és a művelet saját, nagyobb sorszáma, ha van). */
  slideOptions(op: OfficeUndoOp): number[] {
    const count = Math.max(this.slideCount(), op.slide ?? 0);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  /** Diaváltáskor az alakzat törlődik (az azonosító dián belüli). */
  setSlide(si: number, oi: number, slide: number | null): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (!op) return;
    this.setUndo(si, oi, op.slide === slide ? {} : { slide, shape: null });
  }

  shapeOptions(slide: number | null | undefined): OfficeSlideShape[] {
    return slide == null ? [] : this.slideShapes().filter((s) => s.slide === slide);
  }

  shapeLabel(s: OfficeSlideShape): string {
    return `#${s.id} „${s.name}” (${s.kind})${s.text ? ` - ${s.text}` : ''}`;
  }

  /** Az alakzat a listából: a név a megoldás szerinti. */
  setShape(si: number, oi: number, id: number | null): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    const shape = op && this.shapeOptions(op.slide).find((s) => s.id === id);
    this.setUndo(si, oi, { shape: shape ? { id: shape.id, name: shape.name } : null });
  }

  /** Kézi megadás (nincs lista). */
  setShapeManual(si: number, oi: number, patch: { id?: unknown; name?: string }): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    if (!op) return;
    const current = op.shape ?? { id: null, name: null };
    const n = patch.id === undefined ? null : this.toInt(patch.id);
    this.setUndo(si, oi, {
      shape: { id: patch.id === undefined ? current.id : Number.isNaN(n!) ? null : n, name: patch.name === undefined ? current.name : patch.name },
    });
  }

  shapeMismatch(op: OfficeUndoOp) {
    return op.result === 'error' ? parseShapeMismatch(op.message) : null;
  }

  /** Alakzat-eltérésnél (szerver) a valódi név kerül a horgonyba. */
  fixShape(si: number, oi: number): void {
    const op = this.proposal()?.subtasks[si]?.undo[oi];
    const sm = op && parseShapeMismatch(op.message);
    if (!op || !sm) return;
    this.setUndo(si, oi, { shape: { id: sm.id, name: sm.name } });
  }

  canonicalWord(op: string): WordUndoOpName | null {
    return canonicalWordOp(op);
  }

  wordOpLabel(name: WordUndoOpName): string {
    return WORD_UNDO_OPS[name].label;
  }

  wordHas(op: OfficeUndoOp, field: 'from' | 'to' | 'parts' | 'index' | 'section' | 'field' | 'find' | 'original'): boolean {
    return !!wordOpSpec(op.op)?.fields.includes(field);
  }

  wordIndexOf(op: OfficeUndoOp): string {
    return wordOpSpec(op.op)?.indexOf ?? 'elem';
  }

  wordParts(op: OfficeUndoOp): { key: string; label: string }[] {
    const name = canonicalWordOp(op.op);
    return (name && WORD_PARTS[name]) || [];
  }

  /** 0-9. szakasz (a felületen 1-10.; és a művelet saját, nagyobb sorszáma, ha van). */
  sectionOptions(op: OfficeUndoOp): number[] {
    const count = Math.max(10, (op.section ?? 0) + 1);
    return Array.from({ length: count }, (_, i) => i);
  }

  mismatch(op: OfficeUndoOp) {
    return op.result === 'error' ? parseAnchorMismatch(op.message) : null;
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
