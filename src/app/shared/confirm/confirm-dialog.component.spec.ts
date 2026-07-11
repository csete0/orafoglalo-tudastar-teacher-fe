import { TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmService } from './confirm.service';

describe('ConfirmDialogComponent', () => {
  let service: ConfirmService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();
    service = TestBed.inject(ConfirmService);
  });

  it('pending nélkül semmit nem renderel', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  });

  it('ask után megjeleníti az üzenetet és a gombokat', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    service.ask({ message: 'Biztosan törlöd?', confirmLabel: 'Törlés' });
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[data-testid="confirm-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Biztosan törlöd?');
    expect(fixture.nativeElement.querySelector('[data-testid="confirm-accept"]').textContent).toContain('Törlés');
    expect(fixture.nativeElement.querySelector('[data-testid="confirm-cancel"]').textContent).toContain('Mégse');
  });

  it('az elfogadó gomb true-val settleli a promise-t és bezárja a dialógust', async () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    const promise = service.ask({ message: 'Biztos?' });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="confirm-accept"]').click();
    fixture.detectChanges();

    await expect(promise).resolves.toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  });

  it('a mégse gomb false-szal settleli a promise-t', async () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    const promise = service.ask({ message: 'Biztos?' });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="confirm-cancel"]').click();
    fixture.detectChanges();

    await expect(promise).resolves.toBe(false);
  });

  it('danger opcióval piros megerősítő gombot renderel', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    service.ask({ message: 'Törlés?', danger: true });
    fixture.detectChanges();

    const accept = fixture.nativeElement.querySelector('[data-testid="confirm-accept"]');
    expect(accept.classList.contains('btn-danger')).toBe(true);
    expect(accept.classList.contains('btn-primary')).toBe(false);
  });

  // UI-TT-28: Shift+Tab a Megerősítés gombról korábban elhagyhatta a dialógust,
  // és a háttér-oldal egy másik sorának mutáló gombjára ugorhatott.
  it('Tab a Megerősítésről a Mégsére viszi a fókuszt, nem hagyja el a dialógust', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    service.ask({ message: 'Biztos?' });
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.fixed.inset-0');
    const cancel = fixture.nativeElement.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement;
    const accept = fixture.nativeElement.querySelector('[data-testid="confirm-accept"]') as HTMLButtonElement;

    accept.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  it('Shift+Tab a Mégséről a Megerősítésre viszi a fókuszt, nem hagyja el a dialógust', () => {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    service.ask({ message: 'Biztos?' });
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.fixed.inset-0');
    const cancel = fixture.nativeElement.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement;
    const accept = fixture.nativeElement.querySelector('[data-testid="confirm-accept"]') as HTMLButtonElement;

    cancel.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(accept);
  });
});
