import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { retry } from 'rxjs/operators';
import { TIMING_CONFIG, STORAGE_KEYS, StoredAuthData, TeacherUserLoginDto, LoginResponseDto } from '../../models/auth.model';
import { AuthService } from './auth.service';

/**
 * Portolva a diák-repó token.service.ts-éből (copy-adapt) — a mag-mechanika
 * (cache+mutex-védett token-lekérés, cookie-alapú refresh) azonos, a
 * teszt-nélküli/OAuth-specifikus részek (theme sync stb.) nélkül.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly authService = inject(AuthService);

  private tokenCache: { accessToken: string | null; timestamp: number } | null = null;
  private getAccessTokenPromise: Promise<string | null> | null = null;
  private getValidAccessTokenPromise: Promise<string | null> | null = null;
  private refreshInProgress = false;

  onTokenRefreshed?: (response: LoginResponseDto) => Promise<void>;
  onTokenRefreshFailed?: () => Promise<void>;

  private localStorageAvailable: boolean | null = null;

  private isLocalStorageAvailable(): boolean {
    if (this.localStorageAvailable !== null) return this.localStorageAvailable;
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      this.localStorageAvailable = true;
    } catch {
      this.localStorageAvailable = false;
    }
    return this.localStorageAvailable;
  }

  saveToStorage(key: string, value: string): void {
    if (!this.isLocalStorageAvailable()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // no-op: tárolás sikertelen (pl. privát böngészés) — az app tokent memóriában cache-eli
    }
  }

  getFromStorage(key: string): string | null {
    if (!this.isLocalStorageAvailable()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  removeFromStorage(key: string): void {
    if (!this.isLocalStorageAvailable()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // no-op
    }
  }

  async saveTokenPair(accessToken: string, user?: TeacherUserLoginDto): Promise<void> {
    this.saveToStorage(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    if (user) {
      this.saveToStorage(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    }
    this.saveToStorage(STORAGE_KEYS.AUTH_TIMESTAMP, Date.now().toString());
    this.tokenCache = { accessToken, timestamp: Date.now() };
  }

  async clearTokens(): Promise<void> {
    this.tokenCache = null;
    this.removeFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
    this.removeFromStorage(STORAGE_KEYS.USER_DATA);
    this.removeFromStorage(STORAGE_KEYS.AUTH_TIMESTAMP);
  }

  getStoredUser(): TeacherUserLoginDto | null {
    try {
      const userJson = this.getFromStorage(STORAGE_KEYS.USER_DATA);
      return userJson ? (JSON.parse(userJson) as TeacherUserLoginDto) : null;
    } catch {
      return null;
    }
  }

  isValidTokenFormat(token: string): boolean {
    return token.split('.').length === 3;
  }

  shouldRefreshToken(token: string): boolean {
    try {
      const expiry = this.authService.getTokenExpiry(token);
      if (!expiry) return true;
      return expiry.getTime() - Date.now() <= TIMING_CONFIG.REFRESH_THRESHOLD;
    } catch {
      return true;
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (this.tokenCache && Date.now() - this.tokenCache.timestamp < TIMING_CONFIG.TOKEN_CACHE_DURATION) {
      return this.tokenCache.accessToken;
    }

    if (this.getAccessTokenPromise) {
      return this.getAccessTokenPromise;
    }

    this.getAccessTokenPromise = this.fetchAccessToken();
    try {
      return await this.getAccessTokenPromise;
    } catch {
      return null;
    } finally {
      this.getAccessTokenPromise = null;
    }
  }

  private async fetchAccessToken(): Promise<string | null> {
    const token = this.getFromStorage(STORAGE_KEYS.ACCESS_TOKEN);

    if (token && !this.isValidTokenFormat(token)) {
      await this.clearTokens();
      return null;
    }

    this.tokenCache = { accessToken: token, timestamp: Date.now() };
    return token;
  }

  async getValidAccessToken(): Promise<string | null> {
    if (this.getValidAccessTokenPromise) {
      return this.getValidAccessTokenPromise;
    }

    this.getValidAccessTokenPromise = this.fetchValidAccessToken();
    try {
      return await this.getValidAccessTokenPromise;
    } finally {
      this.getValidAccessTokenPromise = null;
    }
  }

  private async fetchValidAccessToken(): Promise<string | null> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return null;

    if (this.shouldRefreshToken(accessToken)) {
      if (this.refreshInProgress) {
        // UI-TT-44: egy MÁSHONNAN már folyamatban lévő refresh esetén ne a
        // lejárat előtt álló régi tokent adjuk vissza — várjuk meg ugyanazt
        // a folyamatban lévő refresh-t, és annak eredményét adjuk tovább.
        return this.waitForRefresh();
      }
      const newToken = await this.performTokenRefresh();
      return newToken || accessToken;
    }

    return accessToken;
  }

  async performTokenRefresh(): Promise<string | null> {
    if (this.refreshInProgress) {
      return this.waitForRefresh();
    }

    this.refreshInProgress = true;

    try {
      const response = await firstValueFrom(
        this.authService.refreshTokens().pipe(retry({ count: 2, delay: 1000 })),
      );

      if (response?.accessToken) {
        await this.saveTokenPair(response.accessToken, response.user);
        if (this.onTokenRefreshed) {
          await this.onTokenRefreshed(response);
        }
        return response.accessToken;
      }

      throw new Error('Invalid refresh response');
    } catch {
      await this.clearTokens();
      if (this.onTokenRefreshFailed) {
        await this.onTokenRefreshFailed();
      }
      return null;
    } finally {
      this.refreshInProgress = false;
    }
  }

  get isRefreshInProgress(): boolean {
    return this.refreshInProgress;
  }

  private async waitForRefresh(): Promise<string | null> {
    const maxWait = 10000;
    const startTime = Date.now();

    while (this.refreshInProgress && Date.now() - startTime < maxWait) {
      await this.delay(100);
    }

    return this.refreshInProgress ? null : this.getAccessToken();
  }

  async getStoredAuthData(): Promise<StoredAuthData | null> {
    const accessToken = this.getFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) return null;

    const user = this.getStoredUser();
    return { accessToken, user: user! };
  }

  clearCache(): void {
    this.tokenCache = null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
