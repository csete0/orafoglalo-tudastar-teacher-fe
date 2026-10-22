import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TeacherTeamService, TeamUpdate } from '../../services/team/teacher-team.service';
import { ReportService } from '../../services/report/report.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { AiHelperQuotaItemDto } from '../../shared/ai-helper-quota.util';
import { KodOlvasoComponent } from '../../shared/kod-olvaso/kod-olvaso.component';
import { HetiAktivitasComponent } from './heti-aktivitas.component';
import {
  CodeSuggestion, MILESTONE_KIND_LABEL, SYNC_LABEL, Team, TeamActivity, TeamDocsCheckItem, TeamGithubStatus, TeamMilestone, TeamMilestoneEdit, TeamMilestoneTest, TeamRepoReview,
  TeamReviews, TeamTree, TestRunnerOption,
} from '../../models/team.model';

type Fül = 'munka' | 'merfoldkovek' | 'mi' | 'fajlok';

/** Futó MI-átnézésnél ennyi időnként frissül, legfeljebb ennyiszer (3 perc), utána kézi frissítés. */
const POLL_MS = 5000;
const MAX_POLLS = 36;

/**
 * Egy vizsgaremek-csapat a tanárnak (spec 3.3–3.5): csapatadatok (név, téma, vizsga dátuma, szerepkörök), csapatmunka, KKK-mérföldkövek (határidő,
 * minták, tesztfuttatás, pipa), MI-átnézés a tanári keretből, csak olvasható fájlok, GitHub-állapot. Archivált csapatnál minden csak olvasható.
 */
