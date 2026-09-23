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
