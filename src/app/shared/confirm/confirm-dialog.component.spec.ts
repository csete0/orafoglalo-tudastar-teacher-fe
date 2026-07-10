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
});
