import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TeacherTeamService } from '../../services/team/teacher-team.service';
import { GroupService } from '../../services/group/group.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { GroupMemberDto } from '../../models/group.model';
import { Team } from '../../models/team.model';

/** A BE (TeamService) létszám-szabálya: 2–3 fős csapat. */
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 3;

/**
 * A csoport vizsgaremek-csapatai (PATRICKS-FEJLESZTOMUHELY-BC-TERV.md 3.1): javaslatok jóváhagyása / elutasítása, új csapat a csoport tagjaiból,
 * tagcsere (előbb felvétel, utána kivétel - a csapat sosem lehet 2 főnél kisebb), archiválás.
 */
@Component({
  selector: 'app-csoport-csapatok',
  imports: [RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <p class="text-sm text-text-muted max-w-2xl">Vizsgaremek-csapatok (2–3 fő, mindenkinek Prémium kell – az iskolai licenc is az). A diákok javasolhatnak csapatot, te hagyod jóvá;
        vagy itt állítod össze. A csapat közös Git-tárolót kap; a munkájukat a csapat oldalán követed.</p>
      @if (error()) { <p class="text-danger text-sm" role="alert">{{ error() }}</p> }
      <ul class="space-y-3" aria-label="Csapatok">
        @for (t of teams(); track t.id) {
          <li class="card p-4 space-y-3 min-w-0" [attr.data-testid]="'team-' + t.id">
            <div class="flex flex-wrap items-center gap-2">
              <a class="font-bold underline break-all" [routerLink]="['/csapatok', t.id]">{{ t.name }}</a>
              @if (t.projectTitle) { <span class="text-sm text-text-muted">{{ t.projectTitle }}</span> }
              <span class="badge" [class.badge-warning]="t.status === 'proposed'" [class.badge-success]="t.status === 'active'"
                [class.badge-neutral]="t.status === 'archived'">{{ statusLabel(t) }}</span>
            </div>
            <p class="text-sm">{{ memberNames(t) }}</p>
            @if (t.status === 'active') {
              @if (!t.repo) {
                <p class="text-sm flex flex-wrap items-center gap-2">A közös tároló még nem jött létre.
                  <button class="btn btn-ghost" type="button" (click)="ensureRepo(t)" [disabled]="busy()">Tároló létrehozása</button></p>
              } @else if (t.repo.locked) { <p class="text-sm text-danger">A tárolót az adminisztrátor zárolta.</p> }
            }

            @if (t.status === 'proposed') {
              <div class="flex flex-wrap gap-2 items-end">
                <button class="btn btn-primary" type="button" (click)="approve(t)" [disabled]="busy()">Jóváhagyás</button>
                @if (rejectingId() === t.id) {
                  <label class="text-sm flex-1 min-w-48">Elutasítás oka (a diákok látják, nem kötelező)
                    <input class="input w-full" maxlength="300" [ngModel]="rejectReason()" (ngModelChange)="rejectReason.set($event)" /></label>
                  <button class="btn btn-danger" type="button" (click)="reject(t)" [disabled]="busy()">Elutasítás</button>
                  <button class="btn btn-ghost" type="button" (click)="rejectingId.set(null)" [disabled]="busy()">Mégse</button>
                } @else {
                  <button class="btn btn-ghost" type="button" (click)="startReject(t)" [disabled]="busy()">Elutasítás…</button>
                }
              </div>
            }

            @if (t.status === 'proposed' || t.status === 'active') {
              <div class="flex flex-wrap gap-2 items-end">
                @for (m of t.members; track m.userId) {
                  <button class="btn btn-ghost min-h-8" type="button" (click)="removeMember(t, m.userId, m.name)" [disabled]="busy() || t.members.length <= minMembers"
                    [attr.aria-label]="'Kivétel a csapatból: ' + m.name">{{ m.name }} ✕</button>
                }
                @if (t.members.length < maxMembers && !freeMembers().length) {
                  <span class="text-xs text-text-muted" data-testid="no-free-member">Nincs szabad tag</span>
                } @else if (t.members.length < maxMembers) {
                  <label class="text-sm">Tag felvétele
                    <select #addSelect class="input" [disabled]="busy()" (change)="addMember(t, +addSelect.value); addSelect.value = ''">
                      <option value="">Válassz…</option>
                      @for (m of freeMembers(); track m.userId) { <option [value]="m.userId">{{ m.name }}</option> }
                    </select></label>
                }
                @if (t.status === 'active') {
                  <button class="btn btn-ghost" type="button" (click)="archive(t)" [disabled]="busy()">Archiválás</button>
                }
              </div>
              @if (t.members.length <= minMembers) {
                <p class="text-xs text-text-muted">Tagcsere: előbb vedd fel az új tagot, utána vedd ki a régit (a csapat legalább 2 fős).</p>
              }
            }
          </li>
        } @empty { <li class="text-sm text-text-muted">Még nincs csapat ebben a csoportban.</li> }
      </ul>

      <form class="card p-4 space-y-3" (ngSubmit)="create()">
        <h3 class="font-bold">Új csapat</h3>
        <label class="text-sm block">Csapatnév <input class="input w-full" name="name" maxlength="80" [ngModel]="newName()" (ngModelChange)="newName.set($event)" /></label>
        <label class="text-sm block">Vizsgaremek témája (nem kötelező)
          <input class="input w-full" name="title" maxlength="120" [ngModel]="newTitle()" (ngModelChange)="newTitle.set($event)" /></label>
        <fieldset class="text-sm space-y-1"><legend class="mb-1">Tagok (2–3 fő)</legend>
          @for (m of freeMembers(); track m.userId) {
            <label class="flex items-center gap-2 min-h-8"><input type="checkbox" [checked]="selected().has(m.userId)"
              [disabled]="!selected().has(m.userId) && selected().size >= maxMembers" (change)="toggle(m.userId)" /> {{ m.name }}</label>
          } @empty { <p class="text-text-muted">Nincs csapat nélküli tag a csoportban.</p> }
        </fieldset>
        <button class="btn btn-primary" type="submit" [disabled]="busy() || !canCreate()">Csapat létrehozása</button>
      </form>
    </div>
  `,
})
export class CsoportCsapatokComponent implements OnInit {
  private readonly api = inject(TeacherTeamService);
  private readonly groups = inject(GroupService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  readonly groupId = input.required<number>();
  /** A csapat-funkció ki van kapcsolva (BE: 404 FeatureDisabled) - a szülő elrejti a fület. */
  readonly unavailable = output<void>();
  readonly minMembers = MIN_MEMBERS;
  readonly maxMembers = MAX_MEMBERS;
  readonly teams = signal<Team[]>([]);
  readonly members = signal<GroupMemberDto[]>([]);
  readonly selected = signal<Set<number>>(new Set());
  readonly newName = signal('');
  readonly newTitle = signal('');
  /** Melyik javaslat elutasítása van nyitva (egyszerre egy - az ok-mező közös). */
  readonly rejectingId = signal<number | null>(null);
  readonly rejectReason = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** A csoport azon tagjai, akik nincsenek javasolt vagy aktív csapatban (más csoport csapatát és a Prémiumot a BE ellenőrzi). */
  readonly freeMembers = computed(() => {
    const taken = new Set(this.teams().filter((t) => t.status === 'proposed' || t.status === 'active').flatMap((t) => t.members.map((m) => m.userId)));
    return this.members().filter((m) => !taken.has(m.userId));
  });
  readonly canCreate = computed(() => this.newName().trim().length >= 2 && this.selected().size >= MIN_MEMBERS && this.selected().size <= MAX_MEMBERS);

  async ngOnInit(): Promise<void> {
    try {
      const [teams, members] = await Promise.all([firstValueFrom(this.api.forGroup(this.groupId())), firstValueFrom(this.groups.getMembers(this.groupId()))]);
      this.teams.set(teams);
      this.members.set(members);
    } catch (e) {
      if ((e as { status?: number }).status === 404) this.unavailable.emit();
      else this.error.set(extractErrorMessage(e, 'A csapatok nem tölthetők be.'));
    }
  }

  statusLabel(t: Team): string { return t.status === 'proposed' ? 'jóváhagyásra vár' : t.status === 'archived' ? 'archivált' : 'aktív'; }
  memberNames(t: Team): string { return t.members.map((m) => m.name + (m.role ? ` (${m.role})` : '')).join(', '); }

  toggle(userId: number): void {
    const next = new Set(this.selected());
    if (next.has(userId)) next.delete(userId); else if (next.size < MAX_MEMBERS) next.add(userId);
    this.selected.set(next);
  }

  async create(): Promise<void> {
    if (!this.canCreate()) return;
    await this.run(async () => {
      await firstValueFrom(this.api.create(this.groupId(), this.newName().trim(), [...this.selected()], this.newTitle().trim() || null));
      this.selected.set(new Set());
      this.newName.set('');
      this.newTitle.set('');
      this.toast.success('A csapat elkészült, a közös tárolója létrejött.');
    });
  }

  async approve(t: Team): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.approve(t.id));
      this.toast.success(`A(z) „${t.name}” csapatot jóváhagytad, a közös tárolója létrejött.`);
    });
  }

  startReject(t: Team): void {
    this.rejectReason.set('');
    this.rejectingId.set(t.id);
  }

  async reject(t: Team): Promise<void> {
    if (!(await this.confirm.ask({
      title: 'Csapatjavaslat elutasítása', message: `A(z) „${t.name}” javaslatot elutasítod; a diákok értesítést kapnak.`, danger: true, confirmLabel: 'Elutasítás',
    }))) return;
    const ok = await this.run(() => firstValueFrom(this.api.reject(t.id, this.rejectReason().trim() || null)));
    if (ok) {
      this.rejectReason.set('');
      this.rejectingId.set(null);
    }
  }

  async addMember(t: Team, userId: number): Promise<void> {
    if (userId) await this.run(() => firstValueFrom(this.api.addMember(t.id, userId)));
  }

  async removeMember(t: Team, userId: number, name: string): Promise<void> {
    if (!(await this.confirm.ask({
      title: 'Tag kivétele', message: `${name} kikerül a(z) „${t.name}” csapatból, és a csapat tárolóját sem éri el többé (a munkája a tárolóban marad).`,
      danger: true, confirmLabel: 'Kivétel',
    }))) return;
    await this.run(() => firstValueFrom(this.api.removeMember(t.id, userId)));
  }

  async archive(t: Team): Promise<void> {
    if (!(await this.confirm.ask({
      title: 'Csapat archiválása', message: `A(z) „${t.name}” tárolója csak olvasható lesz; a diákok klónozhatják, pusholni nem tudnak. Az archiválás nem vonható vissza.`,
      danger: true, confirmLabel: 'Archiválás',
    }))) return;
    await this.run(() => firstValueFrom(this.api.archive(t.id)));
  }

  async ensureRepo(t: Team): Promise<void> { await this.run(() => firstValueFrom(this.api.ensureRepo(t.id))); }

  /** A művelet után a listát a szerverről frissíti (a státusz és a tagság ott dől el); hibánál is, hogy elavult állapot ne maradjon. */
  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    let ok = false;
    try {
      await action();
      ok = true;
    } catch (e) {
      this.error.set(extractErrorMessage(e, 'A művelet nem sikerült.'));
    }
    try {
      this.teams.set(await firstValueFrom(this.api.forGroup(this.groupId())));
    } catch {
      // a lista frissítése nem sikerült - a művelet eredménye (vagy hibája) már látszik
    } finally {
      this.busy.set(false);
    }
    return ok;
  }
}
