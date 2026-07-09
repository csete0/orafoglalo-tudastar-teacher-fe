import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApplicationStore } from '../../services/admin/admin-application.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-jelentkezesek',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-4">Tanári jelentkezések</h1>

      <div class="flex gap-2 mb-6 text-sm">
        @for (option of statusOptions; track option.value) {
          <button (click)="store.setStatusFilter(option.value)"
            class="px-3 py-1 rounded border"
            [class.bg-primary]="store.statusFilter() === option.value"
            [class.text-white]="store.statusFilter() === option.value"
            [class.border-primary]="store.statusFilter() === option.value"
            [class.border-border-default]="store.statusFilter() !== option.value">
            {{ option.label }}
          </button>
        }
      </div>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }
      @if (store.loading()) {
        <p class="text-text-muted">Betöltés…</p>
      }

      <ul class="space-y-3">
        @for (application of store.applications(); track application.id) {
          <li class="bg-bg-panel border border-border-default rounded-lg p-4">
            <div class="flex justify-between items-start mb-2">
              <div>
                <p class="font-medium">{{ application.applicantName }}</p>
                <p class="text-sm text-text-muted">{{ application.applicantEmail }}</p>
              </div>
              <span class="text-xs text-text-muted">{{ application.createdAt | date: 'yyyy.MM.dd' }}</span>
            </div>
            <p class="text-sm mb-1">{{ application.motivation }}</p>
            @if (application.institutionName) {
              <p class="text-sm text-text-muted mb-3">Intézmény: {{ application.institutionName }}</p>
            }

            @if (store.statusFilter() === 'pending') {
              @if (rejectingId() === application.id) {
                <div class="flex gap-2 items-start mt-2">
                  <input [(ngModel)]="rejectReason" placeholder="Indoklás (opcionális)"
                    class="flex-1 rounded border border-border-default bg-bg-element px-2 py-1 text-sm" />
                  <button (click)="confirmReject(application.id)" class="text-sm text-danger px-2 py-1">Megerősítés</button>
                  <button (click)="cancelReject()" class="text-sm text-text-muted px-2 py-1">Mégse</button>
                </div>
              } @else {
                <div class="flex gap-2 mt-2">
                  <button (click)="store.approve(application.id)"
                    class="rounded bg-success text-white text-sm px-3 py-1.5">
                    Elfogadás
                  </button>
                  <button (click)="startReject(application.id)"
                    class="rounded border border-danger text-danger text-sm px-3 py-1.5">
                    Elutasítás
                  </button>
                </div>
              }
            } @else if (application.status === 'Rejected' && application.rejectionReason) {
              <p class="text-sm text-danger">Indoklás: {{ application.rejectionReason }}</p>
            }
          </li>
        } @empty {
          <li class="text-text-muted">Nincs a szűrésnek megfelelő jelentkezés.</li>
        }
      </ul>
    </div>
  `,
})
export class AdminJelentkezesekComponent {
  readonly store = inject(AdminApplicationStore);

  readonly statusOptions = [
    { value: 'pending' as const, label: 'Elbírálásra vár' },
    { value: 'approved' as const, label: 'Elfogadva' },
    { value: 'rejected' as const, label: 'Elutasítva' },
    { value: 'all' as const, label: 'Összes' },
  ];

  readonly rejectingId = signal<number | null>(null);
  rejectReason = '';

  constructor() {
    this.store.load();
  }

  startReject(id: number): void {
    this.rejectingId.set(id);
    this.rejectReason = '';
  }

  cancelReject(): void {
    this.rejectingId.set(null);
  }

  confirmReject(id: number): void {
    this.store.reject(id, { reason: this.rejectReason || undefined }, () => this.rejectingId.set(null));
  }
}
