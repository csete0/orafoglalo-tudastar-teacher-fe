import { ChangeDetectionStrategy, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GroupStore } from '../../../services/group/group.store';
import { GroupSeatStore } from '../../../services/group/group-seat.store';
import { SchoolStore } from '../../../services/school/school.store';
import { GroupDto } from '../../../models/group.model';
import { GroupSeatOverviewDto } from '../../../models/group-seat.model';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../../shared/local-spinner/local-spinner.component';
import { CopyButtonComponent } from '../../../shared/copy-button/copy-button.component';
import { QrCodeComponent } from '../../../shared/qr-code/qr-code.component';

/**
 * Csoportoldal „Beállítások” fül: név + intézmény-kötés, Meghívó kód (a régi „Meghívó” fül),
 * Intézményi helyek (a régi „Helyek” fül) és Archiválás - a ritka/veszélyes műveletek nem a fejlécben.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-beallitasok',
  imports: [DatePipe, FormsModule, IconComponent, LocalSpinnerComponent, CopyButtonComponent, QrCodeComponent],
  template: `
    @let g = group();
    <div class="max-w-4xl space-y-10">
      <section aria-labelledby="csoport-adatai">
        <h2 id="csoport-adatai" class="text-lg font-bold mb-3">Csoport adatai</h2>
        <div class="card p-5 space-y-4 text-sm">
          <!-- UI-UX-T4: a név szerkeszthető - egy elgépelt vagy évfordulóval elavuló név („11.A” → „12.A”)
               új csoporttal csak a tagság és az eredmények elvágásával lett volna „javítható”. -->
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-text-muted">Név:</span>
            @if (!renaming()) {
              <span class="font-semibold">{{ g.name }}</span>
              @if (!g.isArchived) {
                <button type="button" (click)="startRename()" class="btn btn-ghost !px-2 !py-1 !text-xs">Átnevezés</button>
              }
            } @else {
              <input [(ngModel)]="renameValue" maxlength="255" class="input !w-auto flex-1 min-w-0" aria-label="Csoport neve"
                (keyup.enter)="saveRename()" (keyup.escape)="renaming.set(false)" />
              <button type="button" (click)="saveRename()"
                [disabled]="!renameValue.trim() || store.loading()" class="btn btn-primary">Mentés</button>
              <button type="button" (click)="renaming.set(false)" class="btn btn-ghost">Mégse</button>
            }
          </div>
          @if (schoolStore.schools().length > 0) {
            <div class="flex items-center gap-2">
              <label for="csoport-intezmeny" class="text-text-muted">Intézmény:</label>
              <select id="csoport-intezmeny" [ngModel]="displaySchoolId()" (ngModelChange)="changeSchool($event)"
                class="input !w-auto max-w-full min-w-0">
                <option [ngValue]="null">Nincs intézményhez kötve (magántanár)</option>
                @for (school of schoolStore.schools(); track school.id) {
                  <option [ngValue]="school.id">{{ school.name }}</option>
                }
              </select>
            </div>
          } @else if (g.schoolName) {
            <p class="text-text-muted">Intézmény: {{ g.schoolName }}</p>
          }
          @if (schoolStore.error()) {
            <p class="text-danger">{{ schoolStore.error() }}</p>
          }
        </div>
      </section>

      <section aria-labelledby="meghivo">
        <h2 id="meghivo" class="text-lg font-bold mb-3 scroll-mt-20">Meghívó kód</h2>
        <div class="card p-5 space-y-3">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="icon-tile icon-tile-primary">
              <app-icon name="link" class="w-6 h-6 block" />
            </div>
            <p class="text-sm">Meghívó kód: <code class="font-bold">{{ g.inviteCode }}</code></p>
            <app-copy-button [value]="g.inviteCode" label="Meghívó kód" />
            @if (g.isJoinEnabled) {
              <span class="badge badge-success shrink-0">Aktív</span>
            } @else {
              <span class="badge badge-neutral shrink-0">Jelentkezés letiltva</span>
            }
          </div>
          <p class="text-sm break-all flex items-center gap-2 flex-wrap">
            <span>Csatlakozási link: <code>{{ joinLink(g.inviteCode) }}</code></span>
            <app-copy-button [value]="joinLink(g.inviteCode)" label="Csatlakozási link" />
            <button type="button" (click)="qrVisible.set(!qrVisible())" class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0">
              {{ qrVisible() ? 'QR elrejtése' : 'QR-kód kivetítéshez' }}
            </button>
          </p>
          <!-- UI-UX-T1: kivetítve a diákok telefonnal beolvassák - nem kell gépelni. -->
          @if (qrVisible()) {
            <div class="flex justify-center py-2">
              <app-qr-code [value]="joinLink(g.inviteCode)" [size]="280" />
            </div>
          }
          <p class="text-xs text-text-muted">A kód nem jár le — a jelentkezést itt tudod ki- vagy bekapcsolni anélkül, hogy a kódot le kellene cserélned.</p>
          <div class="flex gap-2 flex-wrap">
            <button type="button" (click)="regenerateInvite()" [disabled]="store.loading()" class="btn btn-primary">
              Új kód generálása
            </button>
            @if (g.isJoinEnabled) {
              <button type="button" (click)="setJoinEnabled(false)" [disabled]="store.loading()" class="btn btn-danger">
                Jelentkezés letiltása
              </button>
            } @else {
              <button type="button" (click)="setJoinEnabled(true)" [disabled]="store.loading()" class="btn btn-primary">
                Jelentkezés engedélyezése
              </button>
            }
          </div>
        </div>
      </section>

      <section aria-labelledby="helyek">
        <h2 id="helyek" class="text-lg font-bold mb-3 scroll-mt-20">Intézményi helyek</h2>
        @if (seatStore.error()) {
          <p class="text-danger text-sm mb-4">{{ seatStore.error() }}</p>
        }
        @if (seatStore.loading()) {
          <app-local-spinner />
        }
        @if (seatStore.overview(); as seats) {
          @if (!seats.licenseId) {
            <div class="card p-5 text-sm text-text-muted">
              Ehhez a csoporthoz nem tartozik érvényes intézményi licenc.
              A diákok a saját előfizetésüket használják.
            </div>
          } @else {
            <div class="card p-4 mb-4">
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="text-sm">
                  <span class="font-bold">{{ seats.tier === 'premium' ? 'Prémium' : 'Standard' }}</span>
                  licenc ·
                  <span [class.text-danger]="seats.usedSeatsOnLicense >= seats.capacity">
                    {{ seats.usedSeatsOnLicense }}/{{ seats.capacity }} hely használatban
                  </span>
                  <!-- UI-TT-202: usedSeatsOnLicense csak a licenc IdleWindowMinutes-én belül friss helyeket számolja,
                       a lenti lista MINDEN fel nem szabadított helyet felsorol - a magyarázat nélkül a fejléc
                       („0/0”) ellentmondani látszik a listának (admin-intezmenyek.component.ts mintája). -->
                  @if (idleTransferableSeatCount(seats) > 0) {
                    <span class="text-text-muted">
                      ({{ idleTransferableSeatCount(seats) }} tétlen, átadható)
                    </span>
                  }
                  <span class="text-text-muted">(az intézmény összes csoportjával együtt)</span>
                </div>
                @if (seats.holders.length > 0) {
                  <button type="button" (click)="confirmEndLesson()" [disabled]="seatStore.loading()"
                          class="btn btn-danger !px-3 !py-1.5 !text-sm">
                    Óra vége — helyek felszabadítása
                  </button>
                }
              </div>
              <p class="text-xs text-text-muted mt-2">
                Csak ennek a csoportnak a tagjaira hat. Aki épp vizsgázik vagy kvízt ír, attól nem veszi el a helyet.
              </p>
            </div>

            @if (seatStore.lastReleaseResult(); as released) {
              <div class="bg-success-subtle border border-success/40 rounded-xl p-4 mb-4 text-sm">
                <p class="text-success font-bold">{{ released.releasedCount }} hely felszabadítva.</p>
                @if (released.skippedInProgress.length > 0) {
                  <p class="text-text-muted mt-1">
                    Nem érintette (folyamatban lévő vizsga/kvíz):
                    {{ released.skippedInProgress.join(', ') }}
                  </p>
                }
              </div>
            }

            <h3 class="font-bold text-sm mb-2">Helyet használó diákok</h3>
            <ul class="space-y-2 mb-6">
              @for (holder of seats.holders; track holder.userId) {
                <li class="flex justify-between items-center card !rounded-xl p-3 text-sm gap-3">
                  <div class="min-w-0">
                    <p class="truncate">{{ holder.displayName }}</p>
                    <p class="text-xs text-text-muted">
                      <span [class]="holder.isFresh ? 'text-success' : ''">
                        {{ holder.isFresh ? 'aktív' : 'tétlen' }}
                      </span>
                      · utoljára: {{ holder.lastActivityAt | date: 'MM.dd HH:mm' }}
                      @if (holder.hasSessionInProgress) {
                        · <span class="text-warning">vizsga/kvíz folyamatban</span>
                      }
                      @if (holder.inMultipleGroups) {
                        · <span class="text-text-muted">több csoport tagja</span>
                      }
                    </p>
                  </div>
                  <button type="button" (click)="confirmReleaseSeat(holder)" [disabled]="seatStore.loading()"
                          class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0">
                    Felszabadítás
                  </button>
                </li>
              } @empty {
                <li class="text-sm text-text-muted">Jelenleg senki nem használ helyet ebben a csoportban.</li>
              }
            </ul>

            @if (seats.withoutSeat.length > 0) {
              <h3 class="font-bold text-sm mb-2">
                Nem fért be ({{ seats.withoutSeat.length }})
              </h3>
              <p class="text-xs text-text-muted mb-2">
                Ezek a diákok a saját (alacsonyabb) előfizetésüket használják. Aki már fizet
                ugyanazért vagy jobbért, nem szerepel a listában.
              </p>
              <ul class="space-y-1">
                @for (missing of seats.withoutSeat; track missing.userId) {
                  <li class="text-sm flex gap-2">
                    <span>{{ missing.displayName }}</span>
                    <span class="text-text-muted">({{ missing.personalTier }})</span>
                  </li>
                }
              </ul>
            }
          }
        }
      </section>

      <section aria-labelledby="archivalas">
        <h2 id="archivalas" class="text-lg font-bold mb-3">Archiválás</h2>
        <div class="card p-5 flex items-center justify-between gap-3 flex-wrap text-sm">
          @if (!g.isArchived) {
            <p class="text-text-muted">Archivált csoport tagjai nem érik el a kiadott tartalmat; a csoport bármikor visszaállítható.</p>
            <button type="button" (click)="archive()" class="btn btn-danger shrink-0">Archiválás</button>
          } @else {
            <p class="text-text-muted">A csoport archivált.</p>
            <button type="button" (click)="unarchive()" [disabled]="store.loading()" class="btn btn-primary shrink-0">Visszaállítás</button>
          }
        </div>
      </section>
    </div>
  `,
})
export class CsoportBeallitasokComponent implements OnInit {
  readonly group = input.required<GroupDto>();

  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(GroupStore);
  readonly seatStore = inject(GroupSeatStore);
  readonly schoolStore = inject(SchoolStore);

  /** UI-UX-T1: a kivetíthető QR alapból rejtve - csak szándékos megnyitásra. */
  readonly qrVisible = signal(false);
  readonly renaming = signal(false);
  renameValue = '';

  // UI-TT-4: az intézmény-<select> külön, a nézetet vezérlő signalra kötve - a Mégse-ág így vissza tudja
  // állítani a látott értéket akkor is, ha a mögöttes store-állapot közben nem változott.
  readonly displaySchoolId = signal<number | null>(null);

  private readonly syncDisplaySchoolId = effect(() => {
    this.displaySchoolId.set(this.group().schoolId ?? null);
  });

  ngOnInit(): void {
    this.seatStore.load(this.group().id);
    if (this.schoolStore.schools().length === 0) {
      this.schoolStore.loadMine();
    }
  }

  joinLink(code: string): string {
    return `${environment.studentAppUrl}/csoport/csatlakozas?code=${code}`;
  }

  // UI-TT-202: hány listázott hely tétlen (heldSeats - usedSeats ekvivalense a tanári DTO-ban).
  idleTransferableSeatCount(seats: GroupSeatOverviewDto): number {
    return seats.holders.filter((h) => !h.isFresh).length;
  }

  async confirmEndLesson(): Promise<void> {
    if (this.seatStore.loading()) return;
    const holders = this.seatStore.overview()?.holders ?? [];
    const multiGroup = holders.filter((h) => h.inMultipleGroups).length;
    const ok = await this.confirmService.ask({
      message:
        `Felszabadítod a csoport ${holders.length} használatban lévő helyét? ` +
        (multiGroup > 0
          ? `Figyelem: ${multiGroup} diák más csoportnak is tagja — egy diáknak egy helye van, ` +
            'így a felszabadítás a másik óráján is látszani fog. '
          : '') +
        'Aki épp vizsgázik vagy kvízt ír, attól a rendszer nem veszi el a helyet.',
      danger: true,
      confirmLabel: 'Óra vége',
    });
    if (!ok) return;
    this.seatStore.releaseAll(this.group().id);
  }

  async confirmReleaseSeat(holder: { userId: number; displayName: string; inMultipleGroups: boolean }): Promise<void> {
    if (this.seatStore.loading()) return;
    const ok = await this.confirmService.ask({
      message:
        `Felszabadítod ${holder.displayName} helyét? A diák visszaesik a saját előfizetésére. ` +
        (holder.inMultipleGroups
          ? 'Ez a diák más csoportnak is tagja — egy helye van, tehát a másik óráján is elveszíti.'
          : ''),
      danger: true,
      confirmLabel: 'Felszabadítás',
    });
    if (!ok) return;
    this.seatStore.releaseSeat(this.group().id, holder.userId);
  }

  async archive(): Promise<void> {
    // UI-TT-34: az archiválás visszaállítható (unarchive) - a szöveg ezt nem tagadhatja.
    const ok = await this.confirmService.ask({
      message:
        'Biztosan archiválod a csoportot? A tagok elveszítik a tartalom-hozzáférést, amíg a csoport archivált - a csoport Beállítások fülén bármikor visszaállítható.',
      danger: true,
      confirmLabel: 'Archiválás',
    });
    if (!ok) return;
    this.store.archive(this.group().id, () => {
      this.toastService.success('Csoport archiválva.');
      void this.router.navigateByUrl('/csoportok');
    });
  }

  unarchive(): void {
    this.store.unarchive(this.group().id, () => this.toastService.success('Csoport visszaállítva.'));
  }

  async changeSchool(schoolId: number | null): Promise<void> {
    const { id, name } = this.group();
    const previousSchoolId = this.displaySchoolId();
    this.displaySchoolId.set(schoolId);
    if (schoolId !== null) {
      const schoolName = this.schoolStore.schools().find((s) => s.id === schoolId)?.name ?? '';
      const ok = await this.confirmService.ask({
        message: `Biztosan a(z) „${schoolName}” intézményhez kötöd ezt a csoportot? A tagok minden korábbi eredménye láthatóvá válik az intézmény igazgatója számára, és a diákok erről értesítést kapnak.`,
      });
      if (!ok) {
        this.displaySchoolId.set(previousSchoolId);
        return;
      }
    } else if (previousSchoolId !== null) {
      const ok = await this.confirmService.ask({
        message: 'Biztosan visszavonod a csoport intézményhez-kötését? A csoport lekerül az intézményről, és az igazgató a továbbiakban nem látja a diákok eredményeit.',
        danger: true,
        confirmLabel: 'Kötés visszavonása',
      });
      if (!ok) {
        this.displaySchoolId.set(previousSchoolId);
        return;
      }
    }
    this.store.update(
      id,
      // A konkurrencia-token a MOST betöltött csoportból megy vissza: ha időközben más módosította,
      // a backend elutasítja a mentést a néma felülírás helyett.
      { name, schoolId: schoolId ?? undefined, rowVersion: this.group().rowVersion },
      () => this.toastService.success('Csoport frissítve.'),
      // UI-TT-73: sikertelen mentésnél a select visszaáll a ténylegesen mentett értékre.
      () => this.displaySchoolId.set(previousSchoolId),
    );
  }

  startRename(): void {
    this.renameValue = this.group().name;
    this.renaming.set(true);
  }

  saveRename(): void {
    const name = this.renameValue.trim();
    if (!name || this.store.loading()) return;
    // UI-UX-T4: ugyanaz az update-útvonal, mint az intézmény-kötésé - a schoolId a MOST LÁTOTT értékkel megy,
    // hogy a két szerkesztési út ne írhassa felül egymást.
    this.store.update(
      this.group().id,
      { name, schoolId: this.displaySchoolId() ?? undefined, rowVersion: this.group().rowVersion },
      () => {
        this.renaming.set(false);
        this.toastService.success('Csoport átnevezve.');
      },
    );
  }

  regenerateInvite(): void {
    if (this.store.loading()) return;
    this.store.regenerateInvite(this.group().id, () => this.toastService.success('Új meghívó kód generálva.'));
  }

  setJoinEnabled(enabled: boolean): void {
    if (this.store.loading()) return;
    this.store.setJoinEnabled(this.group().id, enabled, () =>
      this.toastService.success(enabled ? 'Jelentkezés engedélyezve.' : 'Jelentkezés letiltva.'),
    );
  }
}
