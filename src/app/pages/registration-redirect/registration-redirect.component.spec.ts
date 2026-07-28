import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Router, provideRouter } from '@angular/router';
import { RegistrationRedirectComponent } from './registration-redirect.component';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';

// 0.C-4: a `teachers.patricks.hu/registration` élesben 404-et adott - a tanári appnak nincs
// regisztrációs útvonala, így egy "regisztrálj a teachers.patricks.hu-n" utasítást követő
// tanár zsákutcába futott. Saját űrlapot azért nem lehet ide tenni, mert a backend a
// megerősítő email linkjét mindig a diák-app alá építi (ld. a komponens doc-commentjét).
describe('RegistrationRedirectComponent', () => {
  const expectedUrl = `${environment.studentAppUrl}/registration`;
  let replaceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceSpy = vi.fn();

    TestBed.configureTestingModule({ imports: [RegistrationRedirectComponent] });

    // A DOCUMENT-et NEM cseréljük le teljesen: a TestBed a valódi documentre támaszkodik a
    // root-elem létrehozásakor (`querySelectorAll`), egy csupasz mock elhasalna rajta. Csak
    // a navigációt végző `defaultView.location`-t helyettesítjük.
    const realDocument = TestBed.inject(DOCUMENT);
    vi.spyOn(realDocument, 'defaultView', 'get').mockReturnValue({
      location: { replace: replaceSpy },
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('betöltéskor a diák-app regisztrációs oldalára irányít', () => {
    const fixture = TestBed.createComponent(RegistrationRedirectComponent);
    fixture.detectChanges();

    expect(replaceSpy).toHaveBeenCalledWith(expectedUrl);
  });

  // A `location.replace` és nem `href` azért fontos, hogy a regisztrációs oldalról
  // visszalépve a felhasználó ne essen vissza erre az azonnal továbbdobó oldalra.
  it('replace-t használ, hogy a vissza gomb ne ragadjon be az átirányításon', () => {
    const fixture = TestBed.createComponent(RegistrationRedirectComponent);
    fixture.detectChanges();

    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });

  // Ha a JS-átirányítás bármiért nem fut le, a felhasználónak kattintható kiútja marad.
  it('tartalék linket is kirenderel a regisztrációra', () => {
    const fixture = TestBed.createComponent(RegistrationRedirectComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe(expectedUrl);
  });
});

// Regresszió-védelem: a két útvonal léte a lényeg - enélkül a `**` ág 404-re viszi őket.
describe('regisztrációs útvonalak', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('a /registration és /regisztracio útvonal létezik, nem esik a 404-re', () => {
    const router = TestBed.inject(Router);
    const paths = router.config.map((r) => r.path);

    expect(paths).toContain('registration');
    expect(paths).toContain('regisztracio');
  });
});