@Component({
  selector: 'app-csapat-reszletek',
  imports: [DatePipe, FormsModule, RouterLink, KodOlvasoComponent, HetiAktivitasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (team(); as t) {
      <div class="max-w-6xl space-y-4 min-w-0">
        @if (t.groupId) { <a class="text-sm underline" [routerLink]="['/csoportok', t.groupId]" [queryParams]="{ tab: 'technikum' }" fragment="csapatok">← {{ t.groupName }}</a> }
        <h1 class="page-title break-words">{{ t.name }}</h1>
        <p class="text-sm text-text-muted">{{ t.projectTitle ? t.projectTitle + ' · ' : '' }}{{ memberLine(t) }}
          @if (t.examDate) { · vizsga: {{ t.examDate | date: 'yyyy.MM.dd.' }} }</p>
        @if (t.status === 'archived') { <p class="text-sm"><span class="badge badge-neutral">archivált</span> A csapat archivált: a tároló és a mérföldkövek csak olvashatók.</p> }
        @else if (t.status === 'proposed') { <p class="text-sm"><span class="badge badge-warning">jóváhagyásra vár</span> A csoport „Csapatok” fülén hagyhatod jóvá.</p> }
        @if (t.repo?.locked) { <p class="text-sm text-danger">A tárolót az adminisztrátor zárolta: a fájlok, a gépi ellenőrzés és az MI-átnézés most nem érhető el.</p> }
        @if (github(); as g) {
          @if (g.enabled && g.linked) {
            <p class="text-sm break-words">GitHub: <a class="underline" [href]="g.repoUrl" target="_blank" rel="noopener">{{ g.repoFullName }}</a> –
              {{ g.status === 'broken' ? 'a kapcsolat megszakadt' : syncLabel(g.lastSyncStatus) }}
              @if (g.lastSyncAt) { ({{ g.lastSyncAt | date: 'yyyy.MM.dd. HH:mm' }}) }</p>
          }
        }

        @if (editable()) {
          <details class="card p-4 text-sm" (toggle)="$any($event.target).open && startEdit(t)">
            <summary class="cursor-pointer font-bold min-h-8">Csapatadatok szerkesztése</summary>
            <form class="mt-3 grid gap-3 sm:grid-cols-2" (ngSubmit)="saveDetails()">
              <label class="block">Csapatnév <input class="input w-full" name="name" maxlength="80" [ngModel]="editName()" (ngModelChange)="editName.set($event)" /></label>
              <label class="block">Vizsgaremek témája <input class="input w-full" name="title" maxlength="120" [ngModel]="editTitle()" (ngModelChange)="editTitle.set($event)" /></label>
              <label class="block">Vizsga dátuma (a beadás határideje alapból 14 nappal előtte)
                <input class="input w-full" type="date" name="exam" [min]="today" [ngModel]="editExam()" (ngModelChange)="editExam.set($event)" /></label>
              <fieldset class="space-y-2 sm:col-span-2"><legend class="mb-1">Szerepkörök (szabad szöveg, pl. backend, mobil)</legend>
                @for (m of t.members; track m.userId) {
                  <label class="block">{{ m.name }} <input class="input w-full" [name]="'role-' + m.userId" maxlength="60" [ngModel]="editRoles()[m.userId] ?? ''"
                    (ngModelChange)="setRole(m.userId, $event)" /></label>
                }
              </fieldset>
              <div class="sm:col-span-2"><button class="btn btn-primary" type="submit" [disabled]="busy() || editName().trim().length < 2">Mentés</button></div>
            </form>
          </details>
        }

        <nav class="flex gap-4 border-b border-border-default overflow-x-auto" role="tablist" aria-label="Csapat nézetei">
          @for (f of fulek; track f.value) {
            <button class="tab-btn" [class.tab-btn-active]="tab() === f.value" role="tab" [id]="'csapat-tab-' + f.value"
              [attr.aria-selected]="tab() === f.value" aria-controls="csapat-panel" type="button" (click)="setTab(f.value)">{{ f.label }}</button>
          }
        </nav>
        @if (error()) { <p class="text-danger text-sm" role="alert">{{ error() }}</p> }
        <section id="csapat-panel" role="tabpanel" [attr.aria-labelledby]="'csapat-tab-' + tab()" class="space-y-3 min-w-0">
        @switch (tab()) {
          @case ('munka') {
            @if (activity(); as a) {
              @if (a.hasRepo) { <app-heti-aktivitas [data]="a" /> } @else { <p class="text-sm text-text-muted">A csapatnak még nincs közös tárolója.</p> }
            }
          }
          @case ('merfoldkovek') {
            <div class="flex flex-wrap gap-2 items-end">
              <button class="btn btn-ghost" type="button" (click)="check()" [disabled]="busy() || t.status !== 'active'">Gépi ellenőrzés most</button>
              @if (canTick()) {
                <label class="text-sm flex-1 min-w-48">Megjegyzés a következő pipához (a diákok látják)
                  <input class="input w-full" maxlength="500" [ngModel]="note()" (ngModelChange)="note.set($event)" /></label>
              }
            </div>
            <ol class="space-y-3">
              <!-- objektum szerint követve: mentés / hibás mentés utáni (új) lista a mezőket is a szerver értékére állítja -->
              @for (m of milestones(); track m) {
                <li class="card p-3 space-y-2 min-w-0" [attr.data-testid]="'ms-' + m.id">
                  <div class="flex flex-wrap items-center gap-2">
                    @if (m.canTick) {
                      <label class="font-bold flex items-center gap-2 min-h-8"><input type="checkbox" [checked]="!!m.tickedAt" [disabled]="busy()"
                        (change)="tick(m, $any($event.target).checked)" /> {{ m.title }}</label>
                    } @else { <span class="font-bold">{{ m.tickedAt ? '✓ ' : '' }}{{ m.title }}</span> }
                    <span class="text-xs text-text-muted">{{ kindLabel(m.kind) }}</span>
                    @if (m.overdue) { <span class="badge badge-danger">lejárt</span> }
                  </div>
                  <p class="text-sm">Határidő: {{ m.effectiveDueDate ? (m.effectiveDueDate | date: 'yyyy.MM.dd.') : 'nincs megadva' }}
                    @if (m.kind === 'submit' && !m.dueDate && m.effectiveDueDate) { <span class="text-xs text-text-muted"> (14 nappal a vizsga előtt)</span> }</p>
                  @if (m.canEdit) {
                    <div class="grid gap-2 sm:grid-cols-2">
                      <label class="text-sm block">Határidő módosítása <input class="input w-full" type="date" [value]="m.dueDate ?? ''" [disabled]="busy()"
                        (change)="saveDue(m, $any($event.target).value)" /></label>
                      @if (m.kind !== 'submit') {
                        <label class="text-sm block">Tesztfuttató
                          <select class="input w-full" [disabled]="busy()" (change)="savePreset(m, $any($event.target).value, m.testDir)">
                            <option value="" [selected]="!m.testPreset">nincs (csak a fájlok megléte)</option>
                            @for (r of runners(); track r.key) {
                              <option [value]="r.key" [disabled]="!r.available" [selected]="m.testPreset === r.key">{{ r.label }}{{ r.available ? '' : ' (hamarosan)' }}</option>
                            }
                          </select></label>
                        <label class="text-sm block sm:col-span-2">Várt fájlok/mappák (soronként egy minta, pl. **/*.sql)
                          <textarea class="input w-full" rows="2" [value]="m.requiredPaths.join('\\n')" [disabled]="busy()" (change)="savePaths(m, $any($event.target).value)"></textarea></label>
                        @if (m.testPreset) {
                          <label class="text-sm block">Tesztmappa <input class="input w-full" [value]="m.testDir ?? ''" [disabled]="busy()" placeholder="pl. backend/tests"
                            (change)="savePreset(m, m.testPreset, $any($event.target).value)" /></label>
                        }
                      }
                    </div>
                  } @else if (m.requiredPaths.length) { <p class="text-xs text-text-muted break-words">Várt: {{ m.requiredPaths.join(', ') }}</p> }
                  @if (m.lastCheck; as c) {
                    <ul class="text-sm break-words" [attr.aria-label]="'Ellenőrzés: ' + (c.at | date: 'yyyy.MM.dd. HH:mm') + ', ág: ' + c.branch">
                      @for (i of c.items; track i.pattern) { <li [class.text-danger]="!i.matched">{{ i.pattern }} – {{ i.matched ? 'megvan (' + i.example + ')' : 'hiányzik' }}</li> }
                    </ul>
                    @if (c.truncated) { <p class="text-xs text-text-muted">A tároló túl nagy: nem minden fájl ellenőrizhető.</p> }
                    @if (c.docs; as d) {
                      <p class="text-sm font-semibold">Dokumentáció – a 7 kötelező elem</p>
                      <ul class="text-sm break-words" data-testid="docs-check">
                        @for (i of d.items; track i.key) {
                          <li [class]="docsClass[i.status]">{{ docsMark[i.status] }} {{ i.label }} – {{ docsStatus[i.status] }}@if (i.where) { ({{ i.where }})}
                            @if (i.hint) { <span class="block text-xs text-text-muted">{{ i.hint }}</span> }</li>
                        }
                      </ul>
                      <p class="text-xs text-text-muted">{{ d.sources.length ? 'Átnézett dokumentumok: ' + d.sources.join(', ') : 'Nem találtunk dokumentumot (README, docs/ mappa).' }}</p>
                      @for (w of d.warnings; track w) { <p class="text-xs text-text-muted">{{ w }}</p> }
                    }
                  }
                  @if (m.testPreset) {
                    @if (m.canEdit) { <button class="btn btn-ghost" type="button" (click)="runTest(m)" [disabled]="busy()">Tesztek futtatása</button> }
                    <p class="text-xs text-text-muted" data-testid="test-help">{{ testHelp(m.testPreset) }}</p>
                    @if (testResult()[m.id] ?? m.lastCheck?.test; as tr) {
                      <details class="text-sm" [open]="!tr.passed"><summary class="cursor-pointer" [class.text-danger]="!tr.passed">Tesztek: {{ tr.passed ? 'lefutottak' : 'hibával álltak le' }}
                        ({{ tr.at | date: 'yyyy.MM.dd. HH:mm' }})</summary><pre class="whitespace-pre-wrap max-h-64 overflow-auto text-xs">{{ tr.output }}</pre></details>
                    }
                  }
                  @if (m.tickedAt) { <p class="text-xs">Kész – {{ m.tickedByName }}{{ m.teacherNote ? ': ' + m.teacherNote : '' }}</p> }
                  @if (m.canEdit && m.kind === 'custom') {
                    <button class="btn btn-ghost" type="button" (click)="deleteMilestone(m)" [disabled]="busy()">Mérföldkő törlése</button>
                  }
                </li>
              } @empty { <li class="text-sm text-text-muted">Még nincs mérföldkő.</li> }
            </ol>
            @if (canEditMilestones()) {
              <form class="flex flex-wrap gap-2 items-end" (ngSubmit)="addMilestone()">
                <label class="text-sm flex-1 min-w-48">Saját mérföldkő <input class="input w-full" name="newMs" maxlength="200" placeholder="pl. Felhasználói kézikönyv vázlata"
                  [ngModel]="newMilestone()" (ngModelChange)="newMilestone.set($event)" /></label>
                <button class="btn btn-ghost" type="submit" [disabled]="busy() || newMilestone().trim().length < 2">Felvétel</button>
              </form>
            }
          }
          @case ('mi') {
            @if (reviews(); as r) {
              <p class="text-sm">A csapat ebben a hónapban {{ r.used }}/{{ r.limit }} átnézést használt. Minden átnézés a te havi MI-keretedből is
                fogy@if (quota(); as q) { (most {{ q.used }}/{{ q.limit }})}; a sikertelen vagy csonka átnézés egyikbe sem számít bele.</p>
              @if (t.status === 'active') {
                <div class="flex flex-wrap gap-2 items-end">
                  @if (branches().length > 1) {
                    <label class="text-sm">Ág
                      <select class="input" [ngModel]="reviewBranch()" (ngModelChange)="reviewBranch.set($event)">
                        <option [ngValue]="null">alapértelmezett (main)</option>
                        @for (b of branches(); track b) { <option [ngValue]="b">{{ b }}</option> }
                      </select></label>
                  }
                  <button class="btn btn-primary" type="button" (click)="requestReview()" [disabled]="busy() || running() || r.used >= r.limit || quotaFull()">MI-átnézés kérése</button>
                </div>
                @if (r.used >= r.limit) { <p class="text-xs text-text-muted">A csapat havi kerete elfogyott – a következő hónapban újra kérhető.</p> }
                @else if (quotaFull()) { <p class="text-xs text-text-muted" data-testid="quota-full">A havi MI-kereted elfogyott – a következő hónapban újra kérhető.</p> }
              }
              @if (stalled()) { <p class="text-sm" role="status">Még fut – <button class="underline" type="button" (click)="refreshReviews()">frissítés</button></p> }
              @for (x of r.items; track x.id) {
                <article class="card p-3 space-y-2 text-sm min-w-0" [attr.data-testid]="'review-' + x.id">
                  <h3 class="font-bold break-words">{{ x.createdAt | date: 'yyyy.MM.dd. HH:mm' }} · ág: {{ x.branch }}{{ x.requestedByName ? ' · ' + x.requestedByName : '' }}
                    @if (notCounted(x)) { <span class="badge badge-neutral font-normal">nem számít bele a keretbe</span> }</h3>
                  @if (x.status === 'queued') { <p role="status">Sorban áll…</p> }
                  @else if (x.status === 'running') { <p role="status">Az MI átnézi a tárolót…</p> }
                  @else {
                    @if (x.error) { <p class="text-danger">{{ x.error }}</p> }
                    @if (x.result; as res) {
                      @if (res.summary) { <p>{{ res.summary }}</p> }
                      <ul class="list-disc pl-5">@for (c of res.criteria; track c.key) { <li><strong>{{ c.label }}: {{ c.score }}/5</strong> – {{ c.text }}</li> }</ul>
                      @for (s of res.suggestions; track $index) {
                        <p class="break-words" [class.text-danger]="s.severity === 'hiba'"><code>{{ s.path }}:{{ s.line }}</code> {{ severityLabel(s) }}: {{ s.text }}</p>
                      }
                      <p class="text-xs text-text-muted">Átnézett fájlok: {{ res.reviewedPaths.length }}{{ res.truncatedPaths.length ? ' (ebből ' + res.truncatedPaths.length + ' csak részben)' : '' }};
                        kihagyva (függőség, generált, bináris, keret): {{ res.skippedFiles }}.</p>
                    } @else if (!x.error) { <p class="text-danger">Az átnézés nem sikerült.</p> }
                  }
                </article>
              } @empty { <p class="text-sm text-text-muted">Még nem volt átnézés.</p> }
            }
          }
          @case ('fajlok') {
            @if (branches().length > 1) {
              <label class="text-sm">Ág
                <select class="input" [ngModel]="fileRef()" (ngModelChange)="selectRef($event)" [disabled]="busy()">
                  <option [ngValue]="null">alapértelmezett (main)</option>
                  @for (b of branches(); track b) { <option [ngValue]="b">{{ b }}</option> }
                </select></label>
            }
            @if (tree(); as tr) {
              @if (tr.truncated) { <p class="text-xs text-text-muted">A tároló nagy: a lista nem teljes – a teljes tartalomhoz klónozd.</p> }
              <div class="grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
                <ul class="text-sm max-h-[40vh] md:max-h-[60vh] overflow-auto space-y-0.5" aria-label="Fájlok">
                  @for (e of tr.entries; track e.path) {
                    @if (e.type === 'blob') {
                      <li><button class="underline text-left break-all min-h-8" type="button" [attr.aria-current]="openPath() === e.path ? 'true' : null"
                        (click)="openFile(e.path)">{{ e.path }}</button></li>
                    }
                  } @empty { <li class="text-text-muted">A tároló üres.</li> }
                </ul>
                <div class="min-w-0">
                  @if (fileNote()) { <p class="text-sm text-text-muted">{{ fileNote() }}</p> }
                  <app-kod-olvaso [files]="openFiles()" [activePath]="openPath()" />
                </div>
              </div>
            }
          }
        }
        </section>
      </div>
    } @else if (error()) {
      <p class="text-danger text-sm" role="alert">{{ error() }}</p>
    } @else {
      <p class="text-sm text-text-muted" role="status">Betöltés…</p>
    }
  `,
})
export class CsapatReszletekComponent implements OnInit {
  private readonly api = inject(TeacherTeamService);
  private readonly reports = inject(ReportService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  readonly fulek: { value: Fül; label: string }[] = [
    { value: 'munka', label: 'Csapatmunka' }, { value: 'merfoldkovek', label: 'Mérföldkövek' }, { value: 'mi', label: 'MI-átnézés' }, { value: 'fajlok', label: 'Fájlok' },
  ];
  /** Helyi (nem UTC) mai nap - éjfél körül az ISO-dátum még a tegnapi lenne. */
  readonly today = formatDate(new Date(), 'yyyy-MM-dd', 'en-US');
  readonly tab = signal<Fül>('munka');
  readonly team = signal<Team | null>(null);
  readonly activity = signal<TeamActivity | null>(null);
  readonly milestones = signal<TeamMilestone[]>([]);
  /** A tesztfuttató presetek (BE: GET test-runners); a szerveren még nem elérhetők tiltva, „(hamarosan)” jelöléssel. */
  readonly runners = signal<TestRunnerOption[]>([]);
  readonly testResult = signal<Record<number, TeamMilestoneTest>>({});
  /** A dokumentáció-ellenőrzés állapotai: ✔ megvan / ~ csak említve / ✘ hiányzik. */
  readonly docsStatus: Record<TeamDocsCheckItem['status'], string> = { found: 'megvan', mentioned: 'csak említve', missing: 'hiányzik' };
  readonly docsMark: Record<TeamDocsCheckItem['status'], string> = { found: '✔', mentioned: '~', missing: '✘' };
  readonly docsClass: Record<TeamDocsCheckItem['status'], string> = { found: 'text-success', mentioned: 'text-warning', missing: 'text-danger' };
  readonly reviews = signal<TeamReviews | null>(null);
  /** A tanár havi repóátnézési kerete (GET api/teacher/ai-helpers/quota `repoReview`); hiányában a sor nem látszik. */
  readonly quota = signal<AiHelperQuotaItemDto | null>(null);
  readonly reviewBranch = signal<string | null>(null);
  readonly stalled = signal(false);
  readonly tree = signal<TeamTree | null>(null);
  readonly fileRef = signal<string | null>(null);
  readonly github = signal<TeamGithubStatus | null>(null);
  readonly openFiles = signal<Record<string, string>>({});
  readonly openPath = signal<string | null>(null);
  readonly fileNote = signal<string | null>(null);
  readonly note = signal('');
  readonly newMilestone = signal('');
  readonly editName = signal('');
  readonly editTitle = signal('');
  readonly editExam = signal('');
  readonly editRoles = signal<Record<number, string>>({});
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Csapatadatokat a tanár iskolai csapatnál állíthat, amíg nem archivált (BE: UpdateAsync). */
  readonly editable = computed(() => { const t = this.team(); return !!t && t.canManage && (t.status === 'active' || t.status === 'proposed'); });
  /** A BE mérföldkövenként adja (csak aktív csapatnál igaz); csapatszinten egyforma. */
  readonly canEditMilestones = computed(() => this.milestones().some((m) => m.canEdit));
  readonly canTick = computed(() => this.milestones().some((m) => m.canTick));
  readonly branches = computed(() => (this.activity()?.branches ?? []).map((b) => b.name));
  readonly running = computed(() => !!this.reviews()?.items.some((r) => r.status === 'queued' || r.status === 'running'));
  readonly quotaFull = computed(() => { const q = this.quota(); return !!q && q.used >= q.limit; });

  private timer: ReturnType<typeof setTimeout> | undefined;
  private polls = 0;
  private destroyed = false;
  private get id(): number { return Number(this.route.snapshot.paramMap.get('id')); }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.timer);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.run(async () => {
      this.team.set(await firstValueFrom(this.api.get(this.id)));
      this.activity.set(await firstValueFrom(this.api.activity(this.id)));
    });
    // A GitHub-rész külön kapcsolóval ki lehet kapcsolva (404) - ilyenkor egyszerűen nem látszik.
    this.github.set(await firstValueFrom(this.api.github(this.id)).catch(() => null));
  }

  async setTab(tab: Fül): Promise<void> {
    this.tab.set(tab);
    this.error.set(null);
    clearTimeout(this.timer); // a fülről elnavigálva a frissítés leáll (visszatéréskor újraindul)
    this.stalled.set(false);
    if (tab === 'merfoldkovek') await Promise.all([this.loadMilestones(), this.loadRunners()]);
    if (tab === 'mi') {
      this.polls = 0;
      await Promise.all([this.loadReviews(), this.loadQuota()]);
    }
    if (tab === 'fajlok' && !this.tree()) await this.run(async () => this.tree.set(await firstValueFrom(this.api.tree(this.id, this.fileRef()))));
  }

  memberLine(t: Team): string { return t.members.map((m) => m.name + (m.role ? ` (${m.role})` : '')).join(', '); }
  kindLabel(kind: TeamMilestone['kind']): string { return MILESTONE_KIND_LABEL[kind]; }
  syncLabel(s: string | null): string { return s ? (SYNC_LABEL[s] ?? s) : 'még nem futott'; }
  /** A sikertelen / csonka (és a BE szerint nem számolt) befejezett átnézés sem a csapat, sem a tanár keretéből nem fogy. */
  notCounted(x: TeamRepoReview): boolean {
    return x.status !== 'queued' && x.status !== 'running' && (x.status === 'failed' || x.status === 'truncated' || !x.counted);
  }
  severityLabel(s: CodeSuggestion): string { return s.severity === 'hiba' ? 'Hiba' : s.severity === 'dicséret' ? 'Dicséret' : 'Javaslat'; }

  // ---- csapatadatok ----

  startEdit(t: Team): void {
    this.editName.set(t.name);
    this.editTitle.set(t.projectTitle ?? '');
    this.editExam.set(t.examDate ?? '');
    this.editRoles.set(Object.fromEntries(t.members.map((m) => [m.userId, m.role ?? ''])));
  }

  setRole(userId: number, role: string): void { this.editRoles.update((r) => ({ ...r, [userId]: role })); }

  /** A vizsga dátuma a BE-n nem törölhető (üresen hagyva változatlan); az üres téma / szerepkör törli az értéket. */
  async saveDetails(): Promise<void> {
    const body: TeamUpdate = {
      name: this.editName().trim(), projectTitle: this.editTitle().trim(),
      roles: Object.fromEntries(Object.entries(this.editRoles()).map(([id, role]) => [id, role.trim() || null])),
      ...(this.editExam() ? { examDate: this.editExam() } : {}),
    };
    await this.run(async () => {
      this.team.set(await firstValueFrom(this.api.update(this.id, body)));
      // a beadás alapértelmezett határideje a vizsga dátumából számol
      if (this.tab() === 'merfoldkovek') this.milestones.set(await firstValueFrom(this.api.milestones(this.id)));
    });
  }

  // ---- mérföldkövek ----

  async check(): Promise<void> { await this.run(async () => this.milestones.set(await firstValueFrom(this.api.checkMilestones(this.id)))); }
  saveDue(m: TeamMilestone, value: string): Promise<void> { return this.updateMilestone(m, value ? { dueDate: value } : { clearDueDate: true }); }
  savePaths(m: TeamMilestone, text: string): Promise<void> {
    return this.updateMilestone(m, { requiredPaths: text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0) });
  }
  savePreset(m: TeamMilestone, preset: string, dir: string | null): Promise<void> {
    return this.updateMilestone(m, preset ? { testPreset: preset, testDir: dir ?? '' } : { clearTest: true });
  }

  async tick(m: TeamMilestone, done: boolean): Promise<void> {
    const ok = await this.run(async () => this.milestones.set(await firstValueFrom(this.api.tickMilestone(this.id, m.id, done, this.note().trim() || null))));
    if (ok) this.note.set('');
    else await this.loadMilestones(false);
  }

  async runTest(m: TeamMilestone): Promise<void> {
    await this.run(async () => {
      const result = await firstValueFrom(this.api.testMilestone(this.id, m.id));
      this.testResult.update((r) => ({ ...r, [m.id]: result }));
    });
  }

  async addMilestone(): Promise<void> {
    const title = this.newMilestone().trim();
    if (title.length < 2) return;
    if (await this.run(async () => this.milestones.set(await firstValueFrom(this.api.addMilestone(this.id, { title }))))) this.newMilestone.set('');
  }

  async deleteMilestone(m: TeamMilestone): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Mérföldkő törlése', message: `A(z) „${m.title}” mérföldkő a pipájával és az ellenőrzésével együtt törlődik.`, danger: true, confirmLabel: 'Törlés' }))) return;
    await this.run(async () => this.milestones.set(await firstValueFrom(this.api.deleteMilestone(this.id, m.id))));
  }

  /** Hibás mentésnél a lista a szerverről újratöltődik, hogy a mezőkben ne maradjon el nem mentett érték. */
  private async updateMilestone(m: TeamMilestone, edit: TeamMilestoneEdit): Promise<void> {
    if (!(await this.run(async () => this.milestones.set(await firstValueFrom(this.api.updateMilestone(this.id, m.id, edit)))))) await this.loadMilestones(false);
  }

  /** Súgó presetenként: mi a tesztmappa és mi kerül a futásba (BE: TestRunSources). */
  testHelp(preset: string): string {
    const language = this.runners().find((r) => r.key === preset)?.language;
    const hint = preset === 'python-unittest' ? ' Python esetén a szülőmappából importáláshoz csomag-szerkezet kell (__init__.py).'
      : language === 'C#' ? ' Tesztmappa: a tesztprojekt mappája, pl. backend/Api.Tests – a ProjectReference-szel hivatkozott projektek is fordulnak, a Program.cs nélkül.'
      : language === 'Java' ? ' Tesztmappa: a Maven/Gradle modul gyökere, pl. backend – a src/main/java és a src/test/java fordul (letöltés nélkül, csak egységteszt).'
      : preset === 'node-test' ? '' : ' Tesztmappa: a JS/TS-projekt mappája, pl. frontend – a tároló jest/vitest-konfigja nem számít (rögzített beállítás).';
    return `A tesztfuttatás a megadott mappa fájljait küldi először, majd a tesztelt kódot (legfeljebb 150 fájl / 2 MB).${hint}`;
  }

  /** A presetlista csapatonként állandó: egyszer töltődik; hibánál a legördülő csak a „nincs” opciót mutatja (a mérföldkövek hibája jelez). */
  private async loadRunners(): Promise<void> {
    if (this.runners().length) return;
    this.runners.set(await firstValueFrom(this.api.testRunners()).catch(() => []));
  }

  private async loadMilestones(showError = true): Promise<void> {
    try {
      this.milestones.set(await firstValueFrom(this.api.milestones(this.id)));
    } catch (e) {
      if (showError) this.error.set(extractErrorMessage(e, 'A mérföldkövek nem tölthetők be.'));
    }
  }

  // ---- MI-átnézés ----

  async requestReview(): Promise<void> {
    if (await this.run(() => firstValueFrom(this.api.requestReview(this.id, this.reviewBranch())))) {
      this.polls = 0;
      await Promise.all([this.loadReviews(), this.loadQuota()]);
    }
  }

  refreshReviews(): Promise<void> {
    this.polls = 0;
    return this.loadReviews();
  }

  /** Futó átnézésnél 5 mp-enként frissül (legfeljebb 3 percig, utána kézi frissítés), csak az MI-fülön; a frissítés végén a tanári keret is. */
  private async loadReviews(): Promise<void> {
    const wasRunning = this.running();
    try {
      this.reviews.set(await firstValueFrom(this.api.reviews(this.id)));
    } catch (e) {
      this.error.set(extractErrorMessage(e, 'Az átnézések nem tölthetők be.'));
    }
    clearTimeout(this.timer);
    this.stalled.set(false);
    if (this.destroyed || this.tab() !== 'mi') return;
    if (!this.running()) {
      if (wasRunning) await this.loadQuota(); // a lefutott átnézés után a keret változhatott
      return;
    }
    if (this.polls++ < MAX_POLLS) this.timer = setTimeout(() => void this.loadReviews(), POLL_MS);
    else this.stalled.set(true);
  }

  private async loadQuota(): Promise<void> {
    const q = await firstValueFrom(this.reports.getAiHelperQuota()).catch(() => null);
    this.quota.set(q?.repoReview ?? null);
  }

  // ---- fájlok ----

  async selectRef(ref: string | null): Promise<void> {
    this.fileRef.set(ref);
    this.openFiles.set({});
    this.openPath.set(null);
    this.fileNote.set(null);
    await this.run(async () => this.tree.set(await firstValueFrom(this.api.tree(this.id, ref))));
  }

  async openFile(path: string): Promise<void> {
    await this.run(async () => {
      const f = await firstValueFrom(this.api.file(this.id, this.tree()?.ref ?? 'main', path));
      this.fileNote.set(f.binary ? 'Bináris fájl – itt nem jeleníthető meg.' : f.tooLarge ? 'Túl nagy fájl (200 KB fölött) – klónozd a megnézéséhez.' : null);
      this.openFiles.set(f.content !== null ? { [f.path]: f.content } : {});
      this.openPath.set(f.content !== null ? f.path : null);
    });
  }

  /** Igaz, ha a művelet sikerült; a hiba (a BE magyar üzenete: zárolt tároló 403, archivált csapat 409, keret) a közös hibasorba kerül. */
  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      return true;
    } catch (e) {
      this.error.set(extractErrorMessage(e, 'A művelet nem sikerült.'));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
