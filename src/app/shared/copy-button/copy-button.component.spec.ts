import { TestBed } from '@angular/core/testing';
import { CopyButtonComponent } from './copy-button.component';
import { ToastService } from '../toast/toast.service';

describe('CopyButtonComponent', () => {
  let toast: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toast = { success: vi.fn(), danger: vi.fn() };
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
  });

  function setup() {
    const fixture = TestBed.createComponent(CopyButtonComponent);
    fixture.componentRef.setInput('value', 'ABC123');
    fixture.componentRef.setInput('label', 'Meghívó kód');
    fixture.detectChanges();
    return { fixture, button: fixture.nativeElement.querySelector('button') as HTMLButtonElement };
  }

  it('a címke az elérhető névben és a title-ben; kattintásra vágólapra másol és toastot ad', async () => {
    const { fixture, button } = setup();
    expect(button.getAttribute('aria-label')).toBe('Meghívó kód másolása vágólapra');
    expect(button.title).toBe('Meghívó kód másolása');
    button.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('ABC123');
    expect(toast.success).toHaveBeenCalledWith('Meghívó kód a vágólapra másolva.');
  });

  it('hiba esetén beszédes toast, nem néma no-op', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { fixture, button } = setup();
    button.click();
    await fixture.whenStable();
    expect(toast.danger).toHaveBeenCalledWith('A másolás nem sikerült — jelöld ki és másold kézzel.');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
