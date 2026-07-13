import { FormControl } from '@angular/forms';
import { notBlankValidator } from './not-blank.validator';

describe('notBlankValidator', () => {
  it('whitespace-only értéknél "blank" hibát ad', () => {
    const control = new FormControl('   ', notBlankValidator());
    expect(control.errors).toEqual({ blank: true });
  });

  it('valódi tartalomnál érvényes', () => {
    const control = new FormControl('Feladatsor cím', notBlankValidator());
    expect(control.errors).toBeNull();
  });

  it('üres string esetén NEM ad hibát — ezt a Validators.required kezeli', () => {
    const control = new FormControl('', notBlankValidator());
    expect(control.errors).toBeNull();
  });

  it('vezető/záró szóközzel körülvett, de valódi tartalmú értéknél érvényes', () => {
    const control = new FormControl('  Feladatsor cím  ', notBlankValidator());
    expect(control.errors).toBeNull();
  });
});
