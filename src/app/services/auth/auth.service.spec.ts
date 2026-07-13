import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';

function base64UrlEncode(json: string): string {
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Előre legenerált, VALÓS base64url-kódolású payload-szegmens, ami tartalmaz
// egy `_` karaktert (a base64 sima ábécéjében NEM szereplő, base64url-specifikus
// jelet) — pontosan azt a mintát reprodukálja, amin a szabványos atob()
// InvalidCharacterError-t dob. A payload: {"sub":"teacher-B0'a?#","exp":1893456000,"name":"Note yc|%Dl!w,G]-G15mC5W#"}
const BASE64URL_SEGMENT_WITH_UNDERSCORE =
  "eyJzdWIiOiJ0ZWFjaGVyLUIwJ2E_IyIsImV4cCI6MTg5MzQ1NjAwMCwibmFtZSI6Ik5vdGUgeWN8JURsIXcsR10tRzE1bUM1VyMifQ";
const EXPECTED_EXP_SECONDS = 1893456000; // 2030.01.01.

describe('AuthService.getTokenExpiry', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(AuthService);
  });

  // UI-TT-48: a JWT payload base64url-kódolású (RFC 7519) — a `-`/`_`
  // karaktereket tartalmazó, valós, ÉRVÉNYES payload-ok a szabványos atob()-tal
  // dekódolva InvalidCharacterError-t dobtak, amit a catch elnyelt, és a metódus
  // null-t adott vissza — pontosan úgy, mintha a tokennek nem is lenne exp mezője.
  it('BUG UI-TT-48: base64url-specifikus `-`/`_` karaktert tartalmazó payload-ú tokent is helyesen dekódolja', () => {
    expect(BASE64URL_SEGMENT_WITH_UNDERSCORE).toMatch(/[-_]/);

    const token = `header.${BASE64URL_SEGMENT_WITH_UNDERSCORE}.signature`;
    const expiry = service.getTokenExpiry(token);

    expect(expiry).not.toBeNull();
    expect(expiry?.getTime()).toBe(EXPECTED_EXP_SECONDS * 1000);
  });

  it('kontroll: tisztán ASCII (base64url-specifikus karakter nélküli) payload-ú tokent is helyesen dekódol', () => {
    const futureExpSeconds = Math.floor(new Date('2030-06-01T00:00:00Z').getTime() / 1000);
    const payload = { sub: 'user-ascii', exp: futureExpSeconds };
    const segment = base64UrlEncode(JSON.stringify(payload));
    expect(segment).not.toMatch(/[-_]/);

    const token = `header.${segment}.signature`;
    const expiry = service.getTokenExpiry(token);

    expect(expiry).not.toBeNull();
    expect(expiry?.getTime()).toBe(futureExpSeconds * 1000);
  });

  it('exp mező nélküli payload esetén null-t ad vissza', () => {
    const segment = base64UrlEncode(JSON.stringify({ sub: 'user-no-exp' }));
    const token = `header.${segment}.signature`;

    expect(service.getTokenExpiry(token)).toBeNull();
  });

  it('érvénytelen/hibás formátumú token esetén null-t ad vissza (nem dob)', () => {
    expect(service.getTokenExpiry('not-a-valid-jwt')).toBeNull();
  });
});
