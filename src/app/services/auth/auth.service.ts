import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginResponseDto, SignInModel } from '../../models/auth.model';

/**
 * Egyszerűsítve a diák-repó auth.service.ts-éhez képest: a tanári appban
 * a regisztráció a diák-oldalon történik (ugyanaz a User-identitás), itt
 * csak bejelentkezés/refresh/logout kell.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  // AUTH-6: a teacher-fe és a diák/fő app ugyanazt a backend hostot hívja, a
  // refreshToken cookie-nak pedig nincs Domain-attribútuma (csak Path=/api/auth) -
  // a böngésző a portot cookie-hatókörnél figyelmen kívül hagyja, tehát a két app
  // bejelentkezése korábban felülírta egymás cookie-ját (egy ugyanabban a böngészőben
  // futó háttér-refresh a MÁSIK app aktuális userére válthatott át észrevétlenül).
  // A "?app=teacher" (ugyanaz a minta, mint a signInWithProvider OAuth-hívásainál)
  // app-onként külön nevű cookie-t választ a backenden, így ez többé nem történhet meg.
  signIn(model: SignInModel): Observable<LoginResponseDto> {
    return this.http.post<LoginResponseDto>(`${environment.apiUrl}/auth/login?app=teacher`, model, {
      withCredentials: true,
    });
  }

  refreshTokens(): Observable<LoginResponseDto> {
    return this.http.post<LoginResponseDto>(
      `${environment.apiUrl}/auth/refresh?app=teacher`,
      {},
      { withCredentials: true },
    );
  }

  /**
   * A social-login redirect utan a backend altal HttpOnly cookie-ban
   * elhelyezett auto_login_token-t valtja be egy tenyleges munkamenetre
   * (ugyanaz a végpont/mintázat, mint a diák-repóban). Az "app" itt nem kell
   * query-paramként, mert a backend a Google/Facebook/Apple callback óta már
   * az auto_login_token-hez kötve, cache-ben tárolja (ld. AUTH-6 fix).
   */
  autoLogin(): Observable<LoginResponseDto> {
    return this.http.post<LoginResponseDto>(
      `${environment.apiUrl}/auth/auto-login`,
      {},
      { withCredentials: true },
    );
  }

  logout(): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/auth/logout?app=teacher`, {}, { withCredentials: true });
  }

  /** Google/Facebook/Apple bejelentkezés indítása - a ?app=teacher jelzi a
   * backendnek, hogy sikeres OAuth után a teacher-fe-re irányítson vissza. */
  signInWithProvider(provider: 'google' | 'facebook' | 'apple'): void {
    window.location.href = `${environment.providerUri}/${provider}?app=teacher`;
  }

  getTokenExpiry(token: string): Date | null {
    try {
      // UI-TT-48: a JWT payload base64url-kódolású (RFC 7519), a szabványos
      // atob() `-`/`_` karaktereken InvalidCharacterError-t dob — ugyanaz a
      // base64url-biztos dekódolás, mint a diák-repó
      // (orafoglalo-tudastar-fe) UtilService.decodeToken()-je.
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = decodeURIComponent(escape(atob(base64)));
      const payload = JSON.parse(decoded);
      return payload.exp ? new Date(payload.exp * 1000) : null;
    } catch {
      return null;
    }
  }
}
