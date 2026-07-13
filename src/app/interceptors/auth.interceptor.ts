import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, from, Observable, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../services/auth/store/auth.store';
import { ToastService } from '../shared/toast/toast.service';

/**
 * Token-csatolás + 401-re refresh-és-újrapróbálkozás, plusz globális
 * hiba-toast a MUTÁCIÓKRA (nem-GET): a backend OrafoglaloException-jei itt
 * érnek felszínre, komponensenkénti hibakezelés nélkül. A GET/betöltési
 * hibák a store-ok inline error() megjelenítésén maradnak (nincs dupla
 * jelentés).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const toastService = inject(ToastService);

  if (isPublicEndpoint(req.url)) {
    return next(req);
  }

  return defer(() => from(authStore.getValidAccessToken())).pipe(
    switchMap((token): Observable<HttpEvent<unknown>> => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

      const handleFinalError = (error: HttpErrorResponse): Observable<never> => {
        if (req.method !== 'GET') {
          toastService.danger(mutationErrorMessage(error));
        }
        return throwError(() => error);
      };

      return next(authReq).pipe(
        catchError((error: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
          if (error.status === 401 && token && !req.url.includes('/refresh')) {
            return handleTokenRefresh(authStore, req, next, error).pipe(
              catchError((retryOrRefreshError: HttpErrorResponse) => {
                // UI-TT-51: ha a refresh maga hiúsult meg, handleTokenRefresh
                // szándékosan UGYANAZT az originalError (401) referenciát dobja
                // tovább — azt változatlanul, extra toast nélkül adjuk tovább
                // (ez nem ennek a jegynek a hatóköre). Ha viszont ez egy MÁSIK
                // hiba (az ÚJRAKÜLDÖTT kérés saját válasza, pl. 409/400 üzleti
                // hiba), azt NEM szabad elnyelni: ugyanazon a toast+propagate
                // logikán kell átfutnia, mint bármelyik más mutáció-hibának.
                if (retryOrRefreshError === error) {
                  return throwError(() => retryOrRefreshError);
                }
                return handleFinalError(retryOrRefreshError);
              }),
            );
          }
          return handleFinalError(error);
        }),
      );
    }),
  );
};

function mutationErrorMessage(error: HttpErrorResponse): string {
  return error.error?.error ?? error.error?.errorMessage ?? 'A művelet sikertelen.';
}

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
  );
}

function isPublicEndpoint(url: string): boolean {
  return ['/auth/login', '/auth/refresh'].some((endpoint) => url.includes(endpoint));
}
