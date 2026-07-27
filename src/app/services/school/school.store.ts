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
  }

  create(request: CreateSchoolRequest, onSuccess?: (school: SchoolDto) => void): void {
    this.mutate(this.service.create(request), (school) => {
      this._schools.update((list) => [...list, school]);
      if (onSuccess) onSuccess(school);
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
    });
  }

  update(id: number, request: CreateSchoolRequest, onSuccess?: () => void): void {
    this.mutate(this.service.update(id, request), (school) => {
      this._schools.update((list) => list.map((s) => (s.id === id ? school : s)));
      if (onSuccess) onSuccess();
    });
  }

  regenerateInvite(id: number, onSuccess?: () => void): void {
    if (this._loading()) return;

    this.mutate(this.service.regenerateTeacherInvite(id), (school) => {
      this._schools.update((list) => list.map((s) => (s.id === id ? school : s)));
      if (onSuccess) onSuccess();
    });
  }

  delete(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id), () => {
      this._schools.update((list) => list.filter((s) => s.id !== id));
      if (this._selectedSchoolId() === id) this.select(null);
      if (onSuccess) onSuccess();
    });
  }

  leave(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.leave(id), () => {
      this._schools.update((list) => list.filter((s) => s.id !== id));
      if (this._selectedSchoolId() === id) this.select(null);
      if (onSuccess) onSuccess();
    });
  }

  loadMembers(id: number): void {
    this._loading.set(true);
    this._error.set(null);
    this.service
      .getMembers(id)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (members) => this._members.set(members),
        error: (err) => this._error.set(extractErrorMessage(err, 'A tagok betöltése sikertelen.')),
      });
  }

  removeMember(schoolId: number, memberTeacherProfileId: number, onSuccess?: () => void): void {
    this.mutate(this.service.removeMember(schoolId, memberTeacherProfileId), () => {
      this._members.update((list) => list.filter((m) => m.teacherProfileId !== memberTeacherProfileId));
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
      this._members.update((list) =>
        list.map((m) => (m.teacherProfileId === memberTeacherProfileId ? { ...m, role: request.role } : m)),
      );
      // Ugyanaz az ok, mint removeMember()-nél: a `_schools`-beli myRole
      // csak innen frissülhet, ha a hívó saját szerepét módosította.
      this.loadMine();
      if (onSuccess) onSuccess();
    });
  }

  loadSchoolGroups(id: number): void {
    this._loading.set(true);
    this._error.set(null);
    this.service
      .getSchoolGroups(id)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (groups) => this._schoolGroups.set(groups),
        error: (err) => this._error.set(extractErrorMessage(err, 'Az intézmény csoportjainak betöltése sikertelen.')),
      });
  }

  clearError(): void {
    this._error.set(null);
  }

  private mutate<T>(observable: Observable<T>, onSuccess: (value: T) => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
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
          this.loadMine();
          this._error.set(extractErrorMessage(err, 'A művelet sikertelen.'));
        },
      });
  }
}
