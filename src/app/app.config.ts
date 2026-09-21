import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';

// UI-TT-234 (bughunt 2026-09-21): a `'hu'` locale-adat itt SOHA nem volt
// regisztrálva - minden pipe-hívás, ami explicit 'hu' locale-t adott meg
// (pl. `| number: '1.0-0':'hu'`, `| currency: 'HUF':'symbol':'1.0-0':'hu'`)
// az Angular belső `formatNumber`/`formatCurrency` hívásában elhasal, amit a
// DecimalPipe/CurrencyPipe `NG02100 InvalidPipeArgument`-té csomagol újra -
// ettől néma, üres cellák/sorok lettek a render-eredményben (a hiba a
// változásérzékelési kört is megszakítja, ezért a HIBÁS binding UTÁNI
// összes sor is üresen marad). A diák-fe (`orafoglalo-tudastar-fe`)
// `app.config.ts`-e ugyanezt a mintát már helyesen alkalmazza - ide is
// átemelve.
registerLocaleData(localeHu);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'hu' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor]), withFetch()),
  ],
};
