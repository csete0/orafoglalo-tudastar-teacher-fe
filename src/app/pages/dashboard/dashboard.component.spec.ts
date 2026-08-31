import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AuthStore } from '../../services/auth/store/auth.store';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { KahootActiveRoomDto } from '../../models/kahoot-host.model';

/**
 * UX-audit: korábban egy éppen élő (vagy beragadt) Kahoot-szoba KIZÁRÓLAG abból a
 * kvíz-szerkesztőből volt felfedezhető, amelyikhez tartozott - a vezérlőpult "Élő
 * játék fut" kártyája ezt oldja fel, minden saját kvíz szobáját egy helyen mutatva.
 */
describe('DashboardComponent - "Élő játék fut" kártya', () => {
  let authStoreMock: { currentUser: ReturnType<typeof signal<{ firstName: string } | null>> };
  let kahootHostServiceMock: { getActiveRooms: ReturnType<typeof vi.fn> };

  function configure(rooms: KahootActiveRoomDto[] | 'error') {
    authStoreMock = { currentUser: signal({ firstName: 'Anna' }) };
    kahootHostServiceMock = {
      getActiveRooms: vi.fn().mockReturnValue(
        rooms === 'error' ? throwError(() => new Error('network')) : of(rooms),
      ),
    };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreMock },
        { provide: KahootHostService, useValue: kahootHostServiceMock },
      ],
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('nincs élő szoba esetén nem jelenik meg a kártya', () => {
    const fixture = configure([]);
    expect(fixture.nativeElement.textContent).not.toContain('Élő játék fut');
  });

  it('élő szobánál megjelenik a kártya a kvíz+csoport adataival és a host-nézetbe mutató linkkel', () => {
    const fixture = configure([
      {
        kahootSessionId: 42,
        quizId: 7,
        quizTitle: 'Hálózatok dolgozat',
        groupName: '10.b',
        status: 'question',
        participantCount: 18,
      },
    ]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Élő játék fut');
    expect(text).toContain('Hálózatok dolgozat');
    expect(text).toContain('10.b');
    expect(text).toContain('18');

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href*="/elo/42"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/feladatsorok/kvizek/7/elo/42');
  });

  it('több élő szobánál mindegyik megjelenik', () => {
    const fixture = configure([
      { kahootSessionId: 1, quizId: 1, quizTitle: 'A', groupName: '9.a', status: 'lobby', participantCount: 0 },
      { kahootSessionId: 2, quizId: 2, quizTitle: 'B', groupName: '9.b', status: 'question', participantCount: 5 },
    ]);

    const links = fixture.nativeElement.querySelectorAll('a[href*="/elo/"]');
    expect(links.length).toBe(2);
  });

  it('hálózati hiba esetén csendben üresen marad, nem dönti el a vezérlőpult többi részét', () => {
    const fixture = configure('error');

    expect(fixture.componentInstance.activeRooms()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Feladatsoraim');
  });
});
