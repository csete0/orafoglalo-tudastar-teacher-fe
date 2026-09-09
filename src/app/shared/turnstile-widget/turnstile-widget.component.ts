import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, inject, output, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let scriptLoadPromise: Promise<void> | null = null;

/**
 * UI-TS-374: Cloudflare Turnstile widget. A `challenges.cloudflare.com` scriptet csak
 * kliens-oldalon, csak akkor tölti be, amikor ez a komponens ténylegesen megjelenik
 * (regisztráció) - ugyanaz a "csak a konkrét tranzakcióhoz szükséges, csalásmegelőzési
 * célú, hozzájárulás nélkül is jogszerű" minta, mint a Stripe.js-nél (ld. index.html
 * UI-TS-237 komment), nem az on-load index.html-es minta.
 */
@Component({
  selector: 'app-turnstile-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<div #container></div>`,
})
export class TurnstileWidgetComponent implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

  readonly tokenChange = output<string | null>();

  private widgetId: string | null = null;

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser || !environment.turnstileSiteKey) {
      return;
    }
    try {
      await this.loadScript();
      this.render();
    } catch {
      this.tokenChange.emit(null);
    }
  }

  ngOnDestroy(): void {
    if (this.widgetId && this.isBrowser) {
      window.turnstile?.remove(this.widgetId);
    }
  }

  /** Turnstile tokenek egyszer-használatosak - sikertelen submit után újra kell futtatni a widgetet. */
  reset(): void {
    if (this.widgetId && this.isBrowser) {
      window.turnstile?.reset(this.widgetId);
      this.tokenChange.emit(null);
    }
  }

  private loadScript(): Promise<void> {
    if (window.turnstile) {
      return Promise.resolve();
    }
    if (!scriptLoadPromise) {
      scriptLoadPromise = new Promise((resolve, reject) => {
        const script = this.document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Turnstile script load failed'));
        this.document.head.appendChild(script);
      });
    }
    return scriptLoadPromise;
  }

  private render(): void {
    if (!window.turnstile) {
      return;
    }
    this.widgetId = window.turnstile.render(this.containerRef().nativeElement, {
      sitekey: environment.turnstileSiteKey,
      callback: (token: string) => this.tokenChange.emit(token),
      'error-callback': () => this.tokenChange.emit(null),
      'expired-callback': () => this.tokenChange.emit(null),
    });
  }
}
