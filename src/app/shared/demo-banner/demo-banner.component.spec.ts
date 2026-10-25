import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoBannerComponent } from './demo-banner.component';
import { AuthStore } from '../../services/auth/store/auth.store';
import { DemoSession } from '../../models/demo-session.model';

/** Demó-szalag a tanári appban (PATRICKS-DEMO-KORNYEZET-TERV.md F6). */
describe('DemoBannerComponent', () => {
  const demo = signal<DemoSession | null>(null);

  function render(): HTMLElement {
    TestBed.configureTestingModule({ imports: [DemoBannerComponent], providers: [{ provide: AuthStore, useValue: { demo } }] });
    const fixture = TestBed.createComponent(DemoBannerComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  afterEach(() => demo.set(null));

  it('valódi fióknál nincs szalag', () => {
    expect(render().querySelector('[data-testid="demo-banner"]')).toBeNull();
  });

  it('iskolai demónál a címet és a lejáratot mutatja', () => {
    demo.set({ environmentId: 3, kind: 'school', title: 'Szegedi Radnóti', expiresAt: '2026-11-08T10:00:00', nightlyReset: false });
    const text = render().querySelector('[data-testid="demo-banner"]')?.textContent ?? '';
    expect(text).toContain('Szegedi Radnóti');
    expect(text).toContain('lejár: 2026. 11. 08.');
  });

  it('saját demónál az éjszakai alaphelyzetet jelzi', () => {
    demo.set({ environmentId: 1, kind: 'owner', title: 'Saját demó', expiresAt: null, nightlyReset: true });
    expect(render().textContent).toContain('minden éjjel alaphelyzetbe áll');
  });
});
