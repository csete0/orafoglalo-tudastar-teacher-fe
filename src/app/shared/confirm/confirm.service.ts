import { Injectable, signal } from '@angular/core';

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
