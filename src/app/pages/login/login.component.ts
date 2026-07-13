import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../services/auth/store/auth.store';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-sm card p-8 shadow-md">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm mb-4">
          <img src="assets/patricks/patricks_logo.png" alt="" class="w-7 h-7 object-contain" />
        </div>
        <h1 class="text-2xl font-black tracking-tight mb-1">Tanári bejelentkezés</h1>
        <p class="text-sm text-text-muted mb-6">
          Ugyanazzal a fiókkal jelentkezz be, amivel a
          <a [href]="studentAppUrl" class="text-primary hover:underline">patricks.hu</a>-n regisztráltál.
        </p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="block text-sm mb-1" for="email">Email</label>
            <input id="email" type="email" formControlName="email" class="input" />
          </div>
          <div>
            <label class="block text-sm mb-1" for="password">Jelszó</label>
            <div class="relative">
              <input id="password" [type]="hidePassword() ? 'password' : 'text'" formControlName="password"
                class="input !pr-10" />
              <button type="button" (click)="hidePassword.set(!hidePassword())"
                [attr.aria-label]="hidePassword() ? 'Jelszó megjelenítése' : 'Jelszó elrejtése'"
                class="absolute right-0 top-0 h-full px-3 flex items-center text-text-muted hover:text-text-primary transition-colors">
                <app-icon [name]="hidePassword() ? 'eye' : 'eye-off'" class="w-5 h-5 block" />
              </button>
            </div>
          </div>

          @if (errorMessage()) {
            <p class="text-sm text-danger">{{ errorMessage() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || loading()" class="btn btn-primary w-full">
            {{ loading() ? 'Belépés…' : 'Belépés' }}
          </button>
        </form>

        <div class="flex items-center gap-3 my-4">
          <div class="h-px flex-1 bg-border-default"></div>
          <span class="text-xs text-text-muted">vagy</span>
          <div class="h-px flex-1 bg-border-default"></div>
        </div>

        <div class="space-y-2">
          <button type="button" (click)="signInWithProvider('google')"
            class="btn w-full border border-border-default hover:bg-bg-element">
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </button>
          <button type="button" (click)="signInWithProvider('facebook')"
            class="btn w-full border border-border-default hover:bg-bg-element">
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#1877F2"
                d="M18.77 7.46H14.5v-1.9c0-.9.6-1.1 1-1.1h3V.5h-4.33C10.24.5 9.5 3.44 9.5 5.32v2.15h-3v4h3v12h5v-12h3.85l.42-4z" />
            </svg>
            Facebook
          </button>
          <button type="button" (click)="signInWithProvider('apple')"
            class="btn w-full bg-black text-white hover:bg-gray-800">
            <svg class="w-5 h-5" fill="#ffffff" viewBox="0 0 24 24">
              <path
                d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
            </svg>
            Apple
          </button>
        </div>

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

  readonly hidePassword = signal(true);

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

  signInWithProvider(provider: 'google' | 'facebook' | 'apple'): void {
    this.authStore.signInWithProvider(provider);
  }
}
