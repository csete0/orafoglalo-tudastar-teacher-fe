import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../services/auth/store/auth.store';
import { environment } from '../../../environments/environment';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-sm bg-bg-panel border border-border-default rounded-lg p-6">
        <h1 class="text-xl font-semibold mb-1">Tanári bejelentkezés</h1>
        <p class="text-sm text-text-muted mb-6">
          Ugyanazzal a fiókkal jelentkezz be, amivel a
          <a [href]="studentAppUrl" class="text-primary hover:underline">patricks.hu</a>-n regisztráltál.
        </p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="block text-sm mb-1" for="email">Email</label>
            <input id="email" type="email" formControlName="email"
              class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm mb-1" for="password">Jelszó</label>
            <input id="password" type="password" formControlName="password"
              class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />
          </div>

          @if (errorMessage()) {
            <p class="text-sm text-danger">{{ errorMessage() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || loading()"
            class="w-full rounded bg-primary hover:bg-primary-hover text-white py-2 disabled:opacity-50">
            {{ loading() ? 'Belépés…' : 'Belépés' }}
          </button>
        </form>

        <p class="text-sm text-text-muted mt-4">
          Nincs még fiókod?
          <a [href]="studentAppUrl + '/registration'" class="text-primary hover:underline">Regisztrálj a patricks.hu-n</a>.
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authStore = inject(AuthStore);

  readonly studentAppUrl = environment.studentAppUrl;
  readonly loading = computed(() => this.authStore.loading());
  readonly errorMessage = computed(() => this.authStore.error()?.message ?? null);

  private returnUrl = '/dashboard';

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params['returnUrl']) {
        this.returnUrl = params['returnUrl'];
      }
    });
  }

  submit(): void {
    if (this.form.invalid) return;

    this.authStore.signIn(this.form.getRawValue(), () => {
      this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
    });
  }
}
