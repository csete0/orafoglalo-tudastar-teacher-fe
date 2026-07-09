import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, from, Observable, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../services/auth/store/auth.store';

/**
 * Egyszerűsített változat a diák-repó interceptor.ts-éhez képest: nincs
 * Toast-függőség (a Fázis 8 UI-ja majd megjeleníti a hibákat komponens-
 * szinten) — a token-csatolás + 401-re refresh-és-újrapróbálkozás megmarad.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);

  if (isPublicEndpoint(req.url)) {
    return next(req);
  }

  return defer(() => from(authStore.getValidAccessToken())).pipe(
    switchMap((token): Observable<HttpEvent<unknown>> => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

      return next(authReq).pipe(
        catchError((error: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
          if (error.status === 401 && token && !req.url.includes('/refresh')) {
            return handleTokenRefresh(authStore, req, next, error);
          }
          return throwError(() => error);
        }),
      );
    }),
  );
};

function handleTokenRefresh(
  authStore: AuthStore,
  originalReq: HttpRequest<unknown>,
  next: HttpHandlerFn,
  originalError: HttpErrorResponse,
): Observable<HttpEvent<unknown>> {
  return defer(() => from(authStore.refreshToken())).pipe(
    switchMap((newToken): Observable<HttpEvent<unknown>> => {
      if (!newToken) {
        return throwError(() => originalError);
      }
      const retryReq = originalReq.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
      return next(retryReq);
    }),
    catchError(() => throwError(() => originalError)),
  );
}

function isPublicEndpoint(url: string): boolean {
  return ['/auth/login', '/auth/refresh'].some((endpoint) => url.includes(endpoint));
}
