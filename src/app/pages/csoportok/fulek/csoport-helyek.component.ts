import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { GroupSeatStore } from '../../../services/group/group-seat.store';
import { GroupSeatOverviewDto } from '../../../models/group-seat.model';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { LocalSpinnerComponent } from '../../../shared/local-spinner/local-spinner.component';

/**
 * A csoport „Beállítások” fülének „Intézményi helyek” szakasza (a régi „Helyek” fül): licenc-kihasználtság,
 * helyet használó diákok felszabadítással, „Óra vége”. A betöltést (`GroupSeatStore.load`) a szülő indítja.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-helyek',
  imports: [DatePipe, LocalSpinnerComponent],
  template: `
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
  `,
})
export class CsoportHelyekComponent {
  readonly groupId = input.required<number>();

  private readonly confirmService = inject(ConfirmService);
  readonly seatStore = inject(GroupSeatStore);

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
    this.seatStore.releaseAll(this.groupId());
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
    this.seatStore.releaseSeat(this.groupId(), holder.userId);
  }
}
