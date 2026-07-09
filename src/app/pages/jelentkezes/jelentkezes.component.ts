import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TeacherApplicationStore } from '../../services/teacher-application/teacher-application.store';
import { AuthStore } from '../../services/auth/store/auth.store';

const POLL_INTERVAL_MS = 5000;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-jelentkezes',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  template: `
    <div class="max-w-lg mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-6">Tanári jelentkezés</h1>

      @if (!store.checked()) {
        <p class="text-text-muted">Betöltés…</p>
      } @else if (store.isApproved()) {
        <div class="bg-bg-panel border border-border-default rounded-lg p-6">
          <p class="text-success font-medium mb-4">Tanári jelentkezésed elfogadva!</p>
          <p class="text-sm text-text-muted mb-4">
            A tanári funkciók aktiválásához frissítened kell a munkameneted.
          </p>
          <button (click)="enterAsTeacher()"
            class="rounded bg-primary hover:bg-primary-hover text-white px-4 py-2">
            Belépés tanárként
          </button>
        </div>
      } @else if (store.isPending()) {
        <div class="bg-bg-panel border border-border-default rounded-lg p-6">
          <p class="font-medium mb-2">Jelentkezésed elbírálás alatt.</p>
          <p class="text-sm text-text-muted">
            Beadva: {{ store.application()?.createdAt | date: 'yyyy.MM.dd HH:mm' }}
          </p>
        </div>
      } @else {
        @if (store.isRejected()) {
          <div class="bg-bg-element border border-border-default rounded-lg p-4 mb-4">
            <p class="text-danger font-medium">A korábbi jelentkezésedet elutasítottuk.</p>
            @if (store.application()?.rejectionReason) {
              <p class="text-sm text-text-muted mt-1">Indoklás: {{ store.application()?.rejectionReason }}</p>
            }
            <p class="text-sm text-text-muted mt-2">Kiegészített bemutatkozással újra jelentkezhetsz.</p>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="block text-sm mb-1" for="motivation">Bemutatkozás</label>
            <textarea id="motivation" formControlName="motivation" rows="5"
              class="w-full rounded border border-border-default bg-bg-element px-3 py-2"
              placeholder="Milyen tantárgyat tanítasz, hány éve, miért szeretnél feladatsorokat készíteni?"></textarea>
          </div>
          <div>
            <label class="block text-sm mb-1" for="institutionName">Intézmény neve (opcionális)</label>
            <input id="institutionName" formControlName="institutionName"
              class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />
          </div>

          @if (store.error()) {
            <p class="text-sm text-danger">{{ store.error() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || store.loading()"
            class="rounded bg-primary hover:bg-primary-hover text-white px-4 py-2 disabled:opacity-50">
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
