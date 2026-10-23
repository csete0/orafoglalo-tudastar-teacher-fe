import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogShellComponent } from './dialog-shell.component';

@Component({
  standalone: true,
  imports: [DialogShellComponent],
  template: `
    @if (open()) {
      <app-dialog-shell labelledBy="t-title" describedBy="t-help" testId="t-dialog" backdropTestId="t-backdrop"
                        panelClass="card max-w-lg" [closeOnBackdrop]="closeOnBackdrop()" [align]="align()" [backdropClass]="backdropClass()"
                        (closed)="closedCount = closedCount + 1">
        <h2 id="t-title">Cím</h2>
        <p id="t-help">Súgó</p>
        <button type="button" data-testid="t-plain">Sima</button>
        @if (withAutofocus()) {
          <button type="button" data-testid="t-autofocus" data-dialog-autofocus>Fő gomb</button>
        }
      </app-dialog-shell>
    }
  `,
})
class HostComponent {
  readonly open = signal(true);
  readonly closeOnBackdrop = signal(true);
  readonly align = signal<'center' | 'top'>('top');
  readonly withAutofocus = signal(false);
  readonly backdropClass = signal('bg-black/40');
  closedCount = 0;
}

describe('DialogShellComponent', () => {
  function setup(configure?: (host: HostComponent) => void) {
    const fixture = TestBed.createComponent(HostComponent);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="t-dialog"]') as HTMLElement;
    return { fixture, host: fixture.componentInstance, el, panel };
  }

  it('a panel role, aria-modal, aria-labelledby/-describedby és a hívó osztályai szerint renderel', () => {
    const { panel } = setup();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe('t-title');
    expect(panel.getAttribute('aria-describedby')).toBe('t-help');
    expect(panel.hasAttribute('aria-label')).toBe(false);
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(panel.classList).toContain('relative');
    expect(panel.classList).toContain('card');
    expect(panel.classList).toContain('max-w-lg');
    expect(panel.textContent).toContain('Súgó');
  });

  it('top igazítás: felülről, görgethető; center: középre', () => {
    const top = setup().el.querySelector('.fixed.inset-0') as HTMLElement;
    expect(top.classList).toContain('items-start');
    expect(top.classList).toContain('overflow-y-auto');

    const center = setup((h) => h.align.set('center')).el.querySelector('.fixed.inset-0') as HTMLElement;
    expect(center.classList).toContain('items-center');
    expect(center.classList).not.toContain('overflow-y-auto');
  });

  it('a háttér alapból bg-black/40, a hívó felülírhatja (pl. képnagyító)', () => {
    const backdrop = setup().el.querySelector('[data-testid="t-backdrop"]') as HTMLElement;
    expect(backdrop.classList).toContain('fixed');
    expect(backdrop.classList).toContain('bg-black/40');

    const dark = setup((h) => h.backdropClass.set('bg-black/80')).el.querySelector('[data-testid="t-backdrop"]') as HTMLElement;
    expect(dark.classList).toContain('inset-0');
    expect(dark.classList).toContain('bg-black/80');
    expect(dark.classList).not.toContain('bg-black/40');
  });

  it('Escape a dialógusban closed-ot emittál', () => {
    const { host, panel } = setup();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.closedCount).toBe(1);
  });

  it('a háttérkattintás alapból zár, closeOnBackdrop=false esetén nem', () => {
    const first = setup();
    (first.el.querySelector('[data-testid="t-backdrop"]') as HTMLElement).click();
    expect(first.host.closedCount).toBe(1);

    const second = setup((h) => h.closeOnBackdrop.set(false));
    (second.el.querySelector('[data-testid="t-backdrop"]') as HTMLElement).click();
    expect(second.host.closedCount).toBe(0);
  });

  it('megnyitáskor a panelre, [data-dialog-autofocus] esetén arra az elemre fókuszál', async () => {
    const plain = setup();
    await plain.fixture.whenStable();
    expect(document.activeElement).toBe(plain.panel);
    plain.fixture.destroy();

    const withTarget = setup((h) => h.withAutofocus.set(true));
    await withTarget.fixture.whenStable();
    expect(document.activeElement).toBe(withTarget.el.querySelector('[data-testid="t-autofocus"]'));
    withTarget.fixture.destroy();
  });

  it('bezáráskor a fókusz visszakerül a megnyitó elemre', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    try {
      trigger.focus();
      const { fixture, host, panel } = setup();
      await fixture.whenStable();
      expect(document.activeElement).toBe(panel);

      host.open.set(false);
      fixture.detectChanges();

      expect(document.activeElement).toBe(trigger);
    } finally {
      document.body.removeChild(trigger);
    }
  });
});
