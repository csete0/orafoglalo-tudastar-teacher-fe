import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { TutorialVideoList } from '../../models/tutorial-video.model';
import { TutorialVideoService } from '../../services/tutorial-video/tutorial-video.service';
import { OktatovideokComponent } from './oktatovideok.component';
import { signal } from '@angular/core';
import { AuthStore } from '../../services/auth/store/auth.store';

const LIST: TutorialVideoList = {
  categories: [
    {
      name: 'Csoportok',
      videos: [
        { id: 't1', title: 'Csoport létrehozása', description: 'Meghívó kód', durationSeconds: 95, posterUrl: 'https://api/p1.jpg' },
        { id: 't2', title: 'Diákok', description: '', durationSeconds: 605, posterUrl: null },
      ],
    },
    { name: 'Feladatok', videos: [{ id: 't3', title: 'Feladatsor', description: 'B', durationSeconds: 60, posterUrl: null }] },
  ],
};

describe('OktatovideokComponent', () => {
  let list: () => Observable<TutorialVideoList>;
  let streamUrl: ReturnType<typeof vi.fn>;
  let queryV: string | null;

  const isDemo = signal(false);

  beforeEach(() => {
    isDemo.set(false);
    list = () => of(LIST);
    streamUrl = vi.fn((id: string) => of(`https://api/stream/${id}?token=a`));
    queryV = null;
  });

  async function create() {
    await TestBed.configureTestingModule({
      imports: [OktatovideokComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isDemo } },
        { provide: TutorialVideoService, useValue: { list: () => list(), streamUrl } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryV ? { v: queryV } : {}) } } },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OktatovideokComponent);
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;

  it('kategóriánként kártyák címmel, leírással, időtartammal; lejátszó csak kattintásra', async () => {
    const fixture = await create();
    const headings = Array.from(el(fixture).querySelectorAll('section h2')).map((h) => h.textContent!.trim());
    expect(headings).toEqual(['Csoportok', 'Feladatok']);
    const cards = el(fixture).querySelectorAll('[data-testid="tutorial-card"]');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('Csoport létrehozása');
    expect(cards[0].textContent).toContain('Meghívó kód');
    expect(cards[0].textContent).toContain('1:35');
    expect(cards[1].textContent).toContain('10:05');
    expect(cards[0].querySelector('img')?.getAttribute('src')).toBe('https://api/p1.jpg');
    expect(el(fixture).querySelector('video')).toBeNull();
  });

  it('kártyára kattintva natív lejátszó az aláírt URL-lel (controls, playsinline, poster)', async () => {
    const fixture = await create();
    (el(fixture).querySelector('[data-testid="tutorial-card"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const video = el(fixture).querySelector('video')!;
    expect(streamUrl).toHaveBeenCalledWith('t1');
    expect(video.getAttribute('src')).toBe('https://api/stream/t1?token=a');
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.getAttribute('poster')).toBe('https://api/p1.jpg');
    expect(el(fixture).querySelector('[data-testid="tutorial-player"]')!.textContent).toContain('Csoport létrehozása');
  });

  it('lejárt jegy: egyszer új URL ugyanonnan, másodszor hibaüzenet', async () => {
    const fixture = await create();
    (el(fixture).querySelectorAll('[data-testid="tutorial-card"]')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    streamUrl.mockReturnValue(of('https://api/stream/t2?token=b'));

    const video = el(fixture).querySelector('video')!;
    Object.defineProperty(video, 'currentTime', { value: 42, configurable: true });
    video.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el(fixture).querySelector('video')!.getAttribute('src')).toBe('https://api/stream/t2?token=b#t=42');

    el(fixture).querySelector('video')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(streamUrl).toHaveBeenCalledTimes(2);
    expect(el(fixture).querySelector('[role="alert"]')).toBeTruthy();
  });

  it('?v=<id> megnyitja a videót', async () => {
    queryV = 't3';
    const fixture = await create();
    fixture.detectChanges();
    expect(streamUrl).toHaveBeenCalledWith('t3');
    expect(el(fixture).querySelector('[data-testid="tutorial-player"]')!.textContent).toContain('Feladatsor');
  });

  it('Prémium nélkül (403 SubscriptionRequired) fizetőfal lakattal és előfizetés-linkkel', async () => {
    list = () => throwError(() => new HttpErrorResponse({ status: 403, error: { errorType: 'SubscriptionRequired' } }));
    const fixture = await create();
    const locked = el(fixture).querySelector('[data-testid="tutorial-locked"]')!;
    expect(locked.textContent).toContain('Prémium');
    expect(locked.querySelector('app-icon')).toBeTruthy();
    expect(locked.querySelector('a')!.getAttribute('href')).toContain('/subscriptions');
    expect(el(fixture).querySelector('[data-testid="tutorial-card"]')).toBeNull();
  });

  it('demó-fiókban a fizetőfalon nincs előfizetés-link (PATRICKS-DEMO-KORNYEZET-TERV.md F6)', async () => {
    isDemo.set(true);
    list = () => throwError(() => new HttpErrorResponse({ status: 403, error: { errorType: 'SubscriptionRequired' } }));
    const fixture = await create();
    expect(el(fixture).querySelector('[data-testid="tutorial-locked"]')!.querySelector('a')).toBeNull();
  });

  it('más hiba: hibaüzenet, nem fizetőfal; üres lista: „hamarosan”', async () => {
    list = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const fixture = await create();
    expect(el(fixture).querySelector('[role="alert"]')).toBeTruthy();
    expect(el(fixture).querySelector('[data-testid="tutorial-locked"]')).toBeNull();

    TestBed.resetTestingModule();
    list = () => of({ categories: [] });
    const empty = await create();
    expect(el(empty).textContent).toContain('Hamarosan');
  });
});
