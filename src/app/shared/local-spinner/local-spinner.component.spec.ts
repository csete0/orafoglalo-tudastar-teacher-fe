import { TestBed } from '@angular/core/testing';
import { LocalSpinnerComponent } from './local-spinner.component';

describe('LocalSpinnerComponent', () => {
  it('status szerepű, alapból „Betöltés…” felirattal; üres címkénél felirat nélkül', () => {
    const fixture = TestBed.createComponent(LocalSpinnerComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.textContent).toContain('Betöltés…');

    fixture.componentRef.setInput('label', '');
    fixture.detectChanges();
    expect(el.querySelector('p')).toBeNull();
  });
});
