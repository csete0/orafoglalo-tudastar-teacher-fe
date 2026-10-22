import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CsoportDiakokComponent } from './csoport-diakok.component';
import { GroupStore } from '../../../services/group/group.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

describe('CsoportDiakokComponent', () => {
  function setup(members: unknown[] = []) {
    const store = { members: signal(members), loadMembers: vi.fn(), removeMember: vi.fn() };
    const confirm = { ask: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [CsoportDiakokComponent],
      providers: [{ provide: GroupStore, useValue: store }, { provide: ConfirmService, useValue: confirm }],
    });
    const fixture = TestBed.createComponent(CsoportDiakokComponent);
    fixture.componentRef.setInput('groupId', 1);
    fixture.detectChanges();
    return { fixture, store, confirm, el: fixture.nativeElement as HTMLElement };
  }

  it('betöltéskor frissíti a tagokat; a tag monogrammal, e-maillel látszik', () => {
    const { store, el } = setup([{ userId: 3, name: 'Kiss Anna', email: 'anna@example.com' }]);
    expect(store.loadMembers).toHaveBeenCalledWith(1);
    expect(el.textContent).toContain('KA');
    expect(el.textContent).toContain('anna@example.com');
  });

  it('eltávolítás megerősítés után', async () => {
    const { store, confirm, el } = setup([{ userId: 3, name: 'Kiss Anna', email: 'a@x.hu' }]);
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => b.textContent?.includes('Eltávolítás'))!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(confirm.ask).toHaveBeenCalled();
    expect(store.removeMember).toHaveBeenCalledWith(1, 3, expect.any(Function));
  });

  it('üres csoportnál a „Meghívó kód megnyitása” gomb jelez a szülőnek (UI-UX-K2)', () => {
    const { fixture, el } = setup([]);
    const emitted = vi.fn();
    fixture.componentInstance.openInvite.subscribe(emitted);
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => b.textContent?.includes('Meghívó kód megnyitása'))!.click();
    expect(emitted).toHaveBeenCalled();
  });
});
