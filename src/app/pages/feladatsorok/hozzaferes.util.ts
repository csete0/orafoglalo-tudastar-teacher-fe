/** A hivatalos (és katalógusból másolt) feladatsorok diák-hozzáférése: a másolat a forrás szintjét örökli. */
export const PAID_ACCESS_TEXT = 'Fizetős – a diákjaidnak előfizetés vagy iskolai licenc kell hozzá; dolgozatban mindenki elérheti.';
export const FREE_ACCESS_TEXT = 'Ingyenes – minden diákod eléri.';

export function isPaidAccess(flags: { isFree?: boolean | null; isPremium?: boolean | null; isPremiumOnly?: boolean | null }): boolean {
  return !!flags.isPremium || !!flags.isPremiumOnly || flags.isFree === false;
}
