import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ValidationErrors, ValidatorFn } from '@angular/forms';

/** A dolgozat időkorlátjának határai (a szerver is ellenőrzi: ClassTestService.Min/MaxTimeLimitMinutes). */
export const TEST_MIN_MINUTES = 5;
export const TEST_MAX_MINUTES = 240;

/**
 * Kiadás-űrlap csoport-validátora (`opensAt`, `dueAt`, `isTest`, `timeLimitMinutes` vezérlők): a nyitás nem lehet a határidő után;
 * dolgozatnál kötelező az időablak, a befejezés a jövőben, az időkorlát 5-240 perc, és az ablak legalább az időkorlátnyi.
 * Feladatsor-, kvíz- és elméleti dolgozat kiadásánál ugyanaz a szabály.
 */
export function testWindowValidator(): ValidatorFn {
  return (group) => {
    const opensAt: string = group.get('opensAt')?.value ?? '';
    const dueAt: string = group.get('dueAt')?.value ?? '';
    if (opensAt && dueAt && new Date(opensAt) > new Date(dueAt)) return { opensAtAfterDueAt: true };
    const rawMinutes: unknown = group.get('timeLimitMinutes')?.value;
    const minutes = Number(rawMinutes);
    const minutesValid = minutes >= TEST_MIN_MINUTES && minutes <= TEST_MAX_MINUTES;
    if (!(group.get('isTest')?.value ?? true)) {
      // Sima kiadásnál az időkorlát nem kötelező, de ha meg van adva, ugyanaz a határ.
      return rawMinutes === null || rawMinutes === '' || rawMinutes === undefined || minutesValid ? null : { testTimeLimit: true };
    }
    if (!opensAt || !dueAt) return { testWindowRequired: true };
    if (new Date(dueAt).getTime() <= Date.now()) return { testDueInPast: true };
    if (!minutesValid) return { testTimeLimit: true };
    if ((new Date(dueAt).getTime() - new Date(opensAt).getTime()) / 60000 < minutes) return { testWindowTooShort: true };
    return null;
  };
}

/** A {@link testWindowValidator} hibáinak szövege az űrlap alatt. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-test-window-errors',
  host: { class: 'contents' },
  template: `
    @if (errors()?.['opensAtAfterDueAt']) {
      <p class="text-sm text-danger">A nyitás dátuma nem lehet a határidő után.</p>
    }
    @if (errors()?.['testWindowRequired']) {
      <p class="text-sm text-text-muted">Dolgozatnál add meg, mettől meddig írható meg.</p>
    }
    @if (errors()?.['testDueInPast']) {
      <p class="text-sm text-danger">A dolgozat határideje már elmúlt - adj meg egy jövőbeli időpontot.</p>
    }
    @if (errors()?.['testTimeLimit']) {
      <p class="text-sm text-danger">Az időkorlát {{ min }} és {{ max }} perc között lehet.</p>
    }
    @if (errors()?.['testWindowTooShort']) {
      <p class="text-sm text-danger">A megírható időszak legyen legalább olyan hosszú, mint az időkorlát.</p>
    }
  `,
})
export class TestWindowErrorsComponent {
  readonly errors = input<ValidationErrors | null>(null);
  protected readonly min = TEST_MIN_MINUTES;
  protected readonly max = TEST_MAX_MINUTES;
}
