import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { WebPreviewFrameComponent } from './web-preview-frame.component';

describe('WebPreviewFrameComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(WebPreviewFrameComponent);
    const phone: boolean[] = [];
    fixture.componentInstance.phone.subscribe((v) => phone.push(v));
    fixture.detectChanges();
    return { fixture, phone };
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('amíg nincs előnézet, betöltést jelez', () => {
    const { fixture } = create();
    expect(q(fixture, 'io-web-preview')!.querySelector('[role="status"]')!.textContent).toContain('Előnézet betöltése');
    expect(fixture.nativeElement.querySelectorAll('iframe').length).toBe(0);
  });

  it('a megoldás és a kiinduló oldal sandbox="" iframe-ben; a hibás oldal helyén az üzenet', () => {
    const { fixture } = create();
    const html = TestBed.inject(DomSanitizer).bypassSecurityTrustHtml('<p>szia</p>');
    fixture.componentRef.setInput('preview', { solution: { html, error: null }, source: { html: null, error: 'Az előnézet nem készíthető el.' } });
    fixture.detectChanges();
    const frame = q(fixture, 'io-web-solution')!.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe('<p>szia</p>');
    expect(frame.title).toBe('Megoldás - élő előnézet');
    expect(frame.style.width).toBe('100%');
    expect(q(fixture, 'io-web-source')!.querySelector('iframe')).toBeNull();
    expect(q(fixture, 'io-web-source')!.textContent).toContain('Az előnézet nem készíthető el.');
  });

  it('a telefonos szélesség 390 px, és a szülő felé is kimegy (fülváltás után megmarad)', () => {
    const { fixture, phone } = create();
    const html = TestBed.inject(DomSanitizer).bypassSecurityTrustHtml('<p>x</p>');
    fixture.componentRef.setInput('preview', { solution: { html, error: null }, source: { html, error: null } });
    fixture.detectChanges();
    expect(q(fixture, 'io-web-desktop')!.getAttribute('aria-pressed')).toBe('true');
    q(fixture, 'io-web-phone')!.click();
    fixture.detectChanges();
    expect(phone).toEqual([true]);
    expect(q(fixture, 'io-web-phone')!.getAttribute('aria-pressed')).toBe('true');
    const frames = Array.from(fixture.nativeElement.querySelectorAll('iframe')) as HTMLIFrameElement[];
    expect(frames.map((f) => f.style.width)).toEqual(['390px', '390px']);
  });
});
