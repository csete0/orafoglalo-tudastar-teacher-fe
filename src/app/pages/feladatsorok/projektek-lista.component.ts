import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { GroupStore } from '../../services/group/group.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import { ProjectAssignmentDto, ProjectRuntime, RUNTIME_LABELS, TeacherProjectDto } from '../../models/teacher-project.model';
import { TartalomFulekComponent } from './tartalom-fulek.component';

/** Az űrlap állapota egy projekt kiadásához. */
interface AssignDraft {
  groupId: number | null;
  runtime: ProjectRuntime | '';
  opensAt: string;
  dueAt: string;
}

/**
 * Projektműhely a tanári oldalon (PATRICKS-PROJEKTMUHELY-2-TERV.md, F+G fázis): a kész projektek katalógusa (csak
 * olvasás - saját projekt NEM hozható létre) és a kiadás csoportnak (nyitás, határidő, kötött nyelv). A Feladatsorok
 * oldal FÜLE alatt él (a fejléc-navigáció 6 linkre van méretezve - ld. TartalomFulekComponent).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-projektek-lista',
  standalone: true,
  imports: [DatePipe, RouterLink, LocalSpinnerComponent, TartalomFulekComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Projektek</h1>
      <p class="text-sm text-text-muted mt-1">
        A Projektműhely kész, lépésenként ellenőrzött projektjei (adatbázis, backend, weboldal) – kiadhatod a csoportjaidnak.
      </p>
      <app-tartalom-fulek />

      @if (error(); as err) { <p class="text-danger text-sm mt-4">{{ err }}</p> }
      @if (loading()) {
        <app-local-spinner />
      } @else {
        <ul class="space-y-5 mt-6">
          @for (p of projects(); track p.slug) {
            <li class="card p-5" [attr.data-testid]="'project-' + p.slug">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                  <h2 class="text-lg font-bold">{{ p.title }}</h2>
                  <p class="text-sm text-text-muted mt-1">{{ p.summary }}</p>
                  <p class="text-xs text-text-muted mt-2">
                    kb. {{ p.estimatedHours }} óra · {{ p.milestones.length }} lépés · nyelvek: {{ runtimeList(p.runtimes) }}
                  </p>
                  @if (p.examAreas.length) {
                    <p class="text-xs mt-2"><span class="text-text-muted">Érettségi:</span>
                      @for (a of p.examAreas; track a.key) { <span class="chip ml-1">{{ a.name }}</span> }</p>
                  }
                </div>
                <button type="button" class="btn btn-primary shrink-0" (click)="toggleForm(p.slug)" [attr.data-testid]="'assign-open-' + p.slug">
                  {{ openFor() === p.slug ? 'Mégse' : 'Kiadás csoportnak' }}
                </button>
              </div>

              <details class="mt-3 text-sm">
                <summary class="cursor-pointer font-semibold">A lépések</summary>
                <ol class="mt-2 space-y-1 list-decimal pl-5 text-text-muted">
                  @for (m of p.milestones; track m.orderNo) {
                    <li>{{ m.title }} <span class="text-xs">(kb. {{ m.estimatedMinutes }} perc{{ m.kind === 'review' ? ', Kódellenőr' : '' }})</span></li>
                  }
                </ol>
                <p class="text-xs text-text-muted mt-2">Az első {{ p.freeMilestoneCount }} lépés mindenkinek ingyenes; a többihez előfizetés vagy intézményi hely kell (a kiadás ezt nem változtatja meg).</p>
              </details>

              @if (openFor() === p.slug) {
                <form class="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border-default pt-4" (submit)="assign($event, p)" data-testid="assign-form">
                  <label class="text-sm">Csoport
                    <select class="input mt-1" (change)="patch({ groupId: +$any($event.target).value || null })" data-testid="assign-group">
                      <option value="">Válassz csoportot…</option>
                      @for (g of assignableGroups(p); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                    </select>
                  </label>
                  <label class="text-sm">Nyelv
                    <select class="input mt-1" (change)="patch({ runtime: $any($event.target).value })" data-testid="assign-runtime">
                      <option value="">A diák választ</option>
                      @for (r of p.runtimes; track r) { <option [value]="r">Csak {{ runtimeLabels[r] }}</option> }
                    </select>
                  </label>
                  <label class="text-sm">Nyílik (nem kötelező)
                    <input type="datetime-local" class="input mt-1" (change)="patch({ opensAt: $any($event.target).value })" />
                  </label>
                  <label class="text-sm">Határidő (nem kötelező)
                    <input type="datetime-local" class="input mt-1" (change)="patch({ dueAt: $any($event.target).value })" data-testid="assign-due" />
                  </label>
                  @if (formError(); as err) { <p class="text-danger text-sm sm:col-span-2" role="alert">{{ err }}</p> }
                  <div class="sm:col-span-2">
                    <button type="submit" class="btn btn-primary" [disabled]="saving() || !draft().groupId" data-testid="assign-submit">Kiadás</button>
                  </div>
                </form>
              }

              @if (p.assignments.length) {
                <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wide mt-5 mb-2">Kiadva</h3>
                <ul class="space-y-2">
                  @for (a of p.assignments; track a.id) {
                    <li class="rounded-xl border border-border-default p-3 text-sm" [attr.data-testid]="'assignment-' + a.id">
                      <div class="flex items-center gap-3 flex-wrap">
                        <div class="min-w-0 flex-1">
                          <p class="font-semibold">{{ a.groupName }}</p>
                          <p class="text-xs text-text-muted">
                            {{ a.startedCount }}/{{ a.memberCount }} elkezdte · {{ a.completedCount }} kész
                            @if (a.runtime) { · csak {{ runtimeLabels[a.runtime] }} }
                            @if (a.opensAt) { · nyílik: {{ utc(a.opensAt) | date: 'yyyy.MM.dd. HH:mm' }} }
                            @if (a.dueAt) { · határidő: {{ utc(a.dueAt) | date: 'yyyy.MM.dd. HH:mm' }} }
                          </p>
                        </div>
                        <a class="btn btn-primary !px-2 !py-1 !text-xs" [routerLink]="['/feladatsorok/projektek/kiadas', a.id]">Osztály-nézet</a>
                        <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="revoke(p, a)">Visszavonás</button>
                      </div>
                      @if (a.membersWithoutFullAccess > 0) {
                        <p class="text-xs text-warning mt-2" data-testid="access-warning">
                          {{ a.membersWithoutFullAccess }} diáknak nincs teljes hozzáférése – csak az első {{ a.freeMilestoneCount }} lépésig jut el
                          (előfizetéssel vagy intézményi hellyel tovább).
                        </p>
                      }
                    </li>
                  }
                </ul>
              }
            </li>
          } @empty {
            <li class="text-sm text-text-muted">Még nincs kiadható projekt.</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .chip { display: inline-block; padding: 0.0625rem 0.5rem; border-radius: 999px; background: var(--color-bg-element); font-weight: 600; }
  `],
})
export class ProjektekListaComponent implements OnInit {
  private readonly api = inject(TeacherProjectService);
  private readonly groups = inject(GroupStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly runtimeLabels = RUNTIME_LABELS;
  readonly utc = parseUtc;
  readonly projects = signal<TeacherProjectDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly openFor = signal<string | null>(null);
  readonly draft = signal<AssignDraft>({ groupId: null, runtime: '', opensAt: '', dueAt: '' });
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly activeGroups = computed(() => this.groups.activeGroups());

  ngOnInit(): void {
    this.groups.loadMine();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list().pipe(take(1), finalize(() => this.loading.set(false))).subscribe({
      next: (projects) => this.projects.set(projects),
      error: (e) => this.error.set(extractErrorMessage(e, 'A projektek betöltése sikertelen.')),
    });
  }

  /** Csak az aktív csoportok, amelyeknek ez a projekt még nincs kiadva. */
  assignableGroups(p: TeacherProjectDto) {
    const taken = new Set(p.assignments.map((a) => a.groupId));
    return this.activeGroups().filter((g) => !taken.has(g.id));
  }

  toggleForm(slug: string): void {
    this.openFor.set(this.openFor() === slug ? null : slug);
    this.draft.set({ groupId: null, runtime: '', opensAt: '', dueAt: '' });
    this.formError.set(null);
  }

  patch(change: Partial<AssignDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  runtimeList(runtimes: ProjectRuntime[]): string {
    return runtimes.map((r) => RUNTIME_LABELS[r]).join(', ');
  }

  assign(event: Event, p: TeacherProjectDto): void {
    event.preventDefault();
    const d = this.draft();
    if (!d.groupId) return;
    if (d.opensAt && d.dueAt && new Date(d.opensAt) > new Date(d.dueAt)) {
      this.formError.set('A határidő nem lehet korábbi, mint a nyitás.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    // A datetime-local érték helyi idő - ISO (UTC) alakra váltjuk, mint a feladatsor-kiadásnál.
    this.api.assign(p.slug, {
      groupId: d.groupId,
      runtime: d.runtime || null,
      opensAt: d.opensAt ? new Date(d.opensAt).toISOString() : null,
      dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : null,
    }).pipe(take(1), finalize(() => this.saving.set(false))).subscribe({
      next: (assignment) => {
        this.projects.update((list) => list.map((x) => (x.slug === p.slug ? { ...x, assignments: [assignment, ...x.assignments] } : x)));
        this.openFor.set(null);
        this.toast.success(`Kiadva: ${p.title} – ${assignment.groupName}`);
      },
      error: (e) => this.formError.set(extractErrorMessage(e, 'A kiadás sikertelen.')),
    });
  }

  async revoke(p: TeacherProjectDto, a: ProjectAssignmentDto): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Kiadás visszavonása',
      message: `Visszavonod a(z) „${p.title}” kiadását a(z) ${a.groupName} csoportnak? A diákok munkája megmarad.`,
      confirmLabel: 'Visszavonás',
    });
    if (!ok) return;
    this.api.revoke(a.id).pipe(take(1)).subscribe({
      next: () => {
        this.projects.update((list) => list.map((x) => (x.slug === p.slug ? { ...x, assignments: x.assignments.filter((y) => y.id !== a.id) } : x)));
        this.toast.success('A kiadás visszavonva.');
      },
      error: (e) => this.toast.danger(extractErrorMessage(e, 'A visszavonás sikertelen.')),
    });
  }
}
