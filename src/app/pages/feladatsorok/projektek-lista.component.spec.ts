import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ProjektekListaComponent } from './projektek-lista.component';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { GroupStore } from '../../services/group/group.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ProjectAssignmentDto, TeacherProjectDto } from '../../models/teacher-project.model';

const assignment = (over: Partial<ProjectAssignmentDto> = {}): ProjectAssignmentDto => ({
  id: 7, projectSlug: 'bufe-rendelo', projectTitle: 'Büfé-rendelő', groupId: 1, groupName: '11.B', assignedAt: '2026-10-01T10:00:00',
  opensAt: null, dueAt: '2026-10-08T16:00:00', runtime: 'browser-python', memberCount: 25, startedCount: 10, completedCount: 2,
  membersWithoutFullAccess: 3, milestoneCount: 6, freeMilestoneCount: 2, ...over,
});
const project = (assignments: ProjectAssignmentDto[] = []): TeacherProjectDto => ({
  slug: 'bufe-rendelo', title: 'Büfé-rendelő', summary: 'Rendelés a büfében.', level: 'kozephalado', estimatedHours: 7, previewImageUrl: null,
  runtimes: ['browser-python', 'browser-js'], freeMilestoneCount: 2, examAreas: [{ key: 'adatbazis', name: 'Adatbázis' }],
  milestones: [{ orderNo: 1, title: 'Az adatbázis', kind: 'build', estimatedMinutes: 45, examAreas: [] }], assignments,
});

describe('ProjektekListaComponent (Projektek fül)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function setup(projects: TeacherProjectDto[], confirm = true) {
    api = {
      list: vi.fn(() => of(projects)),
      assign: vi.fn((_slug: string, req: { groupId: number }) => of(assignment({ id: 9, groupId: req.groupId, groupName: '12.A', membersWithoutFullAccess: 0 }))),
      revoke: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [ProjektekListaComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherProjectService, useValue: api },
        { provide: GroupStore, useValue: { loadMine: vi.fn(), activeGroups: signal([{ id: 1, name: '11.B' }, { id: 2, name: '12.A' }]) } },
        { provide: ConfirmService, useValue: { ask: vi.fn(() => Promise.resolve(confirm)) } },
      ],
    });
    const fixture = TestBed.createComponent(ProjektekListaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
  }

  it('kiadás: a csoport, a kötött nyelv és a határidő (UTC ISO) megy; a már kiadott csoport nem választható', async () => {
    const { fixture, el } = await setup([project([assignment()])]);
    expect(el.querySelector('[data-testid="access-warning"]')?.textContent).toContain('3 diáknak nincs teljes hozzáférése');
    (el.querySelector('[data-testid="assign-open-bufe-rendelo"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const group = el.querySelector<HTMLSelectElement>('[data-testid="assign-group"]')!;
    expect([...group.options].map((o) => o.textContent!.trim())).toEqual(['Válassz csoportot…', '12.A']);
    group.value = '2'; group.dispatchEvent(new Event('change'));
    const runtime = el.querySelector<HTMLSelectElement>('[data-testid="assign-runtime"]')!;
    runtime.value = 'browser-js'; runtime.dispatchEvent(new Event('change'));
    const due = el.querySelector<HTMLInputElement>('[data-testid="assign-due"]')!;
    due.value = '2026-10-10T18:00'; due.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLFormElement>('[data-testid="assign-form"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api['assign']).toHaveBeenCalledWith('bufe-rendelo', {
      groupId: 2, runtime: 'browser-js', opensAt: null, dueAt: new Date('2026-10-10T18:00').toISOString(),
    });
    expect(el.querySelector('[data-testid="assignment-9"]')?.textContent).toContain('12.A');
  });

  it('visszavonás megerősítés után', async () => {
    const { fixture, el } = await setup([project([assignment()])]);
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Visszavonás'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['revoke']).toHaveBeenCalledWith(7);
    expect(el.querySelector('[data-testid="assignment-7"]')).toBeNull();
  });
});
