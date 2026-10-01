/**
 * A BE időpontjai UTC-ben jönnek, de a DB-ből olvasott DateTime zóna-jelölés nélkül szerializálódik
 * (Npgsql legacy timestamp) - jelölés nélküli értéket UTC-nek tekintünk, a jelöltet változatlanul hagyjuk.
 */
export function parseUtc(timestamp: string): number {
  const hasTimezone = /Z$|[+-]\d\d:\d\d$/.test(timestamp);
  return Date.parse(hasTimezone ? timestamp : timestamp + 'Z');
}
