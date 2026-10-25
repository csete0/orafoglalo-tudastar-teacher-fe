import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthStore } from '../services/auth/store/auth.store';
import { ToastService } from '../shared/toast/toast.service';
import { DEMO_RESTRICTED_MESSAGE } from '../models/demo-session.model';

/** Demó-fiókban nem elérhető oldal (intézményi érdeklődés - PATRICKS-DEMO-KORNYEZET-TERV.md F6): a vezérlőpultra visz, üzenettel. */
export const demoRestrictedGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  const toast = inject(ToastService);
  await authStore.ensureInitialization();
  if (!authStore.isDemo()) return true;
  toast.warning(DEMO_RESTRICTED_MESSAGE);
  return router.createUrlTree(['/dashboard']);
};
