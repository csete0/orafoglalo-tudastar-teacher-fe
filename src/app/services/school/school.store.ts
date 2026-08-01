import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { SchoolService } from './school.service';
import {
  ChangeSchoolMemberRoleRequest,
  CreateSchoolRequest,
  JoinSchoolRequest,
  SchoolDto,
  SchoolGroupDto,
  SchoolMemberDto,
} from '../../models/school.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/**
 * Adat-vezérelt szerep-állapot: a `MyRole` az adott intézmény DTO-jának
 * mezője (nem JWT-claim), ezért a "vagyok-e admin" kérdést mindig a
 * kiválasztott intézmény adatából számítjuk (isSelectedAdmin), SOSEM guarddal.
 */
@Injectable({ providedIn: 'root' })
export class SchoolStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(SchoolService);

  private readonly _schools = signal<SchoolDto[]>([]);
  private readonly _selectedSchoolId = signal<number | null>(null);
  private readonly _members = signal<SchoolMemberDto[]>([]);
  private readonly _schoolGroups = signal<SchoolGroupDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly schools = computed(() => this._schools());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly members = computed(() => this._members());
  readonly schoolGroups = computed(() => this._schoolGroups());

  readonly selectedSchool = computed<SchoolDto | null>(
    () => this._schools().find((s) => s.id === this._selectedSchoolId()) ?? null,
  );

  // UI-TT-149: ugyanaz a hiba-osztály, mint a ReportStore/LeaderboardStore/
  // TeacherApplicationStore (UI-TT-107/148) generációs-számláló fixje: mivel ez
  // a store `providedIn: 'root'` és a `takeUntilDestroyed(this.destroyRef)` a
  // STORE saját (gyakorlatilag örökké élő) DestroyRef-jéhez kötött, nem a
  // fogyasztó komponenséhez, egy intézményről (pl. A) egy másikra (B) való
  // átnavigálás NEM szakítja meg A még folyamatban lévő HTTP hívását. Ha az
  // később, B már megjelenített, helyes válasza UTÁN érkezik meg, csendben
  // felülírná azt. Külön generáció-számláló a két metódushoz, mert egymástól
  // független signalokba töltenek.
  private _membersGeneration = 0;
  private _schoolGroupsGeneration = 0;

  // UI-TT-157: a fenti generációs-számláló csak a versengő GET-eket rendezi sorba —
  // a MUTÁCIÓK (removeMember/changeMemberRole) sikeres ága viszont feltétel nélkül a
  // `_members` AKTUÁLIS tartalmán dolgozik, és semmit nem tud arról, melyik intézmény
  // listája van éppen betöltve. Egy több intézményben is tanító kolléga (azonos
  // teacherProfileId) így csendben eltűnne/szerepet váltana a KÖZBEN megnyitott MÁSIK
  // intézmény renderelt "Tanárok" listáján, holott ott a tagsága változatlan. Ez a mező
  // tartja nyilván, melyik intézmény tag-listája van jelenleg a `_members`-ben.
  private _membersSchoolId: number | null = null;

  /** Igazgató-e a bejelentkezett tanár a kiválasztott intézményben — adat, nem role. */
  readonly isSelectedAdmin = computed(() => this.selectedSchool()?.myRole === 'Admin');

  loadMine(): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getMine()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (schools) => this._schools.set(schools),
        error: (err) => this._error.set(extractErrorMessage(err, 'Az intézmények betöltése sikertelen.')),
      });
  }

  select(schoolId: number | null): void {
    this._selectedSchoolId.set(schoolId);
    this._members.set([]);
    this._schoolGroups.set([]);
    // UI-TT-157: a kiürített lista már egyik intézményé sem — amíg a loadMembers()
    // újra be nem tölti, egyetlen mutáció-válasz sem módosíthatja.
    this._membersSchoolId = null;
  }

  create(request: CreateSchoolRequest, onSuccess?: (school: SchoolDto) => void): void {
    this.mutate(this.service.create(request), (school) => {
      this._schools.update((list) => [...list, school]);
      if (onSuccess) onSuccess(school);
      this._loading.set(false);
    });
  }

  join(request: JoinSchoolRequest, onSuccess?: (school: SchoolDto) => void): void {
    this.mutate(this.service.join(request), (school) => {
      this._schools.update((list) =>
        list.some((s) => s.id === school.id)
          ? list.map((s) => (s.id === school.id ? school : s))
          : [...list, school],
      );
      if (onSuccess) onSuccess(school);
      this._loading.set(false);
    });
  }

  update(id: number, request: CreateSchoolRequest, onSuccess?: () => void): void {
    this.mutate(this.service.update(id, request), (school) => {
      this._schools.update((list) => list.map((s) => (s.id === id ? school : s)));
      if (onSuccess) onSuccess();
      this._loading.set(false);
    });
  }

  regenerateInvite(id: number, onSuccess?: () => void): void {
    if (this._loading()) return;

    this.mutate(this.service.regenerateTeacherInvite(id), (school) => {
      this._schools.update((list) => list.map((s) => (s.id === id ? school : s)));
      if (onSuccess) onSuccess();
      this._loading.set(false);
    });
  }

  delete(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id), () => {
      this._schools.update((list) => list.filter((s) => s.id !== id));
      if (this._selectedSchoolId() === id) this.select(null);
      if (onSuccess) onSuccess();
      this._loading.set(false);
    });
  }

  leave(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.leave(id), () => {
      this._schools.update((list) => list.filter((s) => s.id !== id));
      if (this._selectedSchoolId() === id) this.select(null);
      if (onSuccess) onSuccess();
      this._loading.set(false);
    });
  }

  loadMembers(id: number): void {
    const generation = ++this._membersGeneration;
    this._membersSchoolId = id;
    this._loading.set(true);
    this._error.set(null);
    this.service
      .getMembers(id)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._membersGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (members) => {
          if (generation !== this._membersGeneration) return;
          this._members.set(members);
        },
        error: (err) => {
          if (generation !== this._membersGeneration) return;
          this._error.set(extractErrorMessage(err, 'A tagok betöltése sikertelen.'));
        },
      });
  }

  removeMember(schoolId: number, memberTeacherProfileId: number, onSuccess?: () => void): void {
    this.mutate(this.service.removeMember(schoolId, memberTeacherProfileId), () => {
      // UI-TT-157: a renderelt tag-listát csak akkor módosítjuk, ha az MÉG MINDIG annak
      // az intézménynek a listája, amelyikre a törlés vonatkozott. A `loadMine()` alatta
      // szándékosan MINDIG lefut: a myRole/`isSelectedAdmin` globális állapot, ami akkor
      // is frissítendő, ha a felhasználó időközben másik intézményre navigált.
      if (this._membersSchoolId === schoolId) {
        this._members.update((list) => list.filter((m) => m.teacherProfileId !== memberTeacherProfileId));
      }
      // A SchoolMemberDto-nak nincs önmagát azonosító mezője, ezért nem tudjuk
      // itt eldönteni, hogy a hívó saját magát távolította-e el — a `_schools`
      // (és ezáltal myRole/isSelectedAdmin) mindig újratöltődik, hogy egy
      // önmaga-eltávolítás után a fejléc/fülek se maradjanak elavultak.
      this.loadMine();
      if (onSuccess) onSuccess();
    });
  }

  changeMemberRole(
    schoolId: number,
    memberTeacherProfileId: number,
    request: ChangeSchoolMemberRoleRequest,
    onSuccess?: () => void,
  ): void {
    this.mutate(this.service.changeMemberRole(schoolId, memberTeacherProfileId, request), () => {
      // UI-TT-157: ugyanaz a cél-intézmény ellenőrzés, mint removeMember()-nél.
      if (this._membersSchoolId === schoolId) {
        this._members.update((list) =>
          list.map((m) => (m.teacherProfileId === memberTeacherProfileId ? { ...m, role: request.role } : m)),
        );
      }
      // Ugyanaz az ok, mint removeMember()-nél: a `_schools`-beli myRole
      // csak innen frissülhet, ha a hívó saját szerepét módosította.
      this.loadMine();
      if (onSuccess) onSuccess();
    });
  }

  loadSchoolGroups(id: number): void {
    const generation = ++this._schoolGroupsGeneration;
    this._loading.set(true);
    this._error.set(null);
    this.service
      .getSchoolGroups(id)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._schoolGroupsGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (groups) => {
          if (generation !== this._schoolGroupsGeneration) return;
          this._schoolGroups.set(groups);
        },
        error: (err) => {
          if (generation !== this._schoolGroupsGeneration) return;
          this._error.set(extractErrorMessage(err, 'Az intézmény csoportjainak betöltése sikertelen.'));
        },
      });
  }

  clearError(): void {
    this._error.set(null);
  }

  // UI-TT-147: NINCS finalize() itt (szándékosan, ugyanaz a minta, mint
  // TeacherTaskSetStore.mutateAndReload()-nál / AdminSchoolStore.merge()-nél) —
  // hiba esetén ez a helper MINDIG loadMine()-t hív (lásd lent), siker esetén
  // pedig egyes hívók (removeMember/changeMemberRole) SZINTÉN loadMine()-t
  // hívnak a saját onSuccess-ükből. Egy outer finalize() ilyenkor a nested
  // loadMine() ÁLTAL frissen true-ra állított _loading-ot azonnal vissza
  // állítaná false-ra, MIELŐTT a beágyazott GET ténylegesen befejeződne — ez
  // a `regenerateInvite()`/mások saját `if (this._loading()) return;` guardját
  // hatástalanná tette egy rövid, de valós versenyhelyzet-ablakban. Azok a
  // hívók, amelyek NEM indítanak beágyazott újratöltést (create/join/update/
  // regenerateInvite/delete/leave), ezért maguk állítják vissza a
  // `_loading`-ot a saját onSuccess-ük végén.
  private mutate<T>(observable: Observable<T>, onSuccess: (value: T) => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: onSuccess,
        error: (err) => {
          // UI-TT-126: a backend minden admin-only mutációnál frissen
          // újraellenőrzi a hívó TÉNYLEGES szerepét, és elutasítja, ha az
          // időközben (pl. egy másik admin által, másik eszközön/lapon)
          // megváltozott. A kliens ezt csak úgy tudja meg, ha egy ilyen
          // elutasítás után újratölti a myRole-t hordozó `_schools`-t - ellenkező
          // esetben az `isSelectedAdmin()`-re épülő admin-UI (badge, tag-kezelő
          // gombok, intézmény szerkesztése/törlése, meghívó-kód regenerálása)
          // hibásan admin-állapotban maradna a backend kifejezett elutasítása
          // után is, a teljes oldal-újratöltésig. A `loadMine()` egy egyszerű,
          // sosem hibázó GET, tehát ez nem okozhat végtelen ciklust. `loadMine()`
          // maga is nullázza az error-t indításkor, ezért a hibaüzenetet UTÁNA
          // állítjuk be, hogy a hívó lássa, miért utasította el a backend.
          // A `_loading`-ot itt NEM állítjuk vissza kézzel — a loadMine()
          // saját finalize()-a teszi ezt meg, amikor a beágyazott GET
          // ténylegesen befejeződik (UI-TT-147).
          this.loadMine();
          this._error.set(extractErrorMessage(err, 'A művelet sikertelen.'));
        },
      });
  }
}
