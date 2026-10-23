import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HELP_VIDEOS, VideoHelpComponent } from './video-help.component';

describe('VideoHelpComponent', () => {
  it('az Oktatóvideók oldalt nyitja a képernyő videójával, akadálymentes névvel', () => {
    TestBed.configureTestingModule({ imports: [VideoHelpComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(VideoHelpComponent);
    fixture.componentRef.setInput('video', 'csoportok');
    fixture.detectChanges();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[data-testid="video-help"]');
    expect(link.getAttribute('href')).toBe(`/oktatovideok?v=${HELP_VIDEOS.csoportok.id}`);
    expect(link.getAttribute('aria-label')).toBe('Oktatóvideó: Csoport létrehozása és diákok meghívása');
    expect(link.title).toBe(link.getAttribute('aria-label'));
  });

  it('minden súgó-videó azonosítója a manifest formátumának megfelelő, és egyedi', () => {
    const ids = Object.values(HELP_VIDEOS).map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/));
  });
});
