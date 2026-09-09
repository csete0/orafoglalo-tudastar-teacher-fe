import {
  ChangeDetectionStrategy, Component, inject, signal, viewChild,
} from '@angular/core';
import {
  AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InstitutionalInquiryService } from '../../services/institutional-inquiry.service';
import { TurnstileWidgetComponent } from '../../shared/turnstile-widget/turnstile-widget.component';

function emailValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(control.value) ? null : { email: true };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-iskolaknak',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TurnstileWidgetComponent],
  template: `
    <div class="max-w-xl mx-auto px-4 py-10">
      <h1 class="page-title">Intézményi ajánlat kérése</h1>
      <p class="text-sm text-text-muted mt-1 mb-6">
        Töltsd ki az alábbi űrlapot, és hamarosan felvesszük veled a kapcsolatot.
      </p>

      @if (sent()) {
        <div class="card p-6 text-center space-y-3">
          <p class="font-semibold text-lg">Köszönjük az érdeklődést!</p>
          <p class="text-sm text-text-muted">
            Megkaptuk az üzeneted. Hamarosan felvesszük veled a kapcsolatot.
          </p>
          <a routerLink="/" class="btn btn-primary mt-2">Vissza a főoldalra</a>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="label" for="schoolName">Iskola / intézmény neve *</label>
            <input id="schoolName" formControlName="schoolName" class="input"
              placeholder="pl. Arany János Általános Iskola" maxlength="200" />
            @if (form.controls.schoolName.invalid && form.controls.schoolName.touched) {
              <p class="text-danger text-xs mt-1">Az intézmény neve kötelező (max. 200 karakter).</p>
            }
          </div>

          <div>
            <label class="label" for="contactName">Kapcsolattartó neve *</label>
            <input id="contactName" formControlName="contactName" class="input"
              placeholder="pl. Kovács Mária" maxlength="100" />
            @if (form.controls.contactName.invalid && form.controls.contactName.touched) {
              <p class="text-danger text-xs mt-1">A kapcsolattartó neve kötelező (max. 100 karakter).</p>
            }
          </div>

          <div>
            <label class="label" for="email">E-mail cím *</label>
            <input id="email" formControlName="email" type="email" class="input"
              placeholder="pl. kovacs.maria@iskola.hu" maxlength="200" />
            @if (form.controls.email.invalid && form.controls.email.touched) {
              <p class="text-danger text-xs mt-1">
                @if (form.controls.email.hasError('required')) { Az e-mail cím kötelező. }
                @else { Érvénytelen e-mail cím formátum. }
              </p>
            }
          </div>

          <div>
            <label class="label" for="phone">Telefonszám</label>
            <input id="phone" formControlName="phone" class="input"
              placeholder="pl. +36 20 123 4567" maxlength="50" />
          </div>

          <div>
            <label class="label" for="estimatedStudents">Becsült tanulólétszám</label>
            <input id="estimatedStudents" formControlName="estimatedStudents" type="number"
              class="input" min="1" max="100000" placeholder="pl. 150" />
          </div>

          <div>
            <label class="label" for="message">Üzenet</label>
            <textarea id="message" formControlName="message" class="input" rows="4"
              maxlength="2000" placeholder="Miben segíthetünk?"></textarea>
          </div>

          <app-turnstile-widget #turnstile (tokenChange)="turnstileToken.set($event)" />

          @if (error()) {
            <p class="text-danger text-sm">{{ error() }}</p>
          }

          <button type="submit"
            [disabled]="form.invalid || !turnstileToken() || pending()"
            class="btn btn-primary w-full">
            {{ pending() ? 'Küldés...' : 'Érdeklődés beküldése' }}
          </button>
        </form>
      }
    </div>
  `,
})
export class IskolakNakComponent {
  private readonly svc = inject(InstitutionalInquiryService);
  private readonly fb = inject(FormBuilder);

  readonly turnstileRef = viewChild<TurnstileWidgetComponent>('turnstile');
  readonly turnstileToken = signal<string | null>(null);
  readonly pending = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    schoolName: ['', [Validators.required, Validators.maxLength(200)]],
    contactName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.maxLength(200), emailValidator]],
    phone: ['', Validators.maxLength(50)],
    estimatedStudents: [null as number | null, [Validators.min(1), Validators.max(100000)]],
    message: ['', Validators.maxLength(2000)],
  });

  submit(): void {
    if (this.form.invalid || !this.turnstileToken() || this.pending()) return;

    this.pending.set(true);
    this.error.set(null);

    this.svc.submit({
      schoolName: this.form.value.schoolName!,
      contactName: this.form.value.contactName!,
      email: this.form.value.email!,
      phone: this.form.value.phone || undefined,
      estimatedStudents: this.form.value.estimatedStudents ?? undefined,
      message: this.form.value.message || undefined,
      turnstileToken: this.turnstileToken()!,
    }).subscribe({
      next: () => {
        this.pending.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.pending.set(false);
        this.error.set(err?.error?.errorMessage ?? 'A beküldés sikertelen, kérjük próbálja újra.');
        this.turnstileRef()?.reset();
      },
    });
  }
}
