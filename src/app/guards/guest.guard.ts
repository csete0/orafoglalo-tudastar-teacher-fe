import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthStore } from '../services/auth/store/auth.store';

/**
 * UI-TT-87: a `/login` route-nak korábban nem volt "guest-only" őre - egy már
 * autentikált user, aki a `/login`-ra navigált (pl. régi bookmark), a bejelentkezett
 * navigációs sáv ALATT is látta a teljes, aktív bejelentkezési formot, ami egy
 * újbóli signIn()-nel csendben felülírta a tárolt tokent/user-adatot.
 */
export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.ensureInitialization();

  if (authStore.isAuthenticated()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
