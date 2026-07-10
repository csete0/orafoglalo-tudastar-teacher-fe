import { Injectable, signal } from '@angular/core';

export type ToastState = 'success' | 'warning' | 'danger';

export interface ToastMessage {
  state: ToastState;
  message: string;
}

/** Signal-alapú toast — a diák-app BehaviorSubject-es ToastService-ének
 *  modernizált megfelelője. Egyszerre egy toast látszik; új show() a
 *  korábbi időzítőt elveti. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toast = signal<ToastMessage | null>(null);
  readonly toast = this._toast.asReadonly();

  private timer: ReturnType<typeof setTimeout> | null = null;

  show(state: ToastState, message: string, durationMs = 3000): void {
    if (this.timer) clearTimeout(this.timer);
    this._toast.set({ state, message });
    this.timer = setTimeout(() => this.dismiss(), durationMs);
  }

  success(message: string): void {
    this.show('success', message);
  }

  warning(message: string, durationMs = 3000): void {
    this.show('warning', message, durationMs);
  }

  danger(message: string): void {
    this.show('danger', message);
  }

  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._toast.set(null);
  }
}
