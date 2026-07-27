import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal, computed, inject, DestroyRef, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs/operators';
import { timer } from 'rxjs';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';
import { LoginResponseDto, SignInModel, STORAGE_KEYS, TeacherUserLoginDto, TIMING_CONFIG } from '../../../models/auth.model';
import { ToastService } from '../../../shared/toast/toast.service';

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
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  private readonly _authCheckComplete = signal(false);
  private readonly _isAuthenticated = signal<boolean | null>(null);
  private readonly _loginResponse = signal<LoginResponseDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<AuthError | null>(null);

  private initializationPromise?: Promise<void>;
  private suppressAutoRedirectOnRefreshFailure = false;

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
      this.signOutLocallyWithoutClearingStorage(!this.suppressAutoRedirectOnRefreshFailure);
    };

    this.ensureInitialization();
    this.startTokenRefreshMonitoring();
    this.setupStorageListener();
  }

  // ==================== TOKEN API (interceptor számára) ====================

  async getValidAccessToken(): Promise<string | null> {
    return this.tokenService.getValidAccessToken();
  }

  async refreshToken(): Promise<string | null> {
    return this.tokenService.performTokenRefresh();
  }

  /** UI-TT-16/UI-TT-144 interakció: néhány hívó (pl. "Belépés tanárként" a
   *  jelentkezés oldalon) a sikertelen refresh-t a SAJÁT, dedikált inline
   *  hibakezelő UI-jával akarja kezelni, nem a megosztott
   *  `onTokenRefreshFailed`-hook automatikus `/login`-redirectjével (ami a
   *  cross-tab logout/mismatch esetekhez lett hozzáadva). Ez a metódus a
   *  hívás idejére elnyomja azt a redirectet, a hiba-jelzést (isAuthenticated
   *  flip false-ra) viszont NEM - a hívó ebből tudja meg, hogy a refresh
   *  elbukott, és maga dönt a megjelenítésről.
   *
   *  Elfogadott, ritka él-eset: ha EBBEN a pillanatban egy MÁSIK (ambiens,
   *  háttérben induló) refresh-hiba is lezárul, az is elnyomásra kerülne -
   *  ez a flag nincs hívásonként elkülönítve. A gyakorlatban elhanyagolható
   *  (a háttér-monitor és egy explicit gombnyomás egybeesése rendkívül
   *  ritka), és a `finally` blokk biztosítja, hogy a hívás lezárása UTÁN
   *  minden KÉSŐBBI, ehhez nem kapcsolódó hiba ismét helyesen navigál. */
  async refreshTokenWithoutAutoRedirect(force = false): Promise<string | null> {
    this.suppressAutoRedirectOnRefreshFailure = true;
    try {
      return await this.tokenService.performTokenRefresh(force);
    } finally {
      this.suppressAutoRedirectOnRefreshFailure = false;
    }
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

  // ==================== CROSS-TAB SZINKRON ====================

  /** Ha egy MÁSIK tab kijelentkezik (törli a token/user localStorage-kulcsokat),
   *  a natív 'storage' esemény ezt a tabot is azonnal értesíti — enélkül
   *  isAuthenticated hamisan true maradna a másik tab kijelentkezése után. */
  private setupStorageListener(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEYS.ACCESS_TOKEN || event.key === STORAGE_KEYS.USER_DATA) {
          this.ngZone.run(() => {
            if (!event.newValue) {
              this.performCompleteSignOut();
              return;
            }

            // UI-TT-142: a `teacher_access_token`/`teacher_user_data` kulcsok
            // origin-szintűek (nem tab-szintűek) - egy MÁSIK tabban történő
            // bejelentkezés felülírja őket ennek a tabnak is. Az `else` ág
            // korábban feltétel nélkül átvette az így megjelenő új
            // identitást (initializeAuthState() a friss localStorage-tartalmat
            // olvasná be) - ha az új tárolt user ID-je ELTÉR a jelenleg
            // tartott identitásétól, ez NEM "a saját munkamenetem frissült
            // máshol", hanem "egy másik fiók vált aktívvá ezen a böngészőn" -
            // ilyenkor a helyes válasz egy kényszerített teljes kijelentkezés,
            // ugyanúgy, mint a fenti `!event.newValue` ágnál, NEM egy csendes
            // identitás-csere.
            const currentUserId = this.currentUser()?.id;
            const newUserId = this.tokenService.getStoredUser()?.id;

            if (currentUserId != null && newUserId != null && newUserId !== currentUserId) {
              this.toastService.warning(
                'Kijelentkeztünk, mert egy másik fiók jelentkezett be ezen az eszközön.',
                5000,
              );
              // Regresszió-fix: itt NEM performCompleteSignOut()-ot hívunk. A
              // localStorage EBBEN a pillanatban már a MÁSIK tab friss, érvényes
              // munkamenetét tartalmazza (ő írta felül) - egy tokenService.clearTokens()
              // hívás innen letörölné AZT a legitim, éppen csak most létrejött
              // munkamenetet is, mert a token/user kulcsok origin-szintűek, nem
              // tab-szintűek. Ez saját magát becsapó "storage" eseményt váltana ki
              // a másik tabban, ami így - egy sikeres bejelentkezés UTÁN közvetlenül -
              // magát is csendben kijelentkeztetné. Ezért itt csak EZEN a tabon
              // (memóriában) állítjuk vissza a nem-hitelesített állapotot, a
              // megosztott storage-hoz nem nyúlunk.
              this.signOutLocallyWithoutClearingStorage();
              return;
            }

            this.initializeAuthState();
          });
        }
      });
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

  autoLogin(onSuccess?: () => void, onError?: (message: string) => void): void {
    this._loading.set(true);
    this._error.set(null);

    this.authService
      .autoLogin()
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
          const message =
            err.status === 0
              ? 'Nem sikerült kapcsolódni a szerverhez. Próbáld újra később.'
              : (err.error?.errorMessage ?? err.error?.error ?? 'A bejelentkezés nem sikerült.');
          this._error.set({ message, timestamp: new Date() });
          this._isAuthenticated.set(false);
          if (onError) onError(message);
        },
      });
  }

  signInWithProvider(provider: 'google' | 'facebook' | 'apple'): void {
    this.authService.signInWithProvider(provider);
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
    this.signOutLocallyWithoutClearingStorage();
    if (callback) callback();
  }

  /** Csak ennek a tabnak az in-memory állapotát állítja vissza
   *  nem-hitelesítettre - a megosztott (origin-szintű) localStorage-ot
   *  szándékosan érintetlenül hagyja. Ld. a hívóhely kommentjét.
   *
   *  UI-TT-144: idáig egyetlen hívóhely sem navigált el a jelenleg nyitva
   *  lévő védett oldalról, amikor a munkamenet menet közben érvénytelenné
   *  vált (sem a valódi cross-tab logout, sem a fenti mismatch-ág, sem a
   *  token-refresh-hiba). Az `authGuard` csak route-AKTIVÁLÁSKOR fut le, a
   *  `<router-outlet>` sosem volt `isAuthenticated()`-hez kötve - a már
   *  megjelenített védett tartalom (pl. diáklista, "Eltávolítás" gombokkal)
   *  a fejléc frissülése után is látható/kattintható maradt, amíg valaki
   *  manuálisan nem navigált. Mivel ez a metódus pontosan a saját munkamenet
   *  tényleges érvénytelenné válásának közös pontja (nem fut le Tab B-nél,
   *  aki épp legitim módon jelentkezett be - ld. fenti mismatch-ág), itt a
   *  helyes hely az elnavigálásra is. */
  private signOutLocallyWithoutClearingStorage(navigateOnSignOut = true): void {
    const wasAuthenticated = this._isAuthenticated() === true;

    this._loginResponse.set(null);
    this._isAuthenticated.set(false);
    this._error.set(null);

    if (wasAuthenticated && navigateOnSignOut) {
      this.router.navigateByUrl('/login');
    }
  }

  clearError(): void {
    this._error.set(null);
  }
}
