import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal, computed, inject, DestroyRef, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { timer } from 'rxjs';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';
import { LoginResponseDto, SignInModel, STORAGE_KEYS, TeacherUserLoginDto, TIMING_CONFIG } from '../../../models/auth.model';

type AuthError = { message: string; timestamp: Date };

/**
 * Egyszerűsítve a diák-repó auth.store.ts-éhez képest (copy-adapt): nincs
 * OAuth-provider, téma-szinkron, "first steps" stb. — csak bejelentkezés,
 * token-élettartam-kezelés és a platform-role-ok (student/teacher/admin)
 * kiolvasása a bejelentkezési válaszból.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly tokenService = inject(TokenService);
  private readonly ngZone = inject(NgZone);

  private readonly _authCheckComplete = signal(false);
  private readonly _isAuthenticated = signal<boolean | null>(null);
  private readonly _loginResponse = signal<LoginResponseDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<AuthError | null>(null);

  private initializationPromise?: Promise<void>;

  readonly authCheckComplete = computed(() => this._authCheckComplete());
  readonly isAuthenticated = computed(() => this._isAuthenticated());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly currentUser = computed<TeacherUserLoginDto | null>(() => this._loginResponse()?.user ?? null);
  readonly roles = computed<string[]>(() => this.currentUser()?.roles ?? []);
  readonly hasTeacherRole = computed(() => this.roles().includes('teacher'));
  readonly hasAdminRole = computed(() => this.roles().includes('admin'));

  constructor() {
    this.tokenService.onTokenRefreshed = async (response) => this.handleSuccessfulRefresh(response);
    this.tokenService.onTokenRefreshFailed = async () => {
      this._isAuthenticated.set(false);
      this._loginResponse.set(null);
    };

    this.ensureInitialization();
    this.startTokenRefreshMonitoring();
  }

  // ==================== TOKEN API (interceptor számára) ====================

  async getValidAccessToken(): Promise<string | null> {
    return this.tokenService.getValidAccessToken();
  }

  async refreshToken(): Promise<string | null> {
    return this.tokenService.performTokenRefresh();
  }

  // ==================== INICIALIZÁCIÓ ====================

  async ensureInitialization(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeAuthState();
    }
    return this.initializationPromise;
  }

  private async initializeAuthState(): Promise<void> {
    try {
      const accessToken = this.tokenService.getFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
      if (!accessToken) {
        this._isAuthenticated.set(false);
        return;
      }

      const expiry = this.authService.getTokenExpiry(accessToken);
      const now = new Date();

      if (expiry && expiry > now) {
        const user = this.tokenService.getStoredUser();
        if (user) {
          this._loginResponse.set({ user, accessToken, isAuthenticated: true });
          this._isAuthenticated.set(true);
          return;
        }
      }

      // Lejárt vagy hiányos tárolt állapot → refresh megkísérlése
      const newToken = await this.tokenService.performTokenRefresh();
      if (!newToken) {
        this._isAuthenticated.set(false);
        await this.tokenService.clearTokens();
      }
    } catch {
      this._isAuthenticated.set(false);
    } finally {
      this._authCheckComplete.set(true);
    }
  }

  private async handleSuccessfulRefresh(response: LoginResponseDto): Promise<void> {
    this._loginResponse.set(response);
    this._isAuthenticated.set(true);
  }

  // ==================== TOKEN-FIGYELÉS ====================

  private startTokenRefreshMonitoring(): void {
    this.ngZone.runOutsideAngular(() => {
      timer(0, TIMING_CONFIG.REFRESH_CHECK_INTERVAL)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.ngZone.run(() => this.checkAndRefreshToken()));
    });
  }

  private async checkAndRefreshToken(): Promise<void> {
    if (!this._isAuthenticated() || this.tokenService.isRefreshInProgress) return;

    const accessToken = await this.tokenService.getAccessToken();
    if (!accessToken) return;

    const expiry = this.authService.getTokenExpiry(accessToken);
    if (!expiry) return;

    const timeUntilExpiry = expiry.getTime() - Date.now();
    if (timeUntilExpiry <= TIMING_CONFIG.REFRESH_THRESHOLD && timeUntilExpiry > 0) {
      await this.tokenService.performTokenRefresh();
    }
  }

  // ==================== MŰVELETEK ====================

  signIn(model: SignInModel, onSuccess?: () => void, onError?: (message: string) => void): void {
    this._loading.set(true);
    this._error.set(null);

    this.authService
      .signIn(model)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async (response) => {
          if (response.accessToken) {
            await this.tokenService.saveTokenPair(response.accessToken, response.user);
          }
          this._loginResponse.set(response);
          this._isAuthenticated.set(true);
          if (onSuccess) onSuccess();
        },
        error: (err: HttpErrorResponse) => {
          // status === 0 → a kérés nem jutott el a backendig (hálózati hiba vagy
          // CORS-blokk), tehát a hitelesítő adatok nem lettek ellenőrizve — ezt
          // nem szabad "hibás email/jelszó"-ként mutatni.
          // status === 429 → a login-rate-limiter EGY HARMADIK, a többi végponttól
          // eltérő válasz-alakot ad ({"error":"Too many requests","message":"<magyar szöveg>"}),
          // ezért itt kifejezetten a "message" mezőt kell előnyben részesíteni, különben
          // az alábbi errorMessage/error fallback-lánc a nyers angol "error" mezőt kapná el (UI-TT-31).
          const message =
            err.status === 0
              ? 'Nem sikerült kapcsolódni a szerverhez. Próbáld újra később.'
              : err.status === 429
                ? (err.error?.message ?? 'Túl sok próbálkozás történt. Kérjük, várj egy kicsit, mielőtt újra próbálkozol.')
                : (err.error?.errorMessage ?? err.error?.error ?? 'Hibás email cím vagy jelszó.');
          this._error.set({ message, timestamp: new Date() });
          this._isAuthenticated.set(false);
          if (onError) onError(message);
        },
      });
  }

  logout(callback?: () => void): void {
    this._loading.set(true);

    this.authService
      .logout()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async () => this.performCompleteSignOut(callback),
        error: async () => this.performCompleteSignOut(callback),
      });
  }

  private async performCompleteSignOut(callback?: () => void): Promise<void> {
    await this.tokenService.clearTokens();
    this._loginResponse.set(null);
    this._isAuthenticated.set(false);
    this._error.set(null);
    if (callback) callback();
  }

  clearError(): void {
    this._error.set(null);
  }
}
