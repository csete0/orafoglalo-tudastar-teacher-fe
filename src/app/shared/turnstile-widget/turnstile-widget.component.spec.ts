import { TestBed } from '@angular/core/testing';
import { TurnstileWidgetComponent } from './turnstile-widget.component';
import { environment } from '../../../environments/environment';

describe('TurnstileWidgetComponent', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  function setup() {
    const fixture = TestBed.createComponent(TurnstileWidgetComponent);
    const tokens: (string | null)[] = [];
    fixture.componentInstance.tokenChange.subscribe((t) => tokens.push(t));
    fixture.detectChanges();
    return { fixture, tokens };
  }

  // Először fut: a modulszintű script-ígéret itt jön létre (és hibával zárul).
  it('ha a script nem töltődik be, null tokent jelez', async () => {
    const { fixture, tokens } = setup();
    await fixture.whenStable();
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
    expect(script).not.toBeNull();
    expect(script!.async).toBe(true);
    script!.onerror!(new Event('error'));
    await fixture.whenStable();
    await Promise.resolve();
    expect(tokens).toEqual([null]);
    script!.remove();
  });

  it('betöltött scriptnél a konténerbe renderel a site-key-jel, és a callbackek tokent jeleznek', async () => {
    let options: Record<string, unknown> = {};
    const render = vi.fn((_el: HTMLElement, o: Record<string, unknown>) => { options = o; return 'w1'; });
    window.turnstile = { render, reset: vi.fn(), remove: vi.fn() };
    const { fixture, tokens } = setup();
    await fixture.whenStable();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0]).toBe(fixture.nativeElement.querySelector('div'));
    expect(options['sitekey']).toBe(environment.turnstileSiteKey);
    (options['callback'] as (t: string) => void)('tok');
    (options['expired-callback'] as () => void)();
    (options['error-callback'] as () => void)();
    expect(tokens).toEqual(['tok', null, null]);
  });

  it('reset: a widgetet újraindítja és törli a tokent; megszűnéskor eltávolítja', async () => {
    const reset = vi.fn();
    const remove = vi.fn();
    window.turnstile = { render: () => 'w1', reset, remove };
    const { fixture, tokens } = setup();
    await fixture.whenStable();

    fixture.componentInstance.reset();
    expect(reset).toHaveBeenCalledWith('w1');
    expect(tokens).toEqual([null]);

    fixture.destroy();
    expect(remove).toHaveBeenCalledWith('w1');
  });

  it('render előtt a reset nem csinál semmit', () => {
    const fixture = TestBed.createComponent(TurnstileWidgetComponent);
    const tokens: (string | null)[] = [];
    fixture.componentInstance.tokenChange.subscribe((t) => tokens.push(t));
    fixture.componentInstance.reset();
    expect(tokens).toEqual([]);
  });
});
