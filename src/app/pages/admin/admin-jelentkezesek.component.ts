import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApplicationStore } from '../../services/admin/admin-application.store';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-jelentkezesek',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Tanári jelentkezések</h1>
      <p class="text-sm text-text-muted mt-1">Beérkezett tanári hozzáférés-kérelmek bírálata</p>
      <div class="hairline"></div>

      <div class="flex gap-2 mb-6 text-sm flex-wrap">
        @for (option of statusOptions; track option.value) {
          <button (click)="store.setStatusFilter(option.value)"
            class="px-3 py-1.5 rounded-lg border font-semibold transition-colors"
            [class.bg-primary]="store.statusFilter() === option.value"
            [class.text-white]="store.statusFilter() === option.value"
            [class.border-primary]="store.statusFilter() === option.value"
            [class.border-border-default]="store.statusFilter() !== option.value"
            [class.text-text-muted]="store.statusFilter() !== option.value">
            {{ option.label }}
          </button>
        }
      </div>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }
      @if (store.loading()) {
        <app-local-spinner />
      }

      <ul class="space-y-3">
        @for (application of store.applications(); track application.id) {
          <li class="card p-4">
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
                    class="input flex-1 !px-2 !py-1" />
                  <button (click)="confirmReject(application.id)" class="text-sm text-danger px-2 py-1">Megerősítés</button>
                  <button (click)="cancelReject()" class="text-sm text-text-muted px-2 py-1">Mégse</button>
                </div>
              } @else {
                <div class="flex gap-2 mt-2">
                  <button (click)="approve(application.id)"
                    class="btn !bg-success !text-white !px-3 !py-1.5">
                    Elfogadás
                  </button>
                  <button (click)="startReject(application.id)"
                    class="btn btn-danger !px-3 !py-1.5">
                    Elutasítás
                  </button>
                </div>
              }
            } @else if (application.status === 'Rejected' && application.rejectionReason) {
              <p class="text-sm text-danger">Indoklás: {{ application.rejectionReason }}</p>
            }
          </li>
        } @empty {
          @if (!store.loading()) {
            <li class="flex flex-col items-center py-10 gap-3">
              <div class="icon-tile icon-tile-neutral">
                <app-icon name="inbox" class="w-6 h-6 block" />
              </div>
              <p class="font-semibold">Nincs a szűrésnek megfelelő jelentkezés.</p>
            </li>
          }
        }
      </ul>
    </div>
  `,
})
export class AdminJelentkezesekComponent {
  readonly store = inject(AdminApplicationStore);
  private readonly toastService = inject(ToastService);

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

  approve(id: number): void {
    this.store.approve(id, () => this.toastService.success('Jelentkezés elfogadva.'));
  }

  confirmReject(id: number): void {
    this.store.reject(id, { reason: this.rejectReason || undefined }, () => {
      this.rejectingId.set(null);
      this.toastService.success('Jelentkezés elutasítva.');
    });
  }
}
