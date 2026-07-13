import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * UI-TT-60: a beépített `Validators.required` NEM trim-el whitespace-t — egy kizárólag
 * szóközökből álló cím/név "kitöltöttnek" számítana a kliens-oldali validáció szerint,
 * miközben a backend (a .NET `[Required]` DataAnnotation ALAPÉRTELMEZETT trim-elési
 * viselkedése miatt) garantáltan elutasítja, jelzés nélkül arra, MELYIK mező volt hibás.
 *
 * `Validators.required`-del EGYÜTT, nem helyette használandó — az üres mezőt továbbra
 * is a megszokott `required` hibakulcs jelöli, ez a validátor kizárólag a "csak whitespace"
 * esetet fedi le, saját `blank` hibakulccsal, hogy a UI pontosabb üzenetet mutathasson.
 */
export function notBlankValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (typeof value !== 'string' || value.length === 0) return null; // az üres mezőt a required kezeli
    return value.trim().length === 0 ? { blank: true } : null;
  };
}
