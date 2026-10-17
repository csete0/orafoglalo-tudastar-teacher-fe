import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { defer, repeat, retry, Subscription, takeWhile, throwError, timer } from 'rxjs';
import {
  AiCodeTaskJobDto,
  AiCodeTaskLanguage,
  AiCodeTaskLevel,
  AiCodeTaskMode,
  AiCodeTaskProposal,
  AiCodeTaskQuotaDto,
  AiCodeTaskReport,
  AiCodeTaskResultDto,
  AiLanguageReport,
  AiProposalSubtask,
  AiSectionReport,
} from '../../models/ai-code-task.model';
import { TeacherTaskDto } from '../../models/teacher-content.model';
import { TeacherAiCodeTaskService } from '../../services/teacher-ai-code-task/teacher-ai-code-task.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { saveBlob } from '../../shared/save-blob.util';

/** Az állapot-lekérdezés gyakorisága (ms). */
export const POLL_MS = 2000;
/** A BE-vel azonos korlátok. */
const MAX_TOPIC = 200;
const MAX_IDEA = 2000;
const MAX_DATA_FILE_BYTES = 1024 * 1024;
const MAX_SUBTASKS = 12;
/** Az adatfájl előnézetében ennyi sor látszik. */
const PREVIEW_LINES = 40;

const ACTIVE_STATUSES = new Set(['queued', 'generating', 'running']);

export const LANGUAGE_OPTIONS: { key: AiCodeTaskLanguage; name: string; platformId: number }[] = [
  { key: 'python', name: 'Python', platformId: 2 },
  { key: 'csharp', name: 'C#', platformId: 5 },
  { key: 'java', name: 'Java', platformId: 10 },
  { key: 'cpp', name: 'C++', platformId: 8 },
];

export const PREMIUM_REQUIRED_MESSAGE =
  'Az AI programozási feladat csak prémium előfizetéssel érhető el. Prémium előfizetéssel havonta 30 feladatot készíthetsz vagy egészíthetsz ki.';

type Step = 'input' | 'running' | 'preview';
type Tab = 'feladat' | 'adatfajl' | 'megoldas' | 'ellenorzes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'feladat', label: 'Feladat' },
  { id: 'adatfajl', label: 'Adatfájl' },
  { id: 'megoldas', label: 'Mintamegoldás' },
  { id: 'ellenorzes', label: 'Ellenőrzés' },
];

const SECTION_STATUS: Record<AiSectionReport['status'], { ok: boolean; label: string }> = {
  ok: { ok: true, label: 'rendben' },
  format: { ok: true, label: 'csak formában tér el a Pythonétól' },
  missing: { ok: false, label: 'nincs kimenet' },
  mismatch: { ok: false, label: 'eltér a Python-megoldásétól' },
};

const LANGUAGE_STATUS: Record<AiLanguageReport['status'], { label: string; badge: string }> = {
  ok: { label: 'lefutott', badge: 'badge-success' },
  error: { label: 'hiba', badge: 'badge-danger' },
  mismatch: { label: 'eltérés', badge: 'badge-danger' },
  skipped: { label: 'nem futott', badge: 'badge-neutral' },
};

