import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TartalomFulekComponent } from './tartalom-fulek.component';

@Component({ selector: 'app-host', imports: [TartalomFulekComponent], template: '<app-tartalom-fulek />' })
class HostComponent {}

describe('TartalomFulekComponent', () => {
  async function at(url: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: 'feladatsorok', component: HostComponent },
        { path: 'feladatsorok/kvizek', component: HostComponent },
        { path: 'feladatsorok/projektek', component: HostComponent },
      ])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    const tabs = Array.from(harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a.tab-btn'));
    return tabs.map(a => ({ label: a.textContent!.trim(), active: a.classList.contains('tab-btn-active'), current: a.getAttribute('aria-current') }));
  }

  it('a közös .tab-btn fülstílust használja, és csak a pontos útvonal fülét jelöli aktívnak (aria-current)', async () => {
    expect(await at('/feladatsorok/kvizek')).toEqual([
      { label: 'Feladatsorok', active: false, current: null },
      { label: 'Kvízek', active: true, current: 'page' },
      { label: 'Projektek', active: false, current: null },
    ]);
  });

  it('a /feladatsorok útvonalon csak a Feladatsorok fül aktív', async () => {
    const tabs = await at('/feladatsorok');
    expect(tabs.filter(t => t.active).map(t => t.label)).toEqual(['Feladatsorok']);
  });

  it('a fülsáv keskeny kijelzőn vízszintesen görgethető, nem tördel', async () => {
    await at('/feladatsorok');
    const nav = document.querySelector('nav[aria-label="Tartalom típusa"]')!;
    expect(nav.classList).toContain('overflow-x-auto');
  });
});
