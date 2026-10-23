import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  it('404-et ír ki, és a vezérlőpultra visz vissza', () => {
    TestBed.configureTestingModule({ imports: [NotFoundComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('404');
    expect(el.textContent).toContain('Az oldal nem található.');
    const link = el.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.textContent).toContain('Vissza a vezérlőpultra');
  });
});
