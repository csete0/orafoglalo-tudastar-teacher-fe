import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
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
    path: 'feladatsorok',
    canActivate: [authGuard, roleGuard('teacher')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/feladatsorok/feladatsorok-lista.component').then((m) => m.FeladatsorokListaComponent),
      },
      {
        path: ':id/szerkesztes',
        loadComponent: () =>
          import('./pages/feladatsorok/feladatsor-szerkeszto.component').then((m) => m.FeladatsorSzerkesztoComponent),
      },
      {
        path: ':id/eredmenyek',
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
  {
    path: 'admin/jelentkezesek',
    canActivate: [authGuard, roleGuard('admin')],
    loadComponent: () =>
      import('./pages/admin/admin-jelentkezesek.component').then((m) => m.AdminJelentkezesekComponent),
  },
  {
    path: 'admin/tanarok',
    canActivate: [authGuard, roleGuard('admin')],
    loadComponent: () =>
      import('./pages/admin/admin-tanarok.component').then((m) => m.AdminTanarokComponent),
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: '404',
    loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
  { path: '**', redirectTo: '/404' },
];
