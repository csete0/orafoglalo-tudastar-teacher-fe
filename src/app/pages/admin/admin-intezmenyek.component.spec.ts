import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminIntezmenyekComponent } from './admin-intezmenyek.component';
import { AdminSchoolStore } from '../../services/admin/admin-school.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { SchoolAdminDto } from '../../models/teacher-moderation.model';

function makeSchool(overrides: Partial<SchoolAdminDto> = {}): SchoolAdminDto {
  return {
    id: 1,
    name: 'Forrás Gimnázium',
    createdAt: new Date().toISOString(),
    teacherCount: 2,
    groupCount: 3,
    adminDisplayNames: [],
    ...overrides,
  };
}

describe('AdminIntezmenyekComponent', () => {
  let storeMock: {
    schools: ReturnType<typeof signal<SchoolAdminDto[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    lastMergeResult: ReturnType<typeof signal<unknown>>;
    load: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };

  function configure(schools: SchoolAdminDto[] = [makeSchool({ id: 1, name: 'Forrás' }), makeSchool({ id: 2, name: 'Cél' })]) {
    storeMock = {
      schools: signal(schools),
      loading: signal(false),
      error: signal(null),
      lastMergeResult: signal(null),
      load: vi.fn(),
      merge: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [AdminIntezmenyekComponent],
      providers: [
        { provide: AdminSchoolStore, useValue: storeMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
      ],
    });
  }

  it('betöltéskor meghívja a store.load()-ot', () => {
    configure();
    TestBed.createComponent(AdminIntezmenyekComponent).detectChanges();
    expect(storeMock.load).toHaveBeenCalled();
  });

  // canMerge(): mindkét intézményt ki kell választani, ÉS a forrás nem lehet
  // ugyanaz, mint a cél - ez az EGYETLEN kliens-oldali védelem, ami elé áll
  // ennek a visszavonhatatlan (forrás-törléssel járó) admin-műveletnek.
  it('canMerge() hamis, ha nincs kiválasztva forrás vagy cél', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.canMerge()).toBe(false);

    component.sourceId = 1;
    expect(component.canMerge()).toBe(false);

    component.targetId = 2;
    expect(component.canMerge()).toBe(true);
  });

  it('canMerge() hamis, ha a forrás és a cél ugyanaz az intézmény', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.sourceId = 1;
    component.targetId = 1;

    expect(component.canMerge()).toBe(false);
  });

  it('az "Egyesítés" gomb kezdetben letiltva, amíg nincs érvényesen kiválasztva forrás és cél', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });

  it('érvényes forrás+cél kiválasztás esetén az "Egyesítés" gomb engedélyezett', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(false);
  });

  it('store.loading() alatt az "Egyesítés" gomb letiltott, még érvényes kiválasztás mellett is', () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });

  // Ez a visszavonhatatlan admin-akció (forrás intézmény törlődik, tanárai/
  // csoportjai átkerülnek) - a megerősítő dialógusnak `danger: true`-t KELL
  // kapnia, és a konkrét intézményneveket KELL tartalmaznia, hogy az admin
  // pontosan lássa, mit egyesít mivel, mielőtt jóváhagyná.
  it('confirmMerge() a konkrét forrás/cél intézménynévvel és danger=true-val kéri a megerősítést', async () => {
    configure([makeSchool({ id: 1, name: 'Duplikált Gimnázium' }), makeSchool({ id: 2, name: 'Fő Gimnázium' })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(confirmServiceMock.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        danger: true,
        message: expect.stringContaining('Duplikált Gimnázium'),
      }),
    );
    expect(confirmServiceMock.ask.mock.calls[0][0].message).toContain('Fő Gimnázium');
    expect(storeMock.merge).toHaveBeenCalledWith(1, 2);
  });

  it('a dialógus elutasítása esetén confirmMerge() NEM hívja meg a store.merge()-öt, és a kiválasztás megmarad', async () => {
    configure();
    confirmServiceMock.ask.mockResolvedValue(false);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(storeMock.merge).not.toHaveBeenCalled();
    expect(fixture.componentInstance.sourceId).toBe(1);
    expect(fixture.componentInstance.targetId).toBe(2);
  });

  it('sikeres jóváhagyás után confirmMerge() törli a sourceId/targetId kiválasztást', async () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(storeMock.merge).toHaveBeenCalledWith(1, 2);
    expect(fixture.componentInstance.sourceId).toBeNull();
    expect(fixture.componentInstance.targetId).toBeNull();
  });

  // confirmMerge() a `canMerge()`-öt (és a store.loading()-ot) ÚJRA ellenőrzi
  // a metódus elején - egy dupla-kattintás (mielőtt a gomb [disabled]
  // bindingja ténylegesen letiltaná a DOM-elemet) nem indíthat két egyidejű
  // egyesítést.
  it('confirmMerge() store.loading() alatt no-op, még akkor is, ha canMerge() igaz', async () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    expect(storeMock.merge).not.toHaveBeenCalled();
  });

  it('confirmMerge() no-op, ha a forrás vagy a cél már nem szerepel a store.schools() listájában', async () => {
    configure([makeSchool({ id: 1 })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    // A cél (id=2) időközben eltűnt a listából (pl. egy párhuzamos törlés/egyesítés miatt).
    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    expect(storeMock.merge).not.toHaveBeenCalled();
  });
});
