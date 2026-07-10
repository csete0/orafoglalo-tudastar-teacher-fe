import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TeacherApplicationStore } from '../../services/teacher-application/teacher-application.store';
import { AuthStore } from '../../services/auth/store/auth.store';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

const POLL_INTERVAL_MS = 5000;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-jelentkezes',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="max-w-lg mx-auto px-4 py-10">
      <h1 class="page-title">Tanári jelentkezés</h1>
      <p class="text-sm text-text-muted mt-1">Kérj hozzáférést a tanári funkciókhoz</p>
      <div class="hairline"></div>

      @if (!store.checked()) {
        <app-local-spinner />
      } @else if (store.isApproved()) {
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="icon-tile icon-tile-success">
              <app-icon name="check" class="w-6 h-6 block" />
            </div>
            <p class="text-success font-bold">Tanári jelentkezésed elfogadva!</p>
          </div>
          <p class="text-sm text-text-muted mb-4">
            A tanári funkciók aktiválásához frissítened kell a munkameneted.
          </p>
          <button (click)="enterAsTeacher()" class="btn btn-primary">
            Belépés tanárként
          </button>
        </div>
      } @else if (store.isPending()) {
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-2">
            <div class="icon-tile icon-tile-warning">
              <app-icon name="inbox" class="w-6 h-6 block" />
            </div>
            <p class="font-bold">Jelentkezésed elbírálás alatt.</p>
          </div>
          <p class="text-sm text-text-muted">
            Beadva: {{ store.application()?.createdAt | date: 'yyyy.MM.dd HH:mm' }}
          </p>
        </div>
      } @else {
        @if (store.isRejected()) {
          <div class="bg-danger-subtle border border-danger/40 rounded-xl p-4 mb-4">
            <p class="text-danger font-bold">A korábbi jelentkezésedet elutasítottuk.</p>
            @if (store.application()?.rejectionReason) {
              <p class="text-sm text-text-muted mt-1">Indoklás: {{ store.application()?.rejectionReason }}</p>
            }
            <p class="text-sm text-text-muted mt-2">Kiegészített bemutatkozással újra jelentkezhetsz.</p>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="card p-6 space-y-4">
          <div>
            <label class="block text-sm mb-1" for="motivation">Bemutatkozás</label>
            <textarea id="motivation" formControlName="motivation" rows="5" class="input"
              placeholder="Milyen tantárgyat tanítasz, hány éve, miért szeretnél feladatsorokat készíteni?"></textarea>
          </div>
          <div>
            <label class="block text-sm mb-1" for="institutionName">Intézmény neve (opcionális)</label>
            <input id="institutionName" formControlName="institutionName" class="input" />
          </div>

          @if (store.error()) {
            <p class="text-sm text-danger">{{ store.error() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || store.loading()" class="btn btn-primary">
            {{ store.loading() ? 'Küldés…' : 'Jelentkezés beküldése' }}
          </button>
        </form>
      }
    </div>
  `,
})
export class JelentkezesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);
  readonly store = inject(TeacherApplicationStore);

  readonly form = this.fb.nonNullable.group({
    motivation: ['', [Validators.required, Validators.minLength(20)]],
    institutionName: [''],
  });

  constructor() {
    this.store.loadMine();

    // Pollozás, amíg a jelentkezés elbírálásra vár
    interval(POLL_INTERVAL_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.store.isPending()) {
          this.store.loadMine();
        }
      });
  }

  submit(): void {
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    this.store.apply({
      motivation: raw.motivation,
      institutionName: raw.institutionName || undefined,
    });
  }

  async enterAsTeacher(): Promise<void> {
    await this.authStore.refreshToken();
    this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }
}
