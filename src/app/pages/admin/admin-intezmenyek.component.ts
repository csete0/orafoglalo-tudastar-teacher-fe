import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSchoolStore } from '../../services/admin/admin-school.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-intezmenyek',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Intézmények (admin)</h1>
      <p class="text-sm text-text-muted mt-1">Minden intézmény áttekintése és duplikátumok egyesítése</p>
      <div class="hairline"></div>

      @if (store.lastMergeResult(); as result) {
        <div class="bg-success-subtle border border-success/40 rounded-xl p-4 mb-4 text-sm">
          <p class="text-success font-bold mb-1">Egyesítés sikeres.</p>
          <p class="text-text-muted">
            {{ result.movedGroups }} csoport, {{ result.movedMemberships }} tagság átkerült
            @if (result.mergedDuplicateMemberships > 0) {
              , {{ result.mergedDuplicateMemberships }} átfedő tagság összevonva
            }.
          </p>
        </div>
      }

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      @if (store.loading()) {
        <app-local-spinner />
      }

      <div class="card p-5 mb-6">
        <h2 class="font-bold mb-3">Intézmények egyesítése</h2>
        <p class="text-sm text-text-muted mb-3">
          Két véletlenül duplikáltan létrejött intézmény egyesíthető: a forrás összes tanára és csoportja
          átkerül a célba, a forrás intézmény törlődik.
        </p>
        <div class="flex gap-3 items-end flex-wrap">
          <div>
            <label class="text-xs text-text-muted block mb-1">Forrás (törlődik)</label>
            <select [(ngModel)]="sourceId" name="sourceId" class="input !w-auto min-w-48">
              <option [ngValue]="null">Válassz…</option>
              @for (school of store.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="text-xs text-text-muted block mb-1">Cél (megmarad)</label>
            <select [(ngModel)]="targetId" name="targetId" class="input !w-auto min-w-48">
              <option [ngValue]="null">Válassz…</option>
              @for (school of store.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          </div>
          <button (click)="confirmMerge()" [disabled]="!canMerge() || store.loading()" class="btn btn-primary !px-3 !py-1.5">
            Egyesítés
          </button>
        </div>
      </div>

      <ul class="space-y-3">
        @for (school of store.schools(); track school.id) {
          <li class="card p-4 flex gap-3">
            <div class="icon-tile icon-tile-primary">
              <app-icon name="building" class="w-6 h-6 block" />
            </div>
            <div class="min-w-0">
              <p class="font-medium">{{ school.name }}</p>
              @if (school.city) {
                <p class="text-sm text-text-muted">{{ school.city }}</p>
              }
              @if (school.adminDisplayNames.length > 0) {
                <p class="text-sm text-text-muted">Igazgató: {{ school.adminDisplayNames.join(', ') }}</p>
              }
              <p class="text-xs text-text-muted mt-1">
                {{ school.teacherCount }} tanár · {{ school.groupCount }} csoport ·
                létrehozva {{ school.createdAt | date: 'yyyy.MM.dd' }}
              </p>
            </div>
          </li>
        } @empty {
          @if (!store.loading()) {
            <li class="flex flex-col items-center py-10 gap-3">
              <div class="icon-tile icon-tile-neutral">
                <app-icon name="building" class="w-6 h-6 block" />
              </div>
              <p class="font-semibold">Nincs még intézmény.</p>
            </li>
          }
        }
      </ul>
    </div>
  `,
})
export class AdminIntezmenyekComponent {
  readonly store = inject(AdminSchoolStore);
  private readonly confirmService = inject(ConfirmService);

  sourceId: number | null = null;
  targetId: number | null = null;

  constructor() {
    this.store.load();
  }

  canMerge(): boolean {
    return this.sourceId !== null && this.targetId !== null && this.sourceId !== this.targetId;
  }

  async confirmMerge(): Promise<void> {
    if (!this.canMerge() || this.sourceId === null || this.targetId === null || this.store.loading()) return;

    const source = this.store.schools().find((s) => s.id === this.sourceId);
    const target = this.store.schools().find((s) => s.id === this.targetId);
    if (!source || !target) return;

    const ok = await this.confirmService.ask({
      message:
        `Biztosan egyesíted a(z) „${source.name}” intézményt a(z) „${target.name}” intézménybe? ` +
        `Minden tanára és csoportja átkerül, a(z) „${source.name}” törlődik. Ez nem vonható vissza.`,
      danger: true,
      confirmLabel: 'Egyesítés',
    });
    if (!ok) return;

    // Siker-visszajelzés itt nem toast: a lastMergeResult panel részletes
    // összegzést ad (átkerült csoportok/tagságok száma).
    this.store.merge(this.sourceId, this.targetId);
    this.sourceId = null;
    this.targetId = null;
  }
}
