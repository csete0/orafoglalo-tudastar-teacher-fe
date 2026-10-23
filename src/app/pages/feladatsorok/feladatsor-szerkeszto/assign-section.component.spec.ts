import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { GroupDto } from '../../../models/group.model';
import { TaskSetAssignmentDto } from '../../../models/teacher-content.model';
import { GroupStore } from '../../../services/group/group.store';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { AssignSectionComponent } from './assign-section.component';

const group = (id: number, name: string, inviteCode = 'K' + id): GroupDto => ({
  id, name, inviteCode, isArchived: false, isJoinEnabled: true, createdAt: '2026-10-01T00:00:00Z', memberCount: 3,
});

describe('AssignSectionComponent', () => {
  let service: {
    getTaskSetAssignments: ReturnType<typeof vi.fn>;
    assignToGroup: ReturnType<typeof vi.fn>;
    revokeAssignment: ReturnType<typeof vi.fn>;
  };
  let groups: ReturnType<typeof signal<GroupDto[]>>;
  let loadMine: ReturnType<typeof vi.fn>;
  let confirmAsk: ReturnType<typeof vi.fn>;

  function create(isPublished: boolean, assignments: TaskSetAssignmentDto[] = []) {
    service = {
      getTaskSetAssignments: vi.fn(() => of(assignments)),
      assignToGroup: vi.fn(),
      revokeAssignment: vi.fn(),
    };
    groups = signal([group(3, 'A'), group(4, 'B')]);
    loadMine = vi.fn();
    confirmAsk = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [AssignSectionComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherTaskSetService, useValue: service },
        { provide: TeacherTaskSetStore, useValue: { loading: signal(false) } },
        { provide: GroupStore, useValue: { groups, activeGroups: computed(() => groups().filter((g) => !g.isArchived)), loadMine } },
        { provide: ConfirmService, useValue: { ask: confirmAsk, pending: signal(null), resolve: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AssignSectionComponent);
    fixture.componentRef.setInput('taskSetId', 1);
    fixture.componentRef.setInput('isPublished', isPublished);
    return fixture;
  }

  it('dolgozatként kiadva kötelező az időablak, 5–240 perc, és az ablak legalább az időkorlát', () => {
    const form = create(true).componentInstance.assignForm;

    form.setValue({ groupId: 3, opensAt: '', dueAt: '', isTest: false, timeLimitMinutes: 45 });
    expect(form.valid).toBe(true); // sima kiadásnál az ablak nem kötelező

    form.patchValue({ isTest: true });
    expect(form.errors?.['testWindowRequired']).toBe(true);

    form.patchValue({ opensAt: '2020-10-05T10:00', dueAt: '2020-10-05T11:00' });
    expect(form.errors?.['testDueInPast']).toBe(true); // múltbeli határidőt a szerver is elutasítaná

    form.patchValue({ opensAt: '2099-10-05T10:00', dueAt: '2099-10-05T10:30' });
    expect(form.errors?.['testWindowTooShort']).toBe(true);

    form.patchValue({ timeLimitMinutes: 300 });
    expect(form.errors?.['testTimeLimit']).toBe(true);

    form.patchValue({ timeLimitMinutes: 30 });
    expect(form.valid).toBe(true);
  });

  it('betöltéskor lekéri a feladatsor kiadásait és a csoportokat; a visszavontat nem listázza, a kiadott csoport nem választható', () => {
    const fixture = create(true, [
      { id: 5, groupId: 3, groupName: 'A', assignedAt: '2026-10-01T00:00:00Z' },
      { id: 6, groupId: 4, groupName: 'B', assignedAt: '2026-10-01T00:00:00Z', revokedAt: '2026-10-02T00:00:00Z' },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(service.getTaskSetAssignments).toHaveBeenCalledWith(1);
    expect(loadMine).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('ul > li').length).toBe(1);
    expect(el.querySelector('ul > li')!.textContent).toContain('A');
    expect(Array.from(el.querySelectorAll('select option')).map((o) => o.textContent?.trim())).toEqual(['B']);
  });

  it('azonos nevű csoportoknál a meghívó kód különbözteti meg őket', () => {
    const fixture = create(true);
    groups.set([group(3, 'A', 'X1'), group(4, 'A', 'X2')]);
    fixture.detectChanges();
    expect(fixture.componentInstance.groupLabel(4, 'A')).toBe('A (kód: X2)');
    expect(fixture.componentInstance.groupLabel(9, 'C')).toBe('C');
  });

  it('publikálatlan feladatsornál nincs kiadás-űrlap, csak a magyarázat', () => {
    const fixture = create(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Előbb publikáld a feladatsort');
    expect(fixture.nativeElement.textContent).toContain('Még nincs kiadva egyetlen csoportnak sem.');
  });

  it('kiadás: a feladatsorra a megadott adatokkal ad ki, a listába felveszi, és az űrlapot üríti', () => {
    const fixture = create(true);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    service.assignToGroup.mockReturnValue(of({ id: 7, groupId: 3, groupName: 'A', assignedAt: '2026-10-01T00:00:00Z', isTest: false }));
    c.assignForm.setValue({ groupId: 3, opensAt: '', dueAt: '', isTest: false, timeLimitMinutes: 45 });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.assignToGroup).toHaveBeenCalledWith(1, { groupId: 3, opensAt: null, dueAt: null, isTest: false, timeLimitMinutes: null });
    expect(c.activeAssignments().map((a) => a.id)).toEqual([7]);
    expect(c.assignForm.controls.groupId.value).toBeNull();
  });

  // A kiadás/visszavonás írás: az oldal elhagyása után is végig kell futnia, és a toastnak
  // meg kell jelennie (siker vagy hiba) - különben a tanár nem tudja meg, hogy elment-e.
  describe('kiadás-mutációk az oldal elhagyása után', () => {
    it('assign(): a komponens megszűnése után érkező válasz is megjeleníti a sikeres toastot', () => {
      const fixture = create(true);
      const response = new Subject<TaskSetAssignmentDto>();
      service.assignToGroup.mockReturnValue(response);
      const success = vi.spyOn(TestBed.inject(ToastService), 'success');
      const c = fixture.componentInstance;
      c.assignForm.setValue({ groupId: 3, opensAt: '', dueAt: '', isTest: false, timeLimitMinutes: 45 });

      c.assign();
      fixture.destroy();
      response.next({ id: 5, groupId: 3, groupName: 'A', assignedAt: new Date().toISOString(), isTest: false });

      expect(success).toHaveBeenCalledWith('Feladatsor kiadva.');
    });

    it('revokeAssignment(): a komponens megszűnése után érkező hiba is megjelenik toastként', async () => {
      const fixture = create(true);
      const response = new Subject<unknown>();
      service.revokeAssignment.mockReturnValue(response);
      const danger = vi.spyOn(TestBed.inject(ToastService), 'danger');

      await fixture.componentInstance.revokeAssignment(5);
      fixture.destroy();
      response.error(new Error('hálózati hiba'));

      expect(danger).toHaveBeenCalledTimes(1);
    });
  });

  it('visszavonás megerősítés után: a kiadás eltűnik a listából; elutasításkor nem hív', async () => {
    const fixture = create(true, [{ id: 5, groupId: 3, groupName: 'A', assignedAt: '2026-10-01T00:00:00Z' }]);
    fixture.detectChanges();
    service.revokeAssignment.mockReturnValue(of(null));

    confirmAsk.mockResolvedValueOnce(false);
    await fixture.componentInstance.revokeAssignment(5);
    expect(service.revokeAssignment).not.toHaveBeenCalled();

    await fixture.componentInstance.revokeAssignment(5);
    expect(service.revokeAssignment).toHaveBeenCalledWith(5);
    expect(fixture.componentInstance.activeAssignments()).toEqual([]);
  });
});
