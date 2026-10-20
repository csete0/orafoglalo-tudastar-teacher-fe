import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CsoportCsapatokComponent } from './csoport-csapatok.component';
import { TeacherTeamService } from '../../services/team/teacher-team.service';
import { GroupService } from '../../services/group/group.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { Team } from '../../models/team.model';

const proposed: Team = {
  id: 9, name: 'Mozi', kind: 'school', status: 'proposed', groupId: 7, groupName: '13.T', projectTitle: 'Mozi-műsor', examDate: null,
  members: [{ userId: 1, name: 'Kiss Anna', role: null, joinedAt: '', isFounder: true }, { userId: 2, name: 'Nagy Béla', role: null, joinedAt: '', isFounder: false }],
  repo: null, viewer: 'teacher', canManage: true, rejectReason: null, createdAt: '2027-03-12T10:00:00Z',
};

describe('CsoportCsapatokComponent', () => {
  function setup(list: Team[] | Error) {
    const api = {
      forGroup: vi.fn(() => (list instanceof Error ? throwError(() => list) : of(list))), approve: vi.fn(() => of({ ...proposed, status: 'active' })),
      reject: vi.fn(() => of(undefined)), create: vi.fn(() => of(proposed)), addMember: vi.fn(() => of(proposed)), removeMember: vi.fn(() => of(proposed)),
      archive: vi.fn(() => of(undefined)),
    };
    const groups = { getMembers: vi.fn(() => of([{ userId: 1, name: 'Kiss Anna', email: 'a@x', joinedAt: '' }, { userId: 2, name: 'Nagy Béla', email: 'b@x', joinedAt: '' },
      { userId: 3, name: 'Tóth Cili', email: 'c@x', joinedAt: '' }])) };
    const confirm = { ask: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [CsoportCsapatokComponent],
      providers: [provideRouter([]), { provide: TeacherTeamService, useValue: api }, { provide: GroupService, useValue: groups },
        { provide: ConfirmService, useValue: confirm }, { provide: ToastService, useValue: { success: vi.fn(), danger: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(CsoportCsapatokComponent);
    fixture.componentRef.setInput('groupId', 7);
    return { fixture, c: fixture.componentInstance, api, confirm, el: fixture.nativeElement as HTMLElement };
  }

  it('kikapcsolt funkció (404): unavailable', async () => {
    const { fixture, c } = setup(Object.assign(new Error('x'), { status: 404 }));
    const spy = vi.fn();
    c.unavailable.subscribe(spy);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalled();
  });

  it('javasolt csapat: jóváhagyás; elutasítás okkal megerősítés után', async () => {
    const { fixture, c, api, confirm, el } = setup([proposed]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="team-9"]')?.textContent).toContain('jóváhagyásra vár');
    await c.approve(proposed);
    expect(api.approve).toHaveBeenCalledWith(9);
    c.rejectReason.set('Más felosztás kell');
    await c.reject(proposed);
    expect(confirm.ask).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(api.reject).toHaveBeenCalledWith(9, 'Más felosztás kell');
  });

  it('új csapat: 2–3 kijelölt tag nélkül a gomb tiltva; a kijelöltekkel létrehoz', async () => {
    const { fixture, c, api } = setup([]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(c.canCreate()).toBe(false);
    c.toggle(1); c.toggle(3); c.newName.set('Edzőterem');
    expect(c.canCreate()).toBe(true);
    await c.create();
    expect(api.create).toHaveBeenCalledWith(7, 'Edzőterem', [1, 3], null);
  });
  it('tagcsere: 2 fős aktív csapatból kivenni nem lehet (előbb felvétel), 3 fősnél nincs felvétel; kivétel megerősítéssel', async () => {
    const active: Team = { ...proposed, status: 'active', repo: { id: 1, name: 't9-c-mozi', cloneUrl: 'x', sizeKb: 1, quotaKb: 51200, locked: false } };
    const full: Team = { ...active, id: 10, members: [...active.members, { userId: 3, name: 'Tóth Cili', role: null, joinedAt: '', isFounder: false }] };
    const { fixture, c, api, confirm, el } = setup([active, full]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const kivetel = (id: number) => [...el.querySelectorAll<HTMLButtonElement>(`[data-testid="team-${id}"] button[aria-label^="Kivétel"]`)];
    expect(kivetel(9).every((b) => b.disabled)).toBe(true);
    // minden csoporttag csapatban van: felvételi lista helyett jelzés
    expect(el.querySelector('[data-testid="team-9"] select')).toBeNull();
    expect(el.querySelector('[data-testid="team-9"] [data-testid="no-free-member"]')?.textContent).toContain('Nincs szabad tag');
    c.members.update((m) => [...m, { userId: 4, name: 'Szabó Dóra', email: 'd@x', joinedAt: '' }]);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="team-9"] select')?.textContent).toContain('Szabó Dóra');
    expect(kivetel(10).every((b) => !b.disabled)).toBe(true);
    expect(el.querySelector('[data-testid="team-10"] select')).toBeNull();
    await c.removeMember(full, 3, 'Tóth Cili');
    expect(confirm.ask).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(api.removeMember).toHaveBeenCalledWith(10, 3);
  });
});
