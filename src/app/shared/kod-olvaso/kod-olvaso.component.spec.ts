import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KodOlvasoComponent } from './kod-olvaso.component';

@Component({
  standalone: true,
  imports: [KodOlvasoComponent],
  template: `<app-kod-olvaso [files]="files" [readOnlyPaths]="['keret.py']" [(activePath)]="active" />`,
})
class HostComponent {
  files = { 'b.py': 'print("b")', 'a.py': 'print("a")\nx = 1', 'keret.py': 'KERET' };
  active = signal<string | null>('a.py');
}

describe('KodOlvasoComponent', () => {
  it('fájlra kattintva kétirányúan átírja az activePath-t, és a megnyitott fájl sorait mutatja', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('ul button')];
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['a.py', 'b.py', 'keret.py (keret)']);
    expect(el.querySelectorAll('.code-line').length).toBe(2);

    buttons[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.active()).toBe('b.py');
    expect(el.querySelectorAll('.code-line').length).toBe(1);
    expect(el.querySelector('[data-testid="code-view"]')!.textContent).toContain('print("b")');
  });
});
