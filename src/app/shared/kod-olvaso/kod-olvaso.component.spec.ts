import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KodOlvasoComponent, codeFilePaths } from './kod-olvaso.component';

@Component({
  standalone: true,
  imports: [KodOlvasoComponent],
  template: `<app-kod-olvaso [files]="files" [readOnlyPaths]="['keret.py']" [(activePath)]="active" />`,
})
class HostComponent {
  readonly files = { 'b.py': 'print("b")', 'a.py': 'print("a")\nx = 1', 'keret.py': 'KERET' };
  readonly active = signal<string | null>('a.py');
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

  it('a rang a csak olvasható kereten belül, az ábécérend előtt rendez', () => {
    const files = { 'b.py': '', 'a.txt': '', 'c.py': '', 'keret.py': '' };
    const rank = (p: string) => (p.endsWith('.py') ? 0 : 1);
    expect(codeFilePaths(files, ['keret.py'], rank)).toEqual(['b.py', 'c.py', 'a.txt', 'keret.py']);
    expect(codeFilePaths(files, ['keret.py'])).toEqual(['a.txt', 'b.py', 'c.py', 'keret.py']);
  });
});
