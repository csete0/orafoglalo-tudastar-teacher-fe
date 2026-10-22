import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { roleGuard } from './guards/role.guard';

/**
 * `data: { wide: true }` = teljes szélességű adatoldal (széles táblázat): az oldal `.page-wide`
 * konténert használ, és az oldalsáv itt alapból összecsukva indul (AppSidebarComponent).
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'oauth-callback',
    loadComponent: () =>
      import('./pages/oauth-callback/oauth-callback.component').then((m) => m.OauthCallbackComponent),
  },
  // 0.C-4: nincs saját regisztrációs űrlap (ld. RegistrationRedirectComponent doc-comment),
  // de a `/registration` sem eshet a 404-re - a diák-app regisztrációjára irányítunk.
  // A magyar alias azért kell, mert a magyar nyelvű felületen ez a kézenfekvő tipp.
  {
    path: 'registration',
    loadComponent: () =>
      import('./pages/registration-redirect/registration-redirect.component').then(
        (m) => m.RegistrationRedirectComponent,
      ),
  },
  {
    path: 'regisztracio',
    loadComponent: () =>
      import('./pages/registration-redirect/registration-redirect.component').then(
        (m) => m.RegistrationRedirectComponent,
      ),
  },
  {
    path: 'jelentkezes',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/jelentkezes/jelentkezes.component').then((m) => m.JelentkezesComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, roleGuard('teacher')],
    loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'intezmenyek',
    canActivate: [authGuard, roleGuard('teacher')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/intezmenyek/intezmenyek-lista.component').then((m) => m.IntezmenyekListaComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./pages/intezmenyek/intezmeny-reszletek.component').then((m) => m.IntezmenyReszletekComponent),
      },
    ],
  },
  {
    path: 'csoportok',
    canActivate: [authGuard, roleGuard('teacher')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/csoportok/csoportok-lista.component').then((m) => m.CsoportokListaComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./pages/csoportok/csoport-reszletek.component').then((m) => m.CsoportReszletekComponent),
      },
    ],
  },
  {
    // Vizsgaremek-csapat (PATRICKS-FEJLESZTOMUHELY-BC-TERV.md 3.): a csoport „Csapatok” füléről.
    path: 'csapatok/:id',
    canActivate: [authGuard, roleGuard('teacher')],
    loadComponent: () => import('./pages/csapatok/csapat-reszletek.component').then((m) => m.CsapatReszletekComponent),
  },
  {
    // Próbaérettségi: a saját csoportok jelentkeztetése és áttekintése (a menüpont csak közzétett eseménynél látszik).
    path: 'probaerettsegi',
    canActivate: [authGuard, roleGuard('teacher')],
    data: { wide: true },
    loadComponent: () =>
      import('./pages/probaerettsegi/probaerettsegi-page.component').then((m) => m.ProbaerettsegiPageComponent),
  },
  {
    // Dolgozat mód: a kiadott dolgozat élő áttekintője (a csoport "Kiadva" füléről / a feladatsor-szerkesztőből).
    path: 'dolgozatok/:assignmentId',
    canActivate: [authGuard, roleGuard('teacher')],
    data: { wide: true },
    loadComponent: () =>
      import('./pages/dolgozatok/dolgozat-attekintes.component').then((m) => m.DolgozatAttekintesComponent),
  },
  {
    path: 'feladatsorok',
    canActivate: [authGuard, roleGuard('teacher')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/feladatsorok/feladatsorok-lista.component').then((m) => m.FeladatsorokListaComponent),
      },
      // A kvíz-útvonalak SZÁNDÉKOSAN a ':id/...' minták ELŐTT állnak; a 'feladatsorok' alatt
      // élnek, mert a Feladatsorok oldal fülsávja (TartalomFulekComponent) is ide visz.
      {
        path: 'kvizek',
        loadComponent: () =>
          import('./pages/feladatsorok/kvizek-lista.component').then((m) => m.KvizekListaComponent),
      },
      // Projektműhely (PATRICKS-PROJEKTMUHELY-2-TERV.md, F+G): a kvízekhez hasonlóan a fülsávban is.
      {
        path: 'projektek',
        loadComponent: () =>
          import('./pages/feladatsorok/projektek-lista.component').then((m) => m.ProjektekListaComponent),
      },
      {
        path: 'projektek/kiadas/:id',
        data: { wide: true },
        loadComponent: () =>
          import('./pages/feladatsorok/projekt-kiadas.component').then((m) => m.ProjektKiadasComponent),
        // El nem fogadott AI-javaslatok (csak a böngészőben élnek) elhagyás előtt megerősítést kérnek.
        canDeactivate: [(c: { canLeave(): boolean | Promise<boolean> }) => c.canLeave()],
      },
      // Szóbeli (PATRICKS-SZOBELI-VIZSGA-2-FAZIS-MEGVALOSITAS.md, T11): a fülsáv negyedik füle; a ':id/...' minták ELŐTT.
      {
        path: 'szobeli',
        loadComponent: () =>
          import('./pages/feladatsorok/szobeli-temak-lista.component').then((m) => m.SzobeliTemakListaComponent),
      },
      {
        path: 'szobeli/uj',
        loadComponent: () =>
          import('./pages/feladatsorok/szobeli-tema-vazlat.component').then((m) => m.SzobeliTemaVazlatComponent),
      },
      {
        path: 'szobeli/kiadas/:id',
        data: { wide: true },
        loadComponent: () =>
          import('./pages/feladatsorok/szobeli-eredmenyek.component').then((m) => m.SzobeliEredmenyekComponent),
      },
      {
        path: 'szobeli/:id',
        loadComponent: () =>
          import('./pages/feladatsorok/szobeli-tema-szerkeszto.component').then((m) => m.SzobeliTemaSzerkesztoComponent),
      },
      {
        path: 'kvizek/:id/szerkesztes',
        loadComponent: () =>
          import('./pages/feladatsorok/kviz-szerkeszto.component').then((m) => m.KvizSzerkesztoComponent),
      },
      {
        path: 'kvizek/:id/eredmenyek',
        data: { wide: true },
        loadComponent: () =>
          import('./pages/feladatsorok/kviz-eredmenyek.component').then((m) => m.KvizEredmenyekComponent),
      },
      {
        // Élő (Kahoot-módú) játék vezérlő-képernyője - a játékmenet a
        // /kahoothub-on zajlik, ez a route csak a host-nézet.
        path: 'kvizek/:id/elo/:kahootSessionId',
        loadComponent: () =>
          import('./pages/feladatsorok/kahoot-host.component').then((m) => m.KahootHostComponent),
      },
      {
        // Háromhasábos szerkesztő (vázlat · tartalom · MI-segítő): az oldalsáv összecsukva indul, hogy a középső hasáb elférjen.
        path: ':id/szerkesztes',
        data: { wide: true },
        loadComponent: () =>
          import('./pages/feladatsorok/feladatsor-szerkeszto.component').then((m) => m.FeladatsorSzerkesztoComponent),
      },
      {
        path: ':id/eredmenyek',
        data: { wide: true },
        loadComponent: () =>
          import('./pages/feladatsorok/feladatsor-eredmenyek.component').then((m) => m.FeladatsorEredmenyekComponent),
      },
    ],
  },
  {
    path: 'diakok/:userId',
    canActivate: [authGuard, roleGuard('teacher')],
    loadComponent: () => import('./pages/diakok/diak-reszletek.component').then((m) => m.DiakReszletekComponent),
  },
  // §3 migráció (PATRICKS-ADMIN-SZETVALASZTAS-TERV.md): a jelentkezések/tanárok/
  // intézmények(admin)/ellenőrzés/kuponok/AI-költés oldalak admin-fe-be költöztek.
  // A `admin/kvizek` + `admin/kvizek/:id/szerkesztes` SZÁNDÉKOSAN maradt itt - a
  // mögöttes AdminQuizController egyelőre a publikus API-ban maradt (a valódi
  // AI-hívás miatti aránytalanul nagy DI-gráf, ld. AdminQuizController doc-kommentje
  // a backend repóban), és ez a route ugyanazokat a tanári kvíz-lista/-szerkesztő
  // komponenseket használja admin-scope-ban, nem saját admin/*.ts oldalt.
  // C5: platform-kvízek ("Hivatalos kvízek") - a tanári kvíz-lista és -szerkesztő
  // ugyanazon komponensei admin-scope-ban (api/admin/… gyökér). Nem kap menüpontot -
  // a belépési pont a vezérlőpult admin-kártyája.
  {
    path: 'admin/kvizek',
    canActivate: [authGuard, roleGuard('admin')],
    data: { scope: 'admin' },
    loadComponent: () =>
      import('./pages/feladatsorok/kvizek-lista.component').then((m) => m.KvizekListaComponent),
  },
  {
    path: 'admin/kvizek/:id/szerkesztes',
    canActivate: [authGuard, roleGuard('admin')],
    data: { scope: 'admin' },
    loadComponent: () =>
      import('./pages/feladatsorok/kviz-szerkeszto.component').then((m) => m.KvizSzerkesztoComponent),
  },
  {
    // B6: Intézményi érdeklődés-űrlap — publikus, authGuard nélkül
    path: 'iskolaknak',
    loadComponent: () =>
      import('./pages/iskolaknak/iskolaknak.component').then((m) => m.IskolakNakComponent),
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: '404',
    loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
  { path: '**', redirectTo: '/404' },
];
