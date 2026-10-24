import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destruktív műveletnél piros megerősítő gomb. */
  danger?: boolean;
}

/** A natív window.confirm() Promise-alapú kiváltása. A dialógus-komponens
 *  egyszer van mountolva az AppComponent-ben, és a pending signal vezérli.
 *  Hívóhely-minta: if (!(await this.confirmService.ask({...}))) return; */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _pending = signal<ConfirmOptions | null>(null);
  readonly pending = this._pending.asReadonly();

  private resolveFn: ((result: boolean) => void) | null = null;

  constructor() {
    // UI-TT-246: a dialógus a hívó oldalhoz tartozik - ha a tanár válasz nélkül elnavigál (Vissza, menü), elutasítottként
    // zárjuk, különben a ROSSZ oldal fölött maradt nyitva, és onnan megerősítve a (destruktív) művelet mégis lefutott.
    // Az elhagyás-őr (canDeactivate) saját kérdése a NavigationStart UTÁN nyílik, azt ez nem zárja be.
    inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationStart), takeUntilDestroyed())
      .subscribe(() => {
        if (this.resolveFn) this.resolve(false);
      });
  }

  ask(options: ConfirmOptions): Promise<boolean> {
    // Ha valamiért már nyitva van egy dialógus, azt elutasítottként zárjuk.
    this.resolveFn?.(false);

    this._pending.set(options);
    return new Promise<boolean>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  resolve(result: boolean): void {
    this._pending.set(null);
    this.resolveFn?.(result);
    this.resolveFn = null;
  }
}
