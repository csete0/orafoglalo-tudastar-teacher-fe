import { DestroyRef, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { PublishResultDto } from '../models/teacher-content.model';
import { extractErrorMessage } from '../shared/http-error/extract-error-message.util';

/**
 * A szerkesztő-store-ok (`TeacherTaskSetStore`, `TeacherQuizStore`) közös szelete a
 * „mutáció, majd a részlet újratöltése” folyamathoz. A store-ok `providedIn: 'root'`-ok,
 * a `takeUntilDestroyed` a store-hoz (nem a komponenshez) kötött, ezért egy elhagyott
 * entitás mutációjának KÉSVE érkező válasza a navigáció után is befut.
 */
export interface DetailReloadTarget {
  readonly destroyRef: DestroyRef;
  readonly loading: WritableSignal<boolean>;
  readonly error: WritableSignal<string | null>;
  readonly publishResult: WritableSignal<PublishResultDto | null>;
  /** A részlet-betöltő AKTUÁLIS célpontja; `null`, ha még semmit nem töltött be. */
  readonly currentId: () => number | null;
  /** A store generáció-védett `loadDetail()`-je. */
  readonly reload: (id: number, onSuccess?: () => void) => void;
}

/**
 * UI-TT-156 / TEACH-6 / TEACH-8: igaz, ha a tanár időközben egy MÁSIK entitásra navigált.
 * Ilyenkor az elhagyott mutáció válasza (siker és hiba egyaránt) semmit nem írhat: a
 * generáció-számláló ezt nem akadályozná meg, mert az elhagyott újratöltés indulna
 * utoljára, tehát az kapná a legmagasabb generációt, és a megnyitott nézetet írná felül.
 *
 * A `null` szándékosan átenged: ilyenkor nincs megjelenített entitás, amit felül lehetne
 * írni, viszont a UI-TT-45 szerződés (a `loading` csak az újratöltés végén vált false-ra)
 * ezen az újratöltésen múlik, blokkolva a spinner örökre bent ragadna.
 */
function isAbandoned(target: DetailReloadTarget, id: number): boolean {
  const current = target.currentId();
  return current !== null && current !== id;
}

/**
 * Mutáció, utána a részlet újratöltése. A `loading` a mutáció válasza után is true marad,
 * amíg az újratöltés `finalize()`-a le nem zárja (UI-TT-45), különben a UI a frissített
 * állapot előtt jelezné a művelet végét. Elhagyott célpontnál a `loading`-ot sem
 * állítjuk vissza: az ekkor már a célpontot átállító, frissebb betöltés tulajdona.
 */
export function mutateAndReload<T>(
  target: DetailReloadTarget,
  source: Observable<T>,
  id: number,
  onSuccess?: () => void,
): void {
  target.loading.set(true);
  target.error.set(null);

  source.pipe(take(1), takeUntilDestroyed(target.destroyRef)).subscribe({
    next: () => {
      if (isAbandoned(target, id)) return;
      target.reload(id, onSuccess);
    },
    error: (err) => {
      if (isAbandoned(target, id)) return;
      target.error.set(extractErrorMessage(err, 'A művelet sikertelen.'));
      target.loading.set(false);
    },
  });
}

/**
 * Publikálás, sikeres validáció után a részlet újratöltése. A `publish` gyár csak a
 * `loading`-őr UTÁN fut le, így folyamatban lévő művelet alatt hívás sem indul.
 * Sikeres publikálásnál a `loading` az újratöltés végéig true marad (UI-TT-45).
 */
export function publishAndReload(
  target: DetailReloadTarget,
  publish: () => Observable<PublishResultDto>,
  id: number,
  onSuccess?: () => void,
): void {
  if (target.loading()) return;

  target.loading.set(true);
  target.error.set(null);

  publish()
    .pipe(take(1), takeUntilDestroyed(target.destroyRef))
    .subscribe({
      next: (result) => {
        if (isAbandoned(target, id)) return;

        target.publishResult.set(result);
        if (result.success) {
          target.reload(id, onSuccess);
        } else {
          target.loading.set(false);
        }
      },
      error: (err) => {
        if (isAbandoned(target, id)) return;

        target.error.set(extractErrorMessage(err, 'A publikálás sikertelen.'));
        target.loading.set(false);
      },
    });
}
