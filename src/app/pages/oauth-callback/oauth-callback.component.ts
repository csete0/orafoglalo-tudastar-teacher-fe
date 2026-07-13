import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../services/auth/store/auth.store';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

/**
 * A Google/Facebook/Apple redirect erre az UTVONALRA erkezik vissza (nem
 * kozvetlenul a "/dashboard"-ra) - a "/dashboard"-ot authGuard vedi, es ha a
 * redirect egyenesen oda menne, a guard MEG AZELOTT atirna "/login"-ra hogy
 * az autoLogin() lefuthatna, es a query param (google_authentication=success)
 * elveszne az utkozben. Ez az utvonal szandekosan NINCS guard-olva.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [LocalSpinnerComponent],
  template: `<div class="min-h-screen flex items-center justify-center"><app-local-spinner /></div>`,
})
export class OauthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);
  private readonly toastService = inject(ToastService);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    const hasSocialAuth =
      params['google_authentication'] === 'success' ||
      params['facebook_authentication'] === 'success' ||
      params['apple_authentication'] === 'success';

    if (!hasSocialAuth) {
      if (params['error']) {
        this.toastService.danger('A bejelentkezés nem sikerült. Próbáld újra.');
      }
      this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    this.authStore.autoLogin(
      () => {
        this.toastService.success('Sikeres bejelentkezés!');
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      },
      (message) => {
        this.toastService.danger(message);
        this.router.navigate(['/login'], { replaceUrl: true });
      },
    );
  }
}
