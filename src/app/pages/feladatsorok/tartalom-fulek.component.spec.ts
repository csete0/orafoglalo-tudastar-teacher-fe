import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TartalomFulekComponent } from './tartalom-fulek.component';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';

@Component({ selector: 'app-host', imports: [TartalomFulekComponent], template: '<app-tartalom-fulek />' })
class HostComponent {}

describe('TartalomFulekComponent', () => {
  async function at(url: string, oralAvailable = false) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'feladatsorok', component: HostComponent },
          { path: 'feladatsorok/kvizek', component: HostComponent },
          { path: 'feladatsorok/projektek', component: HostComponent },
          { path: 'feladatsorok/szobeli', component: HostComponent },
          { path: 'feladatsorok/szobeli/:id', component: HostComponent },
        ]),
        { provide: TeacherOralExamService, useValue: { available: signal(oralAvailable) } },
      ],
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

  it('bekapcsolt szóbelinél negyedik fül a „Szóbeli”, a téma-oldalakon is aktív; kikapcsolva nincs', async () => {
    const tabs = await at('/feladatsorok/szobeli/5', true);
    expect(tabs.map(t => t.label)).toEqual(['Feladatsorok', 'Kvízek', 'Projektek', 'Szóbeli']);
    expect(tabs.filter(t => t.active).map(t => t.label)).toEqual(['Szóbeli']);

    TestBed.resetTestingModule();
    expect((await at('/feladatsorok')).map(t => t.label)).not.toContain('Szóbeli');
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
