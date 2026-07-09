import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthStore } from '../services/auth/store/auth.store';

/**
 * CSAK platform-szintű role-okra (JWT-claim: "teacher", "admin") — az
 * intézmény-admin (igazgató) szerep NEM guard, hanem adat (SchoolDto.MyRole),
 * azt a komponensek döntik el a betöltött intézmény alapján.
 *
 * `authGuard`-dal együtt kell használni (a route canActivate tömbjében előtte),
 * mert ez nem ellenőrzi az autentikációt, csak a role-t.
 */
export function roleGuard(role: 'teacher' | 'admin'): CanActivateFn {
  return (): boolean | UrlTree => {
    const authStore = inject(AuthStore);
    const router = inject(Router);

    if (authStore.roles().includes(role)) {
      return true;
    }

    // Tanárrá jelentkezés hiányában a jelentkezési oldalra irányítunk;
    // platform-admin hiányában a dashboardra (nincs jogosultsága ott sem,
    // de legalább nem 404-be fut).
    return router.createUrlTree([role === 'teacher' ? '/jelentkezes' : '/dashboard']);
  };
}