const sameProposal = (a: AiCodeTaskProposal | null, b: AiCodeTaskProposal | null) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * „AI programozási feladat” párbeszédablak a feladatsor-szerkesztőben (terv: PATRICKS-AI-PROGRAMOZASI-FELADAT-TERV.md).
 * 1. mód („complete”): egy meglévő programozási feladat hiányzó részei; 2. mód („new”): teljes új feladat.
 * Lépések: kérés → háttérben futó generálás (2 mp-enkénti állapot-lekérdezés) → szerkeszthető előnézet a Judge0-s ellenőrzéssel
 * → bármilyen módosítás után Újraellenőrzés (MI nélkül) → Mentés (a szerver által normalizált, utoljára ellenőrzött változat).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-feladat',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <div class="absolute inset-0 bg-black/40" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="ai-task-title" tabindex="-1" data-testid="ai-task-dialog"
        class="card relative w-full max-w-4xl p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none min-w-0">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary shrink-0"><app-icon name="sparkles" class="w-5 h-5 block" /></div>
            <div class="min-w-0">
              <h2 id="ai-task-title" class="font-bold text-lg">{{ mode() === 'complete' ? 'Feladat kiegészítése AI-val' : 'Új programozási feladat AI-val' }}</h2>
              @if (mode() === 'complete' && taskTitle()) {
                <p class="text-sm text-text-muted truncate">{{ taskTitle() }}</p>
              }
            </div>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="ai-task-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        @switch (step()) {
          @case ('running') {
            <!-- ── 2. Készítés a háttérben ───────────────── -->
            <div class="space-y-3" data-testid="ai-task-running">
              <div role="status" aria-live="polite">
                <app-local-spinner [label]="progressText() || 'Indítás…'" />
              </div>
              <p class="text-sm text-text-muted text-center">
                Az AI megírja a hiányzó részeket, majd a rendszer lefuttatja őket a futtatón. Ez néhány percig is tarthat.
                Ha bezárod az ablakot, a készítés a háttérben folytatódik, és a gombbal később újra megnyithatod.
              </p>
              @if (pollError()) {
                <p class="text-sm text-danger text-center" role="alert" data-testid="ai-task-poll-error">{{ pollError() }}</p>
              }
              <div class="flex justify-center">
                <button type="button" class="btn btn-ghost" (click)="close()">Bezárás</button>
              </div>
            </div>
          }
          @case ('preview') {
            @if (report(); as r) {
              <!-- ── 3. Előnézet ─────────────────────────── -->
              <div class="space-y-4 min-w-0" data-testid="ai-task-preview">
                @switch (r.status) {
                  @case ('ok') {
                    <p class="bg-success-subtle border border-success/40 rounded-xl p-3 text-sm text-success flex items-start gap-2" data-testid="ai-task-valid">
                      <app-icon name="check" class="w-5 h-5 block shrink-0" />
                      <span>A mintamegoldás lefutott a futtatón, és minden részfeladat ad kimenetet. Nézd át a füleket, mentés előtt bármit módosíthatsz.</span>
                    </p>
                  }
                  @case ('unavailable') {
                    <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="ai-task-unavailable">
                      <p>A futtató most nem érhető el, így az ellenőrzés elmaradt - próbáld újra az Újraellenőrzéssel.</p>
                      @for (e of r.errors; track $index) { <span class="block text-xs mt-1">{{ e }}</span> }
                    </div>
                  }
                  @default {
                    <div class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" data-testid="ai-task-invalid">
                      <p class="font-semibold mb-1">Az ellenőrzés hibát talált - így nem menthető. Javítsd a füleken, majd ellenőrizd újra:</p>
                      <ul class="list-disc pl-5 space-y-0.5 break-words">
                        @for (e of r.errors; track $index) { <li>{{ e }}</li> }
                      </ul>
                    </div>
                  }
                }

                @if (notes()) {
                  <p class="text-sm text-text-muted break-words"><span class="font-medium">Az AI megjegyzése:</span> {{ notes() }}</p>
                }

                <div role="tablist" aria-label="Az elkészült feladat részei" class="flex gap-1 overflow-x-auto border-b border-border-default -mx-1 px-1">
                  @for (t of tabs; track t.id; let i = $index) {
                    <button type="button" role="tab" [id]="'ai-task-tab-' + t.id" [attr.aria-selected]="tab() === t.id"
                      [attr.aria-controls]="'ai-task-panel-' + t.id" [attr.tabindex]="tab() === t.id ? 0 : -1"
                      (click)="tab.set(t.id)" (keydown)="onTabKey($event, i)" [attr.data-testid]="'ai-task-tab-' + t.id"
                      class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px"
                      [class.border-primary]="tab() === t.id" [class.text-primary]="tab() === t.id" [class.font-semibold]="tab() === t.id"
                      [class.border-transparent]="tab() !== t.id" [class.text-text-muted]="tab() !== t.id">
                      {{ t.label }}
                      @if (t.id === 'ellenorzes') {
                        @if (r.status === 'ok') { <span class="text-success" aria-hidden="true">✔</span> }
                        @else if (r.status === 'failed') { <span class="text-danger" aria-hidden="true">✘</span> }
                        @if (r.warnings.length > 0) { <span class="badge badge-warning ml-1">{{ r.warnings.length }}</span> }
                      }
                    </button>
                  }
                </div>

                @if (proposal(); as p) {
                  <div role="tabpanel" [id]="'ai-task-panel-' + tab()" [attr.aria-labelledby]="'ai-task-tab-' + tab()" class="min-w-0">
                    @switch (tab()) {
                      @case ('feladat') {
                        <div class="space-y-3" data-testid="ai-task-panel-feladat">
                          @if (mode() === 'new') {
                            <div>
                              <label for="ai-task-p-title" class="text-sm font-medium block mb-1">Cím</label>
                              <input id="ai-task-p-title" class="input !px-2 !py-1" maxlength="200" [ngModel]="p.title ?? ''"
                                (ngModelChange)="setField('title', $event)" [ngModelOptions]="{ standalone: true }" data-testid="ai-task-p-title" />
                            </div>
                            <div>
                              <label for="ai-task-p-description" class="text-sm font-medium block mb-1">Leírás</label>
                              <textarea id="ai-task-p-description" rows="10" class="input !px-2 !py-1 !text-sm" [ngModel]="p.description ?? ''"
                                (ngModelChange)="setField('description', $event)" [ngModelOptions]="{ standalone: true }" data-testid="ai-task-p-description"></textarea>
                            </div>
                          } @else {
                            <p class="text-sm text-text-muted">A feladat leírása és a meglévő részfeladatok a tieid, ezeket itt nem lehet módosítani - csak a hiányzó pontokat.</p>
                          }

                          <div class="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 class="font-semibold text-sm">Részfeladatok</h3>
                            <span class="text-xs text-text-muted">Összesen {{ pointsSum() }} pont</span>
                          </div>
                          @for (s of p.subtasks; track $index; let i = $index) {
                            <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'ai-task-subtask-' + i">
                              <div class="flex flex-wrap items-end gap-2">
                                <div class="w-24">
                                  <label [for]="'ai-task-st-label-' + i" class="text-xs text-text-muted block">Címke</label>
                                  <input [id]="'ai-task-st-label-' + i" class="input !bg-bg-panel !px-2 !py-1" maxlength="50" [readOnly]="s.existing"
                                    [ngModel]="s.label" (ngModelChange)="setSubtask(i, { label: $event })" [ngModelOptions]="{ standalone: true }" />
                                </div>
                                <div class="w-24">
                                  <label [for]="'ai-task-st-points-' + i" class="text-xs text-text-muted block">Pont</label>
                                  <input [id]="'ai-task-st-points-' + i" type="number" min="0" max="1000" class="input !bg-bg-panel !px-2 !py-1" [readOnly]="s.pointsExisting"
                                    [ngModel]="s.points" (ngModelChange)="setSubtask(i, { points: toPoints($event) })" [ngModelOptions]="{ standalone: true }"
                                    [attr.data-testid]="'ai-task-st-points-' + i" />
                                </div>
                                @if (s.existing) { <span class="badge badge-neutral">a tiéd</span> }
                                @if (mode() === 'new' && p.subtasks.length > 1) {
                                  <button type="button" class="ml-auto text-sm text-danger hover:underline" (click)="removeSubtask(i)"
                                    [attr.aria-label]="(s.label || (i + 1) + '.') + ' részfeladat törlése'">Törlés</button>
                                }
                              </div>
                              <div>
                                <label [for]="'ai-task-st-text-' + i" class="text-xs text-text-muted block">Szöveg</label>
                                <textarea [id]="'ai-task-st-text-' + i" rows="3" class="input !bg-bg-panel !px-2 !py-1 !text-sm" [readOnly]="s.existing"
                                  [ngModel]="s.text" (ngModelChange)="setSubtask(i, { text: $event })" [ngModelOptions]="{ standalone: true }"
                                  [attr.data-testid]="'ai-task-st-text-' + i"></textarea>
                              </div>
                            </div>
                          }
                          @if (mode() === 'new' && p.subtasks.length < maxSubtasks) {
                            <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="addSubtask()" data-testid="ai-task-add-subtask">Részfeladat hozzáadása</button>
                          }
                        </div>
                      }
                      @case ('adatfajl') {
                        <div class="space-y-3" data-testid="ai-task-panel-adatfajl">
                          @if (p.existingInputFiles.length > 0) {
                            <p class="text-sm">
                              A feladat meglévő bemeneti fájljai (ezekkel fut a megoldás):
                              @for (f of p.existingInputFiles; track f; let last = $last) { <span class="font-mono">{{ f }}</span>{{ last ? '' : ', ' }} }
                            </p>
                          }
                          @if (p.dataFile; as df) {
                            <div>
                              <label for="ai-task-df-name" class="text-sm font-medium block mb-1">Fájlnév</label>
                              <input id="ai-task-df-name" class="input !px-2 !py-1 font-mono !text-sm sm:!w-80" maxlength="120" [ngModel]="df.fileName"
                                (ngModelChange)="setDataFileName($event)" [ngModelOptions]="{ standalone: true }" />
                            </div>
                            <div>
                              <label for="ai-task-df-generator" class="text-sm font-medium block mb-1">Generáló szkript (Python)</label>
                              <p class="text-xs text-text-muted mb-1">
                                A fájlt ez a szkript írja ki rögzített véletlenmaggal - átírhatod (pl. több sor). Módosítás után az Újraellenőrzés futtatja le újra.
                              </p>
                              <textarea id="ai-task-df-generator" rows="12" spellcheck="false" class="input !px-2 !py-1 !text-xs font-mono whitespace-pre"
                                [ngModel]="df.generatorPython ?? ''" (ngModelChange)="setGenerator($event)" [ngModelOptions]="{ standalone: true }"
                                data-testid="ai-task-df-generator"></textarea>
                            </div>
                            <div class="bg-bg-element rounded-xl p-3 space-y-2" data-testid="ai-task-df-content">
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="text-sm font-medium">A kapott fájl eleje</span>
                                @if (dataFileInfo(); as info) { <span class="text-xs text-text-muted">{{ info }}</span> }
                              </div>
                              @if (df.content !== null) {
                                <pre class="max-h-72 overflow-auto text-xs font-mono whitespace-pre bg-bg-panel rounded-lg p-2">{{ head(df.content) }}</pre>
                              } @else {
                                <p class="text-sm text-text-muted">A módosított szkriptet az Újraellenőrzés futtatja le, utána itt látod az eredményt.</p>
                              }
                              @if (r.dataFile && !r.dataFile.generated) {
                                <p class="text-xs text-warning">Kézzel betöltött fájl - a generáló szkript nem fut, ez a tartalom mentődik.</p>
                              }
                              <div class="flex flex-wrap gap-2">
                                <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="downloadDataFile()" [disabled]="df.content === null"
                                  [attr.aria-label]="df.fileName + ' letöltése'" data-testid="ai-task-df-download">Letöltés</button>
                                <label class="btn btn-ghost !px-2 !py-1 text-sm">
                                  Saját változat betöltése
                                  <input type="file" accept=".txt,text/plain" class="sr-only" (change)="loadDataFile($event)" data-testid="ai-task-df-upload" />
                                </label>
                              </div>
                              <p class="text-xs text-text-muted">Nagy fájlnál: töltsd le, szerkeszd a gépeden, majd töltsd vissza (legfeljebb 1 MB).</p>
                              @if (dataFileError()) { <p class="text-sm text-danger" role="alert">{{ dataFileError() }}</p> }
                            </div>
                          } @else if (p.existingInputFiles.length === 0) {
                            <p class="text-sm text-text-muted">Ehhez a feladathoz nem kell bemeneti adatfájl.</p>
                          }
                        </div>
                      }
                      @case ('megoldas') {
                        <div class="space-y-3" data-testid="ai-task-panel-megoldas">
                          <div class="flex flex-wrap gap-1" role="group" aria-label="Nyelv">
                            @for (l of p.languages; track l.language; let li = $index) {
                              <button type="button" class="btn !px-3 !py-1 text-sm" [class.btn-primary]="languageIndex() === li" [class.btn-ghost]="languageIndex() !== li"
                                [attr.aria-pressed]="languageIndex() === li" (click)="languageIndex.set(li)" [attr.data-testid]="'ai-task-lang-' + l.language">
                                {{ languageName(l.language) }}
                              </button>
                            }
                          </div>
                          @if (p.languages[languageIndex()]; as l) {
                            <div>
                              <label [for]="'ai-task-solution-' + l.language" class="text-sm font-medium block mb-1">
                                Teljes megoldás ({{ languageName(l.language) }})
                                @if (l.solutionExisting) { <span class="badge badge-neutral ml-1">a tiéd</span> }
                              </label>
                              <textarea [id]="'ai-task-solution-' + l.language" rows="16" spellcheck="false" [readOnly]="l.solutionExisting"
                                class="input !px-2 !py-1 !text-xs font-mono whitespace-pre" [ngModel]="l.solution"
                                (ngModelChange)="setSolution(languageIndex(), $event)" [ngModelOptions]="{ standalone: true }"
                                [attr.data-testid]="'ai-task-solution-' + l.language"></textarea>
                            </div>
                            <h3 class="font-semibold text-sm">Kódrészletek részfeladatonként</h3>
                            @for (sn of l.snippets; track $index; let si = $index) {
                              <div>
                                <label [for]="'ai-task-snippet-' + l.language + '-' + si" class="text-xs text-text-muted block">
                                  {{ p.subtasks[si]?.label || (si + 1) + '.' }} részfeladat
                                  @if (sn.existing) { <span class="badge badge-neutral ml-1">a tiéd</span> }
                                </label>
                                <textarea [id]="'ai-task-snippet-' + l.language + '-' + si" rows="4" spellcheck="false" [readOnly]="sn.existing"
                                  class="input !px-2 !py-1 !text-xs font-mono whitespace-pre" [ngModel]="sn.code"
                                  (ngModelChange)="setSnippet(languageIndex(), si, $event)" [ngModelOptions]="{ standalone: true }"></textarea>
                              </div>
                            }
                          }
                          <div>
                            <label for="ai-task-stdin" class="text-sm font-medium block mb-1">
                              Tárolt bemenet (ha a program billentyűzetről olvas)
                              @if (p.stdinExisting) { <span class="badge badge-neutral ml-1">a tiéd</span> }
                            </label>
                            <textarea id="ai-task-stdin" rows="3" spellcheck="false" [readOnly]="p.stdinExisting" class="input !px-2 !py-1 !text-xs font-mono whitespace-pre"
                              [ngModel]="p.stdin ?? ''" (ngModelChange)="setStdin($event)" [ngModelOptions]="{ standalone: true }"
                              placeholder="Üresen hagyva nincs tárolt bemenet." data-testid="ai-task-stdin"></textarea>
                          </div>
                        </div>
                      }
                      @case ('ellenorzes') {
                        <div class="space-y-3" data-testid="ai-task-panel-ellenorzes">
                          @if (dirty()) {
                            <p class="text-sm text-warning">Ez a módosítások előtti ellenőrzés eredménye - futtasd le újra.</p>
                          }
                          @if (r.warnings.length > 0) {
                            <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="ai-task-warnings">
                              <p class="font-semibold mb-1 flex items-center gap-2"><app-icon name="warning-triangle" class="w-4 h-4 block" /> Nézd át:</p>
                              <ul class="list-disc pl-5 space-y-0.5 break-words">
                                @for (w of r.warnings; track $index) { <li>{{ w }}</li> }
                              </ul>
                            </div>
                          }
                          @if (r.dataFile; as d) {
                            <p class="text-sm">Adatfájl: <span class="font-mono">{{ d.fileName }}</span> - {{ d.lineCount }} sor, {{ sizeLabel(d.sizeBytes) }}{{ d.generated ? ' (a szkript készítette)' : ' (kézzel betöltve)' }}</p>
                          }
                          @for (l of r.languages; track l.language) {
                            <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'ai-task-check-' + l.language">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="font-semibold text-sm">{{ languageName(l.language) }}</span>
                                <span class="badge" [class]="languageBadge(l)">{{ languageStatusLabel(l) }}</span>
                                @if (l.deterministic === true) { <span class="text-xs text-text-muted">kétszer futtatva azonos kimenet</span> }
                                @if (l.deterministic === false) {
                                  <span class="badge badge-warning" data-testid="ai-task-nondeterministic">nem determinisztikus</span>
                                }
                              </div>
                              @if (l.error) { <p class="text-sm text-danger break-words whitespace-pre-wrap">{{ l.error }}</p> }
                              <ul class="space-y-2">
                                @for (s of l.sections; track $index) {
                                  <li class="text-sm">
                                    <div class="flex flex-wrap items-center gap-2">
                                      @if (sectionOk(s)) {
                                        <span class="text-success font-bold" aria-hidden="true">✔</span>
                                      } @else {
                                        <span class="text-danger font-bold" aria-hidden="true">✘</span>
                                      }
                                      <span>{{ s.label || s.order + '.' }} ({{ s.section }}. feladat)</span>
                                      <span class="text-xs" [class.text-text-muted]="s.status === 'ok'" [class.text-warning]="s.status === 'format'"
                                        [class.text-danger]="!sectionOk(s)">{{ sectionLabel(s) }}</span>
                                    </div>
                                    @if (s.preview) {
                                      <pre class="mt-1 max-h-32 overflow-auto text-xs font-mono whitespace-pre bg-bg-panel rounded-lg p-2">{{ s.preview }}</pre>
                                    }
                                  </li>
                                }
                              </ul>
                            </div>
                          }
                        </div>
                      }
                    }
                  </div>
                }

                @if (dirty()) {
                  <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex flex-wrap items-center justify-between gap-2" role="status" data-testid="ai-task-dirty">
                    <span>Módosítottad a feladatot - mentés előtt ellenőrizd újra (ez nem használ AI-t).</span>
                    <button type="button" class="btn btn-primary !px-3 !py-1" (click)="revalidate()" [disabled]="revalidating()" data-testid="ai-task-revalidate">
                      {{ revalidating() ? 'Ellenőrzés…' : 'Újraellenőrzés' }}
                    </button>
                  </div>
                } @else if (r.status === 'unavailable') {
                  <div class="flex justify-end">
                    <button type="button" class="btn btn-ghost !px-3 !py-1" (click)="revalidate()" [disabled]="revalidating()" data-testid="ai-task-revalidate">
                      {{ revalidating() ? 'Ellenőrzés…' : 'Újraellenőrzés' }}
                    </button>
                  </div>
                }
                @if (revalidateError()) {
                  <p class="text-sm text-danger" role="alert" data-testid="ai-task-revalidate-error">{{ revalidateError() }}</p>
                }
                @if (saveError()) {
                  <p class="text-sm text-danger" role="alert" data-testid="ai-task-save-error">{{ saveError() }}</p>
                }

                <div class="flex flex-wrap justify-end gap-2 pt-2">
                  <button type="button" class="btn btn-ghost mr-auto" (click)="discard()" [disabled]="saving()" data-testid="ai-task-discard">Elvetés</button>
                  @if (changedFromGenerated()) {
                    <button type="button" class="btn btn-ghost" (click)="restore()" [disabled]="saving()" data-testid="ai-task-restore">Visszaállítás</button>
                  }
                  <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!canSave() || saving()" data-testid="ai-task-save">
                    {{ saving() ? 'Mentés…' : 'Mentés' }}
                  </button>
                </div>
              </div>
            }
          }
          @default {
            <!-- ── 1. Kérés ─────────────────────────────── -->
            <div class="space-y-4" data-testid="ai-task-input">
              @if (premiumRequired()) {
                <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex items-start gap-2" data-testid="ai-task-premium">
                  <app-icon name="warning-triangle" class="w-5 h-5 block shrink-0" />
                  <span>{{ premiumMessage }}</span>
                </p>
              } @else if (quota(); as q) {
                <p class="text-sm" [class.text-danger]="quotaExhausted()" [class.text-text-muted]="!quotaExhausted()" data-testid="ai-task-quota">
                  @if (quotaExhausted()) {
                    Elfogyott a havi kereted ({{ q.used }}/{{ q.limit }}) - a következő hónapban újra kérhetsz AI-feladatot.
                  } @else {
                    Költség: 1 egység a havi keretedből (ebben a hónapban még {{ q.limit - q.used }} / {{ q.limit }} maradt). Az újraellenőrzés ingyenes.
                  }
                </p>
              }

              @if (otherRemembered(); as job) {
                <div class="card !rounded-xl p-3 flex flex-wrap items-center justify-between gap-2" data-testid="ai-task-remembered">
                  <span class="text-sm">Van egy korábban indított AI-feladatod ebben a feladatsorban{{ job.taskTitle ? ' („' + job.taskTitle + '”)' : ' (új feladat)' }}.</span>
                  <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="resume(job.jobId, job.taskTitle)" data-testid="ai-task-resume">Megnyitás</button>
                </div>
              }

              @if (mode() === 'complete') {
                <p class="text-sm text-text-muted">
                  Az AI a feladat leírása és a részfeladatok alapján elkészíti, ami még hiányzik: pontjavaslat, mintamegoldás, részfeladatonkénti
                  kódrészletek, szükség esetén bemeneti adatfájl (generáló szkripttel) és tárolt bemenet. A meglévő részeidet nem írja felül.
                  Mentés előtt mindent átnézhetsz, semmi nem mentődik magától.
                </p>
                @if (taskSubtaskCount() === 0) {
                  <p class="text-sm text-warning" data-testid="ai-task-no-subtasks">Előbb add meg a feladat részfeladatait (legalább egyet) - az AI ezekhez készít megoldást.</p>
                }
                <label class="flex items-start gap-2 text-sm">
                  <input type="checkbox" class="mt-1" [ngModel]="regenerateSolution()" (ngModelChange)="regenerateSolution.set($event)"
                    [ngModelOptions]="{ standalone: true }" data-testid="ai-task-regenerate" />
                  <span>A meglévő megoldást is írja újra <span class="text-text-muted">(a mintamegoldást és a kódrészleteket; különben csak a hiányzót)</span></span>
                </label>
              } @else {
                <p class="text-sm text-text-muted">
                  Add meg a témát és a szintet - az AI érettségi stílusban megírja a teljes feladatot: leírás, részfeladatok pontokkal, adatfájl,
                  mintamegoldás. Mentés előtt mindent átnézhetsz és módosíthatsz.
                </p>
                <div>
                  <label for="ai-task-topic" class="text-sm font-medium block mb-1">Téma</label>
                  <input id="ai-task-topic" class="input !px-2 !py-1" [maxlength]="maxTopic" [ngModel]="topic()" (ngModelChange)="topic.set($event)"
                    [ngModelOptions]="{ standalone: true }" placeholder="Pl. Kártyajáték pontszámai" data-testid="ai-task-topic" />
                </div>
                <div class="flex flex-wrap gap-4">
                  <fieldset>
                    <legend class="text-sm font-medium mb-1">Szint</legend>
                    <div class="flex gap-3">
                      @for (lv of levels; track lv.value) {
                        <label class="flex items-center gap-1.5 text-sm">
                          <input type="radio" name="ai-task-level" [value]="lv.value" [checked]="level() === lv.value" (change)="level.set(lv.value)"
                            [attr.data-testid]="'ai-task-level-' + lv.value" />
                          {{ lv.label }}
                        </label>
                      }
                    </div>
                  </fieldset>
                  <div>
                    <label for="ai-task-count" class="text-sm font-medium block mb-1">Részfeladatok száma</label>
                    <select id="ai-task-count" class="input !px-2 !py-1 !w-24" [ngModel]="subtaskCount()" (ngModelChange)="subtaskCount.set(+$event)"
                      [ngModelOptions]="{ standalone: true }" data-testid="ai-task-count">
                      @for (n of subtaskCounts; track n) { <option [ngValue]="n">{{ n }}</option> }
                    </select>
                  </div>
                </div>
                <div>
                  <label for="ai-task-idea" class="text-sm font-medium block mb-1">Ötlet, kérés (nem kötelező)</label>
                  <textarea id="ai-task-idea" rows="3" class="input !px-2 !py-1 !text-sm" [maxlength]="maxIdea" [ngModel]="idea()" (ngModelChange)="idea.set($event)"
                    [ngModelOptions]="{ standalone: true }" placeholder="Pl. legyen benne rendezés és egy fájlba írás." data-testid="ai-task-idea"></textarea>
                  <p class="text-xs text-text-muted mt-1">{{ idea().length }}/{{ maxIdea }}</p>
                </div>
              }

              <fieldset>
                <legend class="text-sm font-medium mb-1">Nyelvek</legend>
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                  @for (l of languageOptions; track l.key) {
                    <label class="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" [checked]="languages().has(l.key)" [disabled]="l.key === 'python'" (change)="toggleLanguage(l.key)"
                        [attr.data-testid]="'ai-task-language-' + l.key" />
                      {{ l.name }}
                    </label>
                  }
                </div>
                <p class="text-xs text-text-muted mt-1">A Python mindig elkészül: ez az ellenőrzés alapja, a többi nyelv kimenetét ehhez méri a rendszer.</p>
              </fieldset>

              @if (startError()) {
                <p class="text-sm text-danger" role="alert" data-testid="ai-task-error">{{ startError() }}</p>
              }

              <div class="flex flex-wrap justify-end gap-2">
                <button type="button" class="btn btn-ghost" (click)="close()">Mégse</button>
                <button type="button" class="btn btn-primary" (click)="start()" [disabled]="!canStart()" data-testid="ai-task-start">
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
export class AiFeladatComponent implements OnInit {
  private readonly service = inject(TeacherAiCodeTaskService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly taskSetId = input.required<number>();
  /** „complete”: a megadott feladat kiegészítése; „new”: új feladat. */
  readonly startMode = input.required<AiCodeTaskMode>();
  readonly task = input<TeacherTaskDto | null>(null);
  readonly closed = output<void>();
  /** Sikeres mentés után a feladat azonosítójával - a szerkesztő újratölti a feladatsort. */
  readonly saved = output<number>();

  readonly tabs = TABS;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly levels: { value: AiCodeTaskLevel; label: string }[] = [
    { value: 'kozep', label: 'Középszint' },
    { value: 'emelt', label: 'Emelt szint' },
  ];
  readonly subtaskCounts = [3, 4, 5, 6, 7, 8];
  readonly maxTopic = MAX_TOPIC;
  readonly maxIdea = MAX_IDEA;
  readonly maxSubtasks = MAX_SUBTASKS;
  readonly premiumMessage = PREMIUM_REQUIRED_MESSAGE;

  readonly mode = signal<AiCodeTaskMode>('new');
  readonly step = signal<Step>('input');
  readonly tab = signal<Tab>('feladat');
  readonly languageIndex = signal(0);

  // ── Kérés ──
  readonly quota = signal<AiCodeTaskQuotaDto | null>(null);
  /** A szerver is mondhatja (pl. közben lejárt az előfizetés), nem csak a keret-lekérdezés. */
  private readonly premiumRejected = signal(false);
  readonly premiumRequired = computed(() => this.premiumRejected() || this.quota()?.isPremium === false);
  readonly quotaExhausted = computed(() => {
    const q = this.quota();
    return !!q && q.used >= q.limit;
  });
  readonly languages = signal<Set<AiCodeTaskLanguage>>(new Set(['python']));
  readonly regenerateSolution = signal(false);
  readonly topic = signal('');
  readonly level = signal<AiCodeTaskLevel>('kozep');
  readonly subtaskCount = signal(5);
  readonly idea = signal('');
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);
  readonly taskTitle = signal<string | null>(null);
  readonly taskSubtaskCount = computed(() => this.task()?.subTasks.length ?? 0);

  readonly canStart = computed(() => {
    if (this.starting() || this.premiumRequired() || this.quotaExhausted()) return false;
    if (this.mode() === 'complete') return !!this.task() && this.taskSubtaskCount() > 0;
    const topic = this.topic().trim();
    return topic.length > 0 && topic.length <= MAX_TOPIC && this.idea().length <= MAX_IDEA;
  });

  // ── Készítés ──
  readonly jobId = signal<number | null>(null);
  readonly progressText = signal<string | null>(null);
  readonly pollError = signal<string | null>(null);
  private startSub: Subscription | null = null;
  private polling: Subscription | null = null;

  // ── Előnézet ──
  /** A generált változat (a „Visszaállítás” ide tér vissza). */
  private readonly generated = signal<AiCodeTaskResultDto | null>(null);
  /** A szerkesztett javaslat. */
  readonly proposal = signal<AiCodeTaskProposal | null>(null);
  /** Az utoljára hibátlanul (vagy nem) ellenőrzött, szerver által normalizált változat - mentéskor PONTOSAN ez megy. */
  private readonly validated = signal<AiCodeTaskProposal | null>(null);
  readonly report = signal<AiCodeTaskReport | null>(null);
  readonly notes = computed(() => this.generated()?.notes ?? null);
  readonly revalidating = signal(false);
  readonly revalidateError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly dataFileError = signal<string | null>(null);
  private revalidation: Subscription | null = null;

  readonly dirty = computed(() => !sameProposal(this.proposal(), this.validated()));
  readonly changedFromGenerated = computed(() => !!this.generated() && !sameProposal(this.proposal(), this.generated()!.proposal));
  readonly canSave = computed(() => !!this.report()?.canSave && !this.dirty() && !!this.validated());
  readonly pointsSum = computed(() => (this.proposal()?.subtasks ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0));

  /** Egy másik (más feladathoz / módhoz indított) emlékezett job - megnyitható. */
  readonly otherRemembered = signal<{ jobId: number; taskTitle: string | null } | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit(): void {
    this.mode.set(this.startMode());
    const task = this.task();
    this.taskTitle.set(task?.title ?? null);
    if (task) {
      // A feladat meglévő összevont megoldásainak nyelvei alapból bejelölve.
      const existing = new Set(task.completeSolutionSnippets.map((s) => s.programmingLanguageId));
      this.languages.set(new Set(LANGUAGE_OPTIONS.filter((l) => l.key === 'python' || existing.has(l.platformId)).map((l) => l.key)));
    }
    this.loadQuota();

    const remembered = this.service.rememberedJob(this.taskSetId());
    if (remembered) {
      const sameTarget = remembered.mode === this.mode() && remembered.taskId === (task?.id ?? null);
      if (sameTarget) this.resume(remembered.jobId);
      else this.otherRemembered.set({ jobId: remembered.jobId, taskTitle: remembered.taskTitle });
    }
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  private loadQuota(): void {
    this.service
      .getQuota()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (q) => this.quota.set(q), error: () => this.quota.set(null) });
  }

  toggleLanguage(key: AiCodeTaskLanguage): void {
    if (key === 'python') return;
    this.languages.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  start(): void {
    if (!this.canStart()) return;
    const languages = LANGUAGE_OPTIONS.filter((l) => this.languages().has(l.key)).map((l) => l.key);
    const task = this.task();
    const request =
      this.mode() === 'complete'
        ? { mode: 'complete' as const, taskId: task!.id, regenerateSolution: this.regenerateSolution(), languages }
        : {
            mode: 'new' as const,
            topic: this.topic().trim(),
            level: this.level(),
            subtaskCount: this.subtaskCount(),
            languages,
            idea: this.idea().trim() || null,
          };
    this.starting.set(true);
    this.startError.set(null);
    this.startSub = this.service
      .startJob(this.taskSetId(), request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.starting.set(false);
          this.quota.set(res.quota);
          this.service.remember(this.taskSetId(), { jobId: res.jobId, mode: this.mode(), taskId: task?.id ?? null, taskTitle: this.taskTitle() });
          this.otherRemembered.set(null);
          this.poll(res.jobId);
        },
        error: (err) => {
          this.starting.set(false);
          if (err?.error?.errorType === 'AiCodeTaskPremiumRequired') this.premiumRejected.set(true);
          if (err?.error?.errorType === 'AiCodeTaskQuotaExceeded') this.loadQuota();
          this.startError.set(this.errorText(err, 'Az AI-feladat indítása nem sikerült.'));
        },
      });
  }

  /** Egy (korábban indított) job megnyitása: állapot-lekérdezés, amíg kész nincs. */
  resume(jobId: number, taskTitle?: string | null): void {
    if (taskTitle !== undefined) this.taskTitle.set(taskTitle);
    this.otherRemembered.set(null);
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
        retry({ count: 3, resetOnSuccess: true, delay: (err) => (err?.status === 404 ? throwError(() => err) : timer(POLL_MS)) }),
        repeat({ delay: POLL_MS }),
        takeWhile((job) => ACTIVE_STATUSES.has(job.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (job) => {
          if (this.jobId() !== jobId) return;
          this.onJob(job);
        },
        error: (err) => {
          if (this.jobId() !== jobId) return;
          if (err?.status === 404) {
            this.service.forget(this.taskSetId(), jobId);
            this.backToInput('Ez az AI-feladat már nem érhető el (24 óra után lejár). Indíts újat.');
          } else {
            this.pollError.set(extractErrorMessage(err, 'Az állapot lekérdezése nem sikerült - zárd be, és nyisd meg újra később.'));
          }
        },
      });
  }

  private onJob(job: AiCodeTaskJobDto): void {
    this.mode.set(job.mode);
    this.progressText.set(job.progressText);
    if (job.status === 'failed') {
      this.service.forget(this.taskSetId(), job.jobId);
      this.loadQuota();
      this.backToInput(`${job.error || 'Az AI-feladat elkészítése nem sikerült.'} A havi keretedből nem vonódott le.`);
    } else if (job.status === 'done') {
      if (job.appliedTaskId != null && job.mode === 'new') {
        this.service.forget(this.taskSetId(), job.jobId);
        this.backToInput('Ezt az AI-feladatot már elmentetted.');
      } else if (job.result) {
        this.showResult(job.result);
      }
    }
  }

  private backToInput(message: string): void {
    this.stopPolling();
    this.resetPreview();
    this.resetTarget();
    this.jobId.set(null);
    this.step.set('input');
    this.startError.set(message);
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }

  private showResult(result: AiCodeTaskResultDto): void {
    this.cancelRevalidation();
    this.generated.set(result);
    this.proposal.set(result.proposal);
    this.validated.set(result.proposal);
    this.report.set(result.report);
    this.tab.set(result.report.status === 'ok' ? 'feladat' : 'ellenorzes');
    this.languageIndex.set(0);
    this.saveError.set(null);
    this.revalidateError.set(null);
    this.dataFileError.set(null);
    this.step.set('preview');
  }

  private resetPreview(): void {
    this.cancelRevalidation();
    this.generated.set(null);
    this.proposal.set(null);
    this.validated.set(null);
    this.report.set(null);
    this.saveError.set(null);
    this.revalidateError.set(null);
  }

  private cancelRevalidation(): void {
    this.revalidation?.unsubscribe();
    this.revalidation = null;
    this.revalidating.set(false);
  }

  // ── Szerkesztés ──
  private update(fn: (p: AiCodeTaskProposal) => AiCodeTaskProposal): void {
    const current = this.proposal();
    if (current) this.proposal.set(fn(current));
  }

  setField(field: 'title' | 'description', value: string): void {
    this.update((p) => ({ ...p, [field]: value }));
  }

  setSubtask(index: number, patch: Partial<Pick<AiProposalSubtask, 'label' | 'text' | 'points'>>): void {
    this.update((p) => ({ ...p, subtasks: p.subtasks.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  toPoints(value: unknown): number | null {
    return value === null || value === '' || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);
  }

  /** 2. mód: új részfeladat a végére, minden nyelvnél egy üres kódrészlettel (a BE nyelvenként azonos számút vár). */
  addSubtask(): void {
    this.update((p) => {
      if (p.subtasks.length >= MAX_SUBTASKS) return p;
      const label = `${p.subtasks.length + 1}.`;
      return {
        ...p,
        subtasks: [...p.subtasks, { subTaskId: null, label, text: '', points: 1, existing: false, pointsExisting: false }],
        languages: p.languages.map((l) => ({ ...l, snippets: [...l.snippets, { code: '', existing: false }] })),
      };
    });
  }

  removeSubtask(index: number): void {
    this.update((p) => ({
      ...p,
      subtasks: p.subtasks.filter((_, i) => i !== index),
      languages: p.languages.map((l) => ({ ...l, snippets: l.snippets.filter((_, i) => i !== index) })),
    }));
  }

  setDataFileName(fileName: string): void {
    this.update((p) => (p.dataFile ? { ...p, dataFile: { ...p.dataFile, fileName } } : p));
  }

  /** Átírt szkript: a tartalom törlődik, az újraellenőrzés futtatja le újra a generátort. */
  setGenerator(generatorPython: string): void {
    this.update((p) => (p.dataFile ? { ...p, dataFile: { ...p.dataFile, generatorPython, content: null } } : p));
  }

  async loadDataFile(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    this.dataFileError.set(null);
    if (file.size > MAX_DATA_FILE_BYTES) {
      this.dataFileError.set('A fájl legfeljebb 1 MB lehet.');
      return;
    }
    const content = await file.text();
    this.update((p) => (p.dataFile ? { ...p, dataFile: { ...p.dataFile, content } } : p));
  }

  downloadDataFile(): void {
    const df = this.proposal()?.dataFile;
    if (!df || df.content === null) return;
    saveBlob(new Blob([df.content], { type: 'text/plain;charset=utf-8' }), df.fileName);
  }

  setStdin(stdin: string): void {
    this.update((p) => ({ ...p, stdin: stdin === '' ? null : stdin }));
  }

  setSolution(languageIndex: number, solution: string): void {
    this.update((p) => ({ ...p, languages: p.languages.map((l, i) => (i === languageIndex ? { ...l, solution } : l)) }));
  }

  setSnippet(languageIndex: number, snippetIndex: number, code: string): void {
    this.update((p) => ({
      ...p,
      languages: p.languages.map((l, i) =>
        i === languageIndex ? { ...l, snippets: l.snippets.map((s, j) => (j === snippetIndex ? { ...s, code } : s)) } : l,
      ),
    }));
  }

  /** A generált változat vissza; ha a szerver legutóbb is azt ellenőrizte, a generáláskori eredmény ismét érvényes. */
  restore(): void {
    const generated = this.generated();
    if (!generated) return;
    this.proposal.set(generated.proposal);
    if (sameProposal(generated.proposal, this.validated())) this.report.set(generated.report);
    this.dataFileError.set(null);
  }

  /** Az eredmény eldobása, vissza a kéréshez (új generálás = új keret-egység). */
  discard(): void {
    const jobId = this.jobId();
    if (jobId != null) this.service.forget(this.taskSetId(), jobId);
    this.jobId.set(null);
    this.resetPreview();
    this.resetTarget();
    this.startError.set(null);
    this.step.set('input');
  }

  /** Egy megnyitott más job után a párbeszédablak saját célja (mód, feladat) áll vissza. */
  private resetTarget(): void {
    this.mode.set(this.startMode());
    this.taskTitle.set(this.task()?.title ?? null);
  }

  /** Ellenőrzés a szerveren MI nélkül; a válasz normalizált javaslata lesz a menthető változat. */
  revalidate(): void {
    const jobId = this.jobId();
    const sent = this.proposal();
    if (this.revalidating() || jobId == null || !sent) return;
    const basis = this.generated();
    this.revalidating.set(true);
    this.revalidateError.set(null);
    this.saveError.set(null);
    this.revalidation = this.service
      .validate(this.taskSetId(), jobId, sent)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.revalidating.set(false);
          // Közben Elvetés / másik job: az elavult válasz eldobva.
          if (this.generated() !== basis || this.jobId() !== jobId) return;
          this.validated.set(res.proposal);
          this.report.set(res.report);
          // Ha a tanár közben nem módosított, a normalizált változat kerül a szerkesztőbe; különben a módosítása marad (újra „módosítva”).
          if (this.proposal() === sent) this.proposal.set(res.proposal);
        },
        error: (err) => {
          this.revalidating.set(false);
          if (this.generated() !== basis || this.jobId() !== jobId) return;
          if (err?.error?.errorType === 'AiCodeTaskPremiumRequired') this.premiumRejected.set(true);
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
        this.service.forget(this.taskSetId(), jobId);
        this.toastService.success(res.saved.length > 0 ? `Elmentve: ${res.saved.join(', ')}.` : 'Elmentve.');
        this.saved.emit(res.taskId);
        this.closed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(this.errorText(err, 'A mentés nem sikerült.'));
        // 1. módban a mentés részben megtörténhetett - a szerkesztő listája frissüljön.
        const task = this.task();
        if (this.mode() === 'complete' && task) this.saved.emit(task.id);
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
    this.closed.emit();
  }

  onTabKey(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    this.tab.set(next.id);
    setTimeout(() => (document.getElementById(`ai-task-tab-${next.id}`) as HTMLElement | null)?.focus());
  }

  private errorText(err: unknown, fallback: string): string {
    const e = err as { status?: number; error?: { errorType?: string } } | null;
    switch (e?.error?.errorType) {
      case 'AiCodeTaskPremiumRequired':
        return PREMIUM_REQUIRED_MESSAGE;
      case 'AiCodeTaskQuotaExceeded':
        return 'Elfogyott a havi AI-feladat kereted - a következő hónapban újra kérhetsz.';
      case 'FeatureDisabled':
        return 'Az AI programozási feladat most nincs bekapcsolva. Próbáld később.';
    }
    if (e?.status === 429) return 'Túl sok kérés rövid időn belül - várj néhány percet, és próbáld újra.';
    if (e?.status === 413) return 'A feladat túl nagy az ellenőrzéshez (legfeljebb 3 MB) - rövidítsd az adatfájlt (pl. kevesebb sor a generáló szkriptben).';
    return extractErrorMessage(err, fallback);
  }

  // ── Megjelenítés ──
  languageName(key: string): string {
    return LANGUAGE_OPTIONS.find((l) => l.key === key)?.name ?? key;
  }

  languageStatusLabel(l: AiLanguageReport): string {
    return LANGUAGE_STATUS[l.status]?.label ?? l.status;
  }

  languageBadge(l: AiLanguageReport): string {
    return LANGUAGE_STATUS[l.status]?.badge ?? 'badge-neutral';
  }

  sectionOk(s: AiSectionReport): boolean {
    return SECTION_STATUS[s.status]?.ok ?? false;
  }

  sectionLabel(s: AiSectionReport): string {
    return SECTION_STATUS[s.status]?.label ?? s.status;
  }

  readonly dataFileInfo = computed(() => {
    const content = this.proposal()?.dataFile?.content;
    if (content == null) return null;
    const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
    return `${lines} sor, ${this.sizeLabel(new TextEncoder().encode(content).length)}`;
  });

  head(content: string): string {
    const lines = content.split('\n');
    return lines.length <= PREVIEW_LINES ? content : `${lines.slice(0, PREVIEW_LINES).join('\n')}\n… (további ${lines.length - PREVIEW_LINES} sor)`;
  }

  sizeLabel(bytes: number): string {
    return bytes < 1024 ? `${bytes} bájt` : `${Math.round(bytes / 1024)} KB`;
  }
}
