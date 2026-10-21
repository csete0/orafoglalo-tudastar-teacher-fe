import { Route } from '@angular/router';
import { routes } from './app.routes';

/**
 * T-A6 (PATRICKS-ADMIN-SZETVALASZTAS-TERV.md §9): a §3 migráció után ebben az appban
 * NEM maradhat platform-admin route a migrált oldalakra - azok admin-fe-ben élnek. Ha
 * valaki visszahozná valamelyiket ide, ez a teszt elbukik. Az `admin/kvizek` +
 * `admin/kvizek/:id/szerkesztes` SZÁNDÉKOSAN kivétel (ld. app.routes.ts doc-kommentje -
 * az AdminQuizController egyelőre a publikus API-ban maradt).
 */
describe('app.routes - T-A6: migrált admin oldalak nem térhetnek vissza', () => {
  const migratedPaths = [
    'admin/jelentkezesek',
    'admin/tanarok',
    'admin/intezmenyek',
    'admin/ellenorzes',
    'admin/kuponok',
    'admin/ai-koltes',
  ];

  it.each(migratedPaths)('nincs "%s" route ebben az appban', (path) => {
    expect(routes.some((r) => r.path === path)).toBe(false);
  });

  it('az admin/kvizek route (szándékos kivétel) továbbra is megvan', () => {
    expect(routes.some((r) => r.path === 'admin/kvizek')).toBe(true);
  });
});

describe('app.routes - teljes szélességű adatoldalak (data.wide)', () => {
  /** Az útvonalfa laposítva, teljes (szülő/gyerek) útvonallal. */
  function flatten(list: Route[], prefix = ''): { path: string; route: Route }[] {
    return list.flatMap((r) => {
      const path = [prefix, r.path].filter(Boolean).join('/');
      return [{ path, route: r }, ...flatten(r.children ?? [], path)];
    });
  }
  const all = flatten(routes);
  const widePaths = [
    'feladatsorok/:id/eredmenyek',
    'dolgozatok/:assignmentId',
    'feladatsorok/kvizek/:id/eredmenyek',
    'probaerettsegi',
    'feladatsorok/projektek/kiadas/:id',
    // A háromhasábos szerkesztő is: az oldalsáv összecsukva indul.
    'feladatsorok/:id/szerkesztes',
  ];

  it.each(widePaths)('"%s" teljes szélességű', (path) => {
    expect(all.find((r) => r.path === path)?.route.data?.['wide']).toBe(true);
  });

  it('más útvonal nem az', () => {
    const others = all.filter((r) => r.route.data?.['wide'] === true && !widePaths.includes(r.path));
    expect(others.map((r) => r.path)).toEqual([]);
  });
});
