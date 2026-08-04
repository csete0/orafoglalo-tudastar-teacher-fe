import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { GroupService } from './group.service';
import { CreateGroupRequest, GroupDto, GroupMemberDto } from '../../models/group.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

@Injectable({ providedIn: 'root' })
export class GroupStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(GroupService);

  private readonly _groups = signal<GroupDto[]>([]);
  private readonly _selectedGroupId = signal<number | null>(null);
  private readonly _members = signal<GroupMemberDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // UI-TT-139: az `unarchive()` UI-TT-34 fixje egy `if (this._loading()) return;`
  // korai-return guardot kapott, ami a `loadMine()`/`loadMembers()`/`mutate()` ÁLTAL
  // MEGOSZTOTT `_loading`-ot nézte - egy oldalbetöltéskori háttér-lekérdezés (vagy akár
  // egy MÁSIK csoport bármely mutációja) alatt a "Visszaállítás" gomb csendben, hiba
  // nélkül semmit nem csinált. Ez a Set kizárólag az `unarchive()` saját, csoportonkénti
  // dupla-kattintás elleni védelmét szolgálja - a publikus `loading()` (és a többi
  // metódus meglévő, `_loading`-ra épülő viselkedése, ld. a mutate()/generációs-számláló
  // kommentek) szándékosan VÁLTOZATLAN marad.
  private readonly _unarchiveInFlight = signal<ReadonlySet<number>>(new Set<number>());

  // UI-TT-107: ugyanaz a stale-response hibaosztály, mint a ReportStore/SchoolStore
  // (UI-TT-148/149) generációs-számláló fixjénél. A store `providedIn: 'root'`, és a
  // `takeUntilDestroyed(this.destroyRef)` a STORE saját (gyakorlatilag örökké élő)
  // DestroyRef-jéhez kötött, nem a fogyasztó komponenséhez — ezért egy MÁSIK csoportra
  // navigálás NEM szakítja meg az előző csoport még folyamatban lévő tagnévsor-hívását.
  // Ha az A csoport válasza a MÁR megjelenített B csoporté UTÁN érkezik meg, csendben
  // felülírná a `_members`-t, miközben a `selectedGroup()` továbbra is B-t mutatja: a
  // tanár B csoport oldalán A csoport diákjait látná.
  private _membersGeneration = 0;

  // UI-TT-158: a fenti generációs-számláló csak a versengő GET-eket rendezi sorba — a
  // `removeMember()` sikeres ága viszont feltétel nélkül a `_members` AKTUÁLIS tartalmából
  // szűr. Egy diák gyakran tagja TÖBB csoportnak; ha a tanár A csoportból távolítja el,
  // majd a válasz előtt B csoport "Tagok" nézetére vált, a filter B listájára futna le, és
  // a diák csendben eltűnne B renderelt listájáról is — miközben B-beli tagsága a
  // szerveren változatlan. Ez a mező tartja nyilván, melyik csoport tag-listája van
  // jelenleg a `_members`-ben.
  private _membersGroupId: number | null = null;

  readonly groups = computed(() => this._groups());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly members = computed(() => this._members());
  readonly selectedGroup = computed<GroupDto | null>(
    () => this._groups().find((g) => g.id === this._selectedGroupId()) ?? null,
  );

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
        next: (groups) => this._groups.set(groups),
        error: (err) => this._error.set(extractErrorMessage(err, 'A csoportok betöltése sikertelen.')),
      });
  }

  select(groupId: number | null): void {
    this._selectedGroupId.set(groupId);
    this._members.set([]);
    // UI-TT-158: a kiürített lista már egyik csoporté sem — amíg a loadMembers() újra
    // be nem tölti, egyetlen mutáció-válasz sem módosíthatja.
    this._membersGroupId = null;
  }

  create(request: CreateGroupRequest, onSuccess?: (group: GroupDto) => void): void {
    this.mutate(this.service.create(request), (group) => {
      this._groups.update((list) => [...list, group]);
      if (onSuccess) onSuccess(group);
    });
  }

  update(
    id: number,
    request: CreateGroupRequest,
    onSuccess?: () => void,
    onError?: (message: string) => void,
  ): void {
    this.mutate(
      this.service.update(id, request),
      (group) => {
        this._groups.update((list) => list.map((g) => (g.id === id ? group : g)));
        if (onSuccess) onSuccess();
      },
      onError,
    );
  }

  regenerateInvite(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.regenerateInvite(id), (group) => {
      this._groups.update((list) => list.map((g) => (g.id === id ? group : g)));
      if (onSuccess) onSuccess();
    });
  }

  loadMembers(id: number): void {
    const generation = ++this._membersGeneration;
    this._membersGroupId = id;
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

  removeMember(groupId: number, memberUserId: number, onSuccess?: () => void): void {
    this.mutate(this.service.removeMember(groupId, memberUserId), () => {
      // UI-TT-158: a renderelt tag-listát csak akkor szűrjük, ha az MÉG MINDIG annak a
      // csoportnak a listája, amelyikre az eltávolítás vonatkozott. Az alatta lévő
      // `_groups` létszám-patch ellenben MINDIG lefut: az explicit `g.id === groupId`
      // kulcs miatt eleve a helyes csoportot módosítja, függetlenül attól, mi van
      // éppen megjelenítve.
      if (this._membersGroupId === groupId) {
        this._members.update((list) => list.filter((m) => m.userId !== memberUserId));
      }
      // BE-GROUPSTORE-REMOVEMEMBER-STALE-COUNT: minden MÁS mutáció ebben a store-ban
      // (archive/unarchive/setJoinEnabled/regenerateInvite/update) patch-eli a `_groups`
      // listát is - ez volt az egyetlen kivétel, csak a `_members`-t frissítette. A
      // `GroupService.removeMember()` `Observable<unknown>`-t ad vissza (nincs
      // szerver-válasz frissített `memberCount`-tal), ezért kézzel csökkentjük eggyel.
      this._groups.update((list) =>
        list.map((g) => (g.id === groupId ? { ...g, memberCount: g.memberCount - 1 } : g)),
      );
      if (onSuccess) onSuccess();
    });
  }

  archive(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.archive(id), () => {
      this._groups.update((list) => list.map((g) => (g.id === id ? { ...g, isArchived: true } : g)));
      if (onSuccess) onSuccess();
    });
  }

  // UI-TT-34: az archiválásnak eddig nem volt ellentétes irányú művelete - egy
  // véletlenül archivált csoportot a tanár nem tudott a rendszeren belül
  // visszaállítani.
  unarchive(id: number, onSuccess?: () => void): void {
    if (this._unarchiveInFlight().has(id)) return;
    this._unarchiveInFlight.update((prev) => new Set(prev).add(id));

    this.mutate(
      this.service.unarchive(id),
      () => {
        this._groups.update((list) => list.map((g) => (g.id === id ? { ...g, isArchived: false } : g)));
        if (onSuccess) onSuccess();
      },
      undefined,
      () => {
        this._unarchiveInFlight.update((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    );
  }

  setJoinEnabled(id: number, enabled: boolean, onSuccess?: () => void): void {
    this.mutate(this.service.setJoinEnabled(id, enabled), () => {
      this._groups.update((list) => list.map((g) => (g.id === id ? { ...g, isJoinEnabled: enabled } : g)));
      if (onSuccess) onSuccess();
    });
  }

  clearError(): void {
    this._error.set(null);
  }

  private mutate<T>(
    observable: Observable<T>,
    onSuccess: (value: T) => void,
    onError?: (message: string) => void,
    // UI-TT-139: opcionális, hívó-specifikus lezárási callback (pl. unarchive()
    // saját, entitásonkénti guard-Set-jének feloldásához) - a `_loading`-tól
    // FÜGGETLENÜL fut, mindig, sikertől/hibától függetlenül.
    onSettled?: () => void,
  ): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(
        take(1),
        finalize(() => {
          this._loading.set(false);
          if (onSettled) onSettled();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: onSuccess,
        error: (err) => {
          const message = extractErrorMessage(err, 'A művelet sikertelen.');
          this._error.set(message);
          if (onError) onError(message);
        },
      });
  }
}
