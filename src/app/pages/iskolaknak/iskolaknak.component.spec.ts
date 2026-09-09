import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { IskolakNakComponent } from './iskolaknak.component';
import { InstitutionalInquiryService } from '../../services/institutional-inquiry.service';
import { TurnstileWidgetComponent } from '../../shared/turnstile-widget/turnstile-widget.component';

@Component({
  selector: 'app-turnstile-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class TurnstileWidgetStub {
  readonly tokenChange = output<string | null>();
  reset(): void {}
}

describe('IskolakNakComponent - B6: intézményi érdeklődés-űrlap', () => {
  let svcMock: { submit: ReturnType<typeof vi.fn> };

  function configure() {
    svcMock = { submit: vi.fn().mockReturnValue(of(null)) };

    TestBed.configureTestingModule({
      imports: [IskolakNakComponent],
      providers: [
        { provide: InstitutionalInquiryService, useValue: svcMock },
        provideRouter([]),
      ],
    })
      .overrideComponent(IskolakNakComponent, {
        remove: { imports: [TurnstileWidgetComponent] },
        add: { imports: [TurnstileWidgetStub] },
      });
  }

  function getInput(fixture: ReturnType<typeof TestBed.createComponent<IskolakNakComponent>>, id: string): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`#${id}`)!;
  }

  it('beküldő gomb disabled, ha kötelező mezők üresek', () => {
    configure();
    const fixture = TestBed.createComponent(IskolakNakComponent);
    fixture.detectChanges();

    const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(btn.disabled).toBe(true);
  });

  it('érvénytelen e-mail esetén hibát mutat', () => {
    configure();
    const fixture = TestBed.createComponent(IskolakNakComponent);
    fixture.detectChanges();

    const emailInput = getInput(fixture, 'email');
    emailInput.value = 'not-an-email';
    emailInput.dispatchEvent(new Event('input'));
    emailInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Érvénytelen e-mail');
  });

  it('kötelező mező érintés után hibaüzenetet mutat', () => {
    configure();
    const fixture = TestBed.createComponent(IskolakNakComponent);
    fixture.detectChanges();

    const schoolInput = getInput(fixture, 'schoolName');
    schoolInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('kötelező');
  });

  it('sikeres beküldés után a "köszönjük" üzenet látható', () => {
    configure();
    const fixture = TestBed.createComponent(IskolakNakComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    // form kitöltése
    comp.form.setValue({
      schoolName: 'Teszt Iskola',
      contactName: 'Kiss Péter',
      email: 'kiss@iskola.hu',
      phone: '',
      estimatedStudents: null,
      message: '',
    });
    comp.turnstileToken.set('mock-token');
    fixture.detectChanges();

    comp.submit();
    fixture.detectChanges();

    expect(svcMock.submit).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Köszönjük az érdeklődést');
  });

  it('hiba esetén hibaüzenet jelenik meg', () => {
    configure();
    svcMock.submit.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Szerver hiba.' } })));
    const fixture = TestBed.createComponent(IskolakNakComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.form.setValue({
      schoolName: 'Iskola',
      contactName: 'Kapcsolat',
      email: 'kapcsolat@iskola.hu',
      phone: '',
      estimatedStudents: null,
      message: '',
    });
    comp.turnstileToken.set('mock-token');
    comp.submit();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Szerver hiba.');
  });
});
