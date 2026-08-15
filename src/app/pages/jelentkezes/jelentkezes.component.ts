import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TeacherApplicationStore } from '../../services/teacher-application/teacher-application.store';
import { AuthStore } from '../../services/auth/store/auth.store';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { ToastService } from '../../shared/toast/toast.service';

const POLL_INTERVAL_MS = 5000;

/**
 * A tulajdonos által vállalt maximális elbírálási idő. EGY helyen definiálva, hogy a
 * várakozó képernyő és a jelentkezőnek küldött visszaigazoló email ne csússzon szét.
 * A backend oldali párja a `TeacherApplicationService.DecisionTurnaroundHours`.
 */
const DECISION_TURNAROUND_HOURS = 24;

/** Kapcsolattartási cím a sürgős esetekre — ugyanaz, mint a backend SupportEmail-je. */
const SUPPORT_EMAIL = 'info@orafoglalo.hu';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-jelentkezes',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, IconComponent, LocalSpinnerComponent, RouterLink],
  template: `
    <div class="max-w-lg mx-auto px-4 py-10">
      <h1 class="page-title">Tanári jelentkezés</h1>
      <p class="text-sm text-text-muted mt-1">Kérj hozzáférést a tanári funkciókhoz</p>
      <div class="hairline"></div>

      @if (!store.checked()) {
        <app-local-spinner />
      } @else if (authStore.hasTeacherRole()) {
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="icon-tile icon-tile-success">
              <app-icon name="check" class="w-6 h-6 block" />
            </div>
            <p class="text-success font-bold">Már rendelkezel tanári hozzáféréssel.</p>
          </div>
          <p class="text-sm text-text-muted mb-4">
            Nincs szükség új jelentkezésre, a tanári funkciók már elérhetők számodra.
          </p>
          <a routerLink="/dashboard" class="btn btn-primary">Ugrás a vezérlőpultra</a>
        </div>
      } @else if (store.isApproved()) {
        <div class="card p-6" role="status" aria-live="polite">
          <div class="flex items-center gap-3 mb-4">
            <div class="icon-tile icon-tile-success">
              <app-icon name="check" class="w-6 h-6 block" />
            </div>
            <p class="text-success font-bold">Tanári jelentkezésed elfogadva!</p>
          </div>
          <p class="text-sm text-text-muted mb-4">
            A tanári funkciók aktiválásához frissítened kell a munkameneted.
          </p>
          @if (enterAsTeacherError()) {
            <p class="text-sm text-danger mb-3">{{ enterAsTeacherError() }}</p>
          }
          <button (click)="enterAsTeacher()" class="btn btn-primary">
            Belépés tanárként
          </button>
        </div>
      } @else if (store.isPending()) {
        <div class="card p-6" role="status" aria-live="polite">
          <div class="flex items-center gap-3 mb-2">
            <div class="icon-tile icon-tile-warning">
              <app-icon name="inbox" class="w-6 h-6 block" />
            </div>
            <p class="font-bold">Jelentkezésed elbírálás alatt.</p>
          </div>
          <p class="text-sm text-text-muted mb-4">
            Beadva: {{ store.application()?.createdAt | date: 'yyyy.MM.dd HH:mm' }}
          </p>

          <!-- 0.C audit: a várakozó képernyő korábban CSAK a fenti két sort mutatta -
               se azt, hogy mi következik, se azt, hogy meddig tart, se azt, hogy kihez
               fordulhat a jelentkező. Aki bezárta a böngészőt, semmilyen visszajelzést
               nem kapott többé. -->
          <p class="text-sm text-text-muted mb-2">
            Minden jelentkezést személyesen nézünk át — legkésőbb
            <strong>{{ turnaroundHours }} órán belül válaszolunk</strong>, és a döntésről
            emailben is értesítünk.
          </p>
          <p class="text-sm text-text-muted">
            Addig nincs teendőd. Ha sürgős, írj ide:
            <a [href]="'mailto:' + supportEmail" class="text-primary hover:underline">{{ supportEmail }}</a>
          </p>
        </div>
      } @else {
        @if (store.isRejected()) {
          <div class="bg-danger-subtle border border-danger/40 rounded-xl p-4 mb-4" role="status" aria-live="polite">
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
            <textarea id="motivation" formControlName="motivation" rows="5" class="input" maxlength="2000"
              placeholder="Milyen tantárgyat tanítasz, hány éve, miért szeretnél feladatsorokat készíteni?"></textarea>
            <!-- UI-TT-184: a testvér-formok (csoportok-lista/intezmenyek-lista/feladatsorok-lista)
                 mintáját követve - korábban a motivation mező validátorai (required/minLength/
                 notBlankValidator) MŰKÖDTEK, de egyetlen hibaüzenet sem volt kiírva, a gomb csak
                 indoklás nélkül letiltva maradt. -->
            @if (form.controls.motivation.hasError('required')) {
              <p class="text-sm text-danger">A bemutatkozás megadása kötelező.</p>
            }
            @if (form.controls.motivation.hasError('minlength')) {
              <p class="text-sm text-danger">A bemutatkozás legalább 20 karakter hosszú legyen.</p>
            }
            @if (form.controls.motivation.hasError('blank')) {
              <p class="text-sm text-danger">A bemutatkozás nem állhat kizárólag szóközökből.</p>
            }
            @if (form.controls.motivation.hasError('maxlength')) {
              <p class="text-sm text-danger">A bemutatkozás legfeljebb 2000 karakter hosszú lehet.</p>
            }
          </div>
          <div>
            <label class="block text-sm mb-1" for="institutionName">Intézmény neve (opcionális)</label>
            <input id="institutionName" formControlName="institutionName" class="input" maxlength="255" />
            @if (form.controls.institutionName.hasError('maxlength')) {
              <p class="text-sm text-danger">Az intézmény neve legfeljebb 255 karakter hosszú lehet.</p>
            }
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
  private readonly toastService = inject(ToastService);
  readonly authStore = inject(AuthStore);
  readonly store = inject(TeacherApplicationStore);

  readonly turnaroundHours = DECISION_TURNAROUND_HOURS;
  readonly supportEmail = SUPPORT_EMAIL;

  // UI-TT-185: a backend ApplyTeacherRequest.Motivation/InstitutionName
  // [MaxLength(2000)]/[MaxLength(255)] DataAnnotations-szal védett, de ennek
  // korábban nem volt kliens-oldali párja - egy túl hosszú bemutatkozás
  // kliens-oldalon "érvényesnek" tűnt, a submit elindult, majd a backend
  // elutasította, a store (fixálva lentebb, extractErrorMessage) korábban
  // csendben eldobta a valós okot.
  readonly form = this.fb.nonNullable.group({
    motivation: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000), notBlankValidator()]],
    institutionName: ['', [Validators.maxLength(255)]],
  });

  readonly enterAsTeacherError = signal<string | null>(null);

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

    // UI-TT-17: elutasított jelentkezés esetén a korábban beadott bemutatkozás/intézménynév előtöltése,
    // hogy az újra-jelentkezőnek ne kelljen mindent nulláról begépelnie.
    effect(() => {
      const application = this.store.application();
      if (application && this.store.isRejected()) {
        this.form.patchValue({
          motivation: application.motivation ?? '',
          institutionName: application.institutionName ?? '',
        });
      }
    });
  }

  submit(): void {
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    // 0.C audit: a store már régóta támogat egy onSuccess callbacket, de a submit()
    // sosem adott át egyet - a beadás egyetlen visszajelzése az volt, hogy a nézet
    // átvált a várakozó kártyára. Egy explicit toast egyértelművé teszi, hogy a
    // beküldés tényleg megtörtént.
    this.store.apply(
      {
        motivation: raw.motivation,
        institutionName: raw.institutionName || undefined,
      },
      () => this.toastService.success('Jelentkezésed beérkezett, hamarosan válaszolunk.'),
    );
  }

  async enterAsTeacher(): Promise<void> {
    this.enterAsTeacherError.set(null);
    // UI-TT-16/UI-TT-144: a sima refreshToken() a megosztott
    // onTokenRefreshFailed-hookon keresztül sikertelen refresh esetén
    // automatikusan /login-ra navigálna (a cross-tab logout/mismatch
    // eseteknek szánt védelem) - ez itt elnyomná az alábbi dedikált
    // hibaüzenetet. A `WithoutAutoRedirect` variáns elnyomja azt a
    // redirectet erre az egy hívásra, a hiba-jelzést viszont megkapjuk.
    // UI-TT-150: `force: true` KÖTELEZŐ itt. Enélkül a TokenService
    // `refreshUnderLock()` rövidzára némán visszaadta a MEGLÉVŐ tokent (mert az
    // még messze volt a lejárattól), hálózati hívás nélkül — így a frissen
    // megkapott `teacher` szerepkör sosem került bele a tokenbe, a lenti
    // navigáció pedig a roleGuard-on visszapattant ide. A gomb kívülről nézve
    // teljesen némán, visszajelzés nélkül nem csinált semmit.
    const newToken = await this.authStore.refreshTokenWithoutAutoRedirect(true);
    if (!newToken) {
      // UI-TT-16: sikertelen refresh esetén a TokenService a munkamenetet
      // már törölte (onTokenRefreshFailed) — ne navigáljunk tovább néma
      // kijelentkeztetésként, hanem jelezzük a hibát és hagyjuk a usert újra próbálkozni.
      this.enterAsTeacherError.set(
        'A munkamenet frissítése sikertelen. Próbáld újra, vagy jelentkezz be újra.',
      );
      return;
    }

    // UI-TT-150: a refresh sikeres volt, de ettől még nem biztos, hogy a
    // `teacher` szerepkör tényleg benne van az új tokenben (pl. a jóváhagyást
    // szerver-oldalon visszavonták, vagy egy épp folyamatban lévő ambiens
    // refresh eredményét kaptuk vissza, ami még a jóváhagyás ELŐTT indult).
    // Ilyenkor a /dashboard-ra navigálás a roleGuard-on visszapattanna ide,
    // magyarázat nélkül — inkább mondjuk meg, mi történt.
    if (!this.authStore.hasTeacherRole()) {
      this.enterAsTeacherError.set(
        'A tanári jogosultság még nem érvényesült. Próbáld újra néhány másodperc múlva.',
      );
      return;
    }

    this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }
}
