import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ProjektekListaComponent } from './projektek-lista.component';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { GroupStore } from '../../services/group/group.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ProjectAssignmentDto, TeacherProjectDto } from '../../models/teacher-project.model';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';

const assignment = (over: Partial<ProjectAssignmentDto> = {}): ProjectAssignmentDto => ({
  id: 7, projectSlug: 'bufe-rendelo', projectTitle: 'Büfé-rendelő', groupId: 1, groupName: '11.B', assignedAt: '2026-10-01T10:00:00',
  opensAt: null, dueAt: '2026-10-08T16:00:00', runtime: 'browser-python', isTest: false, timeLimitSeconds: null, memberCount: 25, startedCount: 10, completedCount: 2,
  membersWithoutFullAccess: 3, milestoneCount: 6, freeMilestoneCount: 2, ...over,
});
const project = (assignments: ProjectAssignmentDto[] = []): TeacherProjectDto => ({
  slug: 'bufe-rendelo', title: 'Büfé-rendelő', summary: 'Rendelés a büfében.', level: 'kozephalado', kind: 'practice', estimatedHours: 7, previewImageUrl: null,
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
        { provide: TeacherOralExamService, useValue: { available: signal(false) } },
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

  it('a hozzáférés-figyelmeztetés a diák-oldali szám szerinti INGYENES VALÓDI lépésszámot mutatja, nem a nyers freeMilestoneCountot (ami a bevezetőt is beleszámolja)', async () => {
    // bufe-rendelo: freeMilestoneCount=3 a backendben (bevezető=0. mérföldkő + 2 valódi ingyenes lépés, orderNo<3 szabad).
    // A diák-oldali projektlista (project-list.component.html) ugyanerre a projektre "Az első 2 lépést ingyen
    // kipróbálhatod"-ot ír (freeMilestoneCount - 1, a bevezetőt explicit kizárva - ld. project-list.component.ts
    // "hasFreePart" kommentje: "a 0. mérföldkő a tervben mindig a bevezető"). Élőben (staging, 2026-10-25 05:16,
    // friss ingyenes fiók, bufe-rendelo tanári kiadással) megerősítve: a diák 1. és 2. mérföldkövet (valódi, nem
    // bevezető lépést) tudta ingyen megoldani és "Tovább"-ot nyomni, a 3.-nál 400 SubscriptionRequired jött.
    // A tanári kártya szövege viszont a NYERS freeMilestoneCount-ot (3) írja ki közvetlenül - a tanár azt hiheti,
    // 3 valódi lépésig jutnak ingyen a diákjai, holott csak 2-ig.
    const { el } = await setup([project([assignment({ freeMilestoneCount: 3 })])]);
    const text = el.querySelector('[data-testid="access-warning"]')?.textContent ?? '';
    expect(text).toContain('3 diáknak nincs teljes hozzáférése');
    expect(text).toContain('az első 2 lépésig jut el');
  });

  it('a katalógus-kártya "A lépések" összegzése (p.freeMilestoneCount, a kiadástól függetlenül, MINDEN tanár látja) szintén a bevezető nélküli valódi ingyenes számot kellene mutassa', async () => {
    // Élőben (staging, 2026-10-25 05:25) megerősítve: a "Büfé-rendelő" katalógus-kártya "A lépések"
    // kibontása (projektek-lista.component.ts:88, data-testid nélküli <details>) "Az első 3 lépés
    // mindenkinek ingyenes"-t ír - ugyanaz a nyers freeMilestoneCount, ugyanaz az off-by-one, mint az
    // access-warningnál, de ez MINDEN tanárnak látszik, nem csak azoknak, akiknek már van kiadásuk
    // nem-teljes-hozzáférésű taggal - ez a bug gyakorlatibb, széleebb körű megnyilvánulása.
    const { el } = await setup([{ ...project([]), freeMilestoneCount: 3 }]);
    const details = el.querySelector('details')?.textContent ?? '';
    expect(details).toContain('Az első 2 lépés mindenkinek ingyenes');
  });

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
      groupId: 2, runtime: 'browser-js', opensAt: null, dueAt: new Date('2026-10-10T18:00').toISOString(), isTest: false, timeLimitSeconds: null,
    });
    expect(el.querySelector('[data-testid="assignment-9"]')?.textContent).toContain('12.A');
  });

  it('dolgozat (időkorláttal): csak vizsgaprojektnél (kind = exam); kezdés és befejezés kötelező, a perc másodpercben megy', async () => {
    const exam: TeacherProjectDto = { ...project(), slug: 'konyvtar', title: 'Könyvtár', kind: 'exam' };
    const { fixture, el } = await setup([project(), exam]);
    (el.querySelector('[data-testid="assign-open-bufe-rendelo"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="assign-test"]')).toBeNull();

    (el.querySelector('[data-testid="assign-open-konyvtar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const set = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-testid="${id}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const toggle = el.querySelector<HTMLInputElement>('[data-testid="assign-test"]')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="assign-form"]')!.textContent).toContain('Befejezés');
    set('assign-group', '2');
    set('assign-minutes', '90');
    el.querySelector<HTMLFormElement>('[data-testid="assign-form"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api['assign']).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('kezdés és a befejezés');

    set('assign-opens', '2026-11-03T10:00');
    set('assign-due', '2026-11-03T08:00');
    el.querySelector<HTMLFormElement>('[data-testid="assign-form"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('A befejezés nem lehet korábbi, mint a kezdés.');

    set('assign-opens', '2026-11-03T08:00');
    set('assign-due', '2026-11-03T10:00');
    set('assign-minutes', '600');
    el.querySelector<HTMLFormElement>('[data-testid="assign-form"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('5 és 480 perc');

    set('assign-minutes', '90');
    el.querySelector<HTMLFormElement>('[data-testid="assign-form"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api['assign']).toHaveBeenCalledWith('konyvtar', {
      groupId: 2, runtime: null, opensAt: new Date('2026-11-03T08:00').toISOString(), dueAt: new Date('2026-11-03T10:00').toISOString(),
      isTest: true, timeLimitSeconds: 5400,
    });
  });

  it('technikumi feladat: a nyelv a diák választása (C# vagy Java), nincs „Csak C# (ASP.NET Core)” opció', async () => {
    const exam: TeacherProjectDto = { ...project(), slug: 'konyvtar', title: 'Könyvtár', kind: 'exam', runtimes: ['judge0-aspnet'], desktopLanguages: ['csharp', 'java'] };
    const { fixture, el } = await setup([exam]);
    expect(el.querySelector('[data-testid="project-konyvtar"]')!.textContent).toContain('nyelvek: C#, Java');
    (el.querySelector('[data-testid="assign-open-konyvtar"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="assign-runtime"]')).toBeNull();
    expect(el.querySelector('[data-testid="assign-language-note"]')!.textContent).toContain('A diák választ (C# vagy Java)');
    expect(el.textContent).not.toContain('ASP.NET Core)');
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
