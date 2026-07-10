import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSchoolStore } from '../../services/admin/admin-school.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-intezmenyek',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-4">Intézmények (admin)</h1>

      @if (store.lastMergeResult(); as result) {
        <div class="bg-bg-panel border border-success rounded-lg p-4 mb-4 text-sm shadow-sm">
          <p class="text-success font-medium mb-1">Egyesítés sikeres.</p>
          <p class="text-text-muted">
            {{ result.movedGroups }} csoport, {{ result.movedMemberships }} tagság átkerült
            @if (result.mergedDuplicateMemberships > 0) {
              , {{ result.mergedDuplicateMemberships }} átfedő tagság összevonva
            }.
          </p>
        </div>
      }

      @if (store.loading()) {
        <p class="text-text-muted">Betöltés…</p>
      }

      <div class="bg-bg-panel border border-border-default rounded-lg p-4 mb-6 shadow-sm">
        <h2 class="font-medium mb-3">Intézmények egyesítése</h2>
        <p class="text-sm text-text-muted mb-3">
          Két véletlenül duplikáltan létrejött intézmény egyesíthető: a forrás összes tanára és csoportja
          átkerül a célba, a forrás intézmény törlődik.
        </p>
        <div class="flex gap-3 items-end flex-wrap">
          <div>
            <label class="text-xs text-text-muted block mb-1">Forrás (törlődik)</label>
            <select [(ngModel)]="sourceId" name="sourceId"
              class="rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm min-w-48">
              <option [ngValue]="null">Válassz…</option>
              @for (school of store.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="text-xs text-text-muted block mb-1">Cél (megmarad)</label>
            <select [(ngModel)]="targetId" name="targetId"
              class="rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm min-w-48">
              <option [ngValue]="null">Válassz…</option>
              @for (school of store.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          </div>
          <button (click)="confirmMerge()" [disabled]="!canMerge()"
            class="rounded bg-primary hover:bg-primary-hover text-white text-sm px-3 py-1.5 disabled:opacity-50">
            Egyesítés
          </button>
        </div>
      </div>

      <ul class="space-y-3">
        @for (school of store.schools(); track school.id) {
          <li class="bg-bg-panel border border-border-default rounded-lg p-4 shadow-sm">
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
          </li>
        } @empty {
          @if (!store.loading()) {
            <li class="text-text-muted">Nincs még intézmény.</li>
          }
        }
      </ul>
    </div>
  `,
})
export class AdminIntezmenyekComponent {
  readonly store = inject(AdminSchoolStore);

  sourceId: number | null = null;
  targetId: number | null = null;

  constructor() {
    this.store.load();
  }

  canMerge(): boolean {
    return this.sourceId !== null && this.targetId !== null && this.sourceId !== this.targetId;
  }

  confirmMerge(): void {
    if (!this.canMerge() || this.sourceId === null || this.targetId === null) return;

    const source = this.store.schools().find((s) => s.id === this.sourceId);
    const target = this.store.schools().find((s) => s.id === this.targetId);
    if (!source || !target) return;

    if (
      confirm(
        `Biztosan egyesíted a(z) „${source.name}” intézményt a(z) „${target.name}” intézménybe? ` +
          `Minden tanára és csoportja átkerül, a(z) „${source.name}” törlődik. Ez nem vonható vissza.`,
      )
    ) {
      this.store.merge(this.sourceId, this.targetId);
      this.sourceId = null;
      this.targetId = null;
    }
  }
}
