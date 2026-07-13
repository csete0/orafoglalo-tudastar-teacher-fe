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
          <button type="button" (click)="signInWithProvider('google')" class="btn w-full">Google</button>
          <button type="button" (click)="signInWithProvider('facebook')" class="btn w-full">Facebook</button>
          <button type="button" (click)="signInWithProvider('apple')" class="btn w-full">Apple</button>
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
