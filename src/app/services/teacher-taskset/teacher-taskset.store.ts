import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { TeacherTaskSetService } from './teacher-taskset.service';
import {
  CreateTeacherSolutionRequest,
  CreateTeacherTaskRequest,
  CreateTeacherTaskSetRequest,
  PublishResultDto,
  SnippetDto,
  TeacherTaskSetDetailDto,
  TeacherTaskSetDto,
} from '../../models/teacher-content.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/**
 * A mutáló metódusok (feladat/megoldás/snippet/fájl) minden sikeres hívás
 * után a teljes feladatsor-részletet újratöltik — a fa mélyen egymásba
 * ágyazott (feladatsor→feladat→megoldás→snippet), a szerver-válaszból való
 * konzisztens újraépítés helyett ez a legkevésbé hibalehetőséges megoldás
 * egy belső, kis-adatmennyiségű eszköznél.
 */
@Injectable({ providedIn: 'root' })
export class TeacherTaskSetStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherTaskSetService);

  private readonly _taskSets = signal<TeacherTaskSetDto[]>([]);
  private readonly _selectedDetail = signal<TeacherTaskSetDetailDto | null>(null);
  private readonly _publishResult = signal<PublishResultDto | null>(null);
  private readonly _loading = signal(false);
  // UI-TT-166: a `loadMine()` (Feladatsorok LISTA oldal) korábban ugyanazt a `_loading`-ot
  // írta, mint a `loadDetail()`/mutáló metódusok (Szerkesztő oldal) - mivel a store
  // `providedIn: 'root'` (a navigáció nem szakítja meg a háttérben futó HTTP-hívást), a
  // lista oldalról a szerkesztőbe navigálva a korábbi, immár irreleváns `loadMine()`-válasz
  // idő előtt false-ra zárta a szerkesztő MÉG folyamatban lévő `loadDetail()`-jét. A
  // `loadMine()` a `_loading`-gal ellentétben nem is generáció-védett (nincs több egyidejű
  // hívása), ezért itt elég a jelzőt elkülöníteni, nem kell külön számláló.
  private readonly _mineLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  // UI-TT-105: minden sikeres mutáció a `mutateAndReload()`-on át elindít egy SAJÁT
  // `loadDetail()` GET-et. Két gyors egymás utáni mutációnál (pl. egy feladat
  // hozzáadása, majd egy MÁSIK törlése, mielőtt az első reload lefutna) két
  // párhuzamos GET verseng, és ha a RÉGEBBI válasza ér célba utoljára, csendben
  // felülírja a store-t — egy ténylegesen törölt feladat visszatér a szerkesztőbe.
  // Ugyanaz a generációs-számláló minta zárja ki, mint a ReportStore/SchoolStore
  // (UI-TT-148/149) esetében: csak a LEGUTÓBB indított `loadDetail()` válasza
  // érvényesül. A számláló a `loadDetail()`-en ül, mert minden versengő GET ott
  // indul (közvetlen navigáció, `mutateAndReload()` és `publish()` egyaránt).
  private _detailGeneration = 0;

  // UI-TT-156: a generációs-számláló KIZÁRÓLAG a "legutóbb INDÍTOTT loadDetail() nyer"
  // szabályt érvényesíti — magáról a CÉLZOTT feladatsorról semmit nem tud. Mivel a store
  // `providedIn: 'root'` és a `takeUntilDestroyed(this.destroyRef)` a STORE örökké élő
  // DestroyRef-jéhez kötött (nem a szerkesztő-komponenséhez), egy A feladatsoron indított
  // mutáció a SPA-navigáció UTÁN is befut, és a `mutateAndReload()` feltétel nélkül
  // elindítja a SAJÁT `loadDetail(A)`-ját — ami így a legmagasabb generációt kapja, tehát
  // "nyer", és csendben A adatára cseréli a közben megnyitott B feladatsor szerkesztőjét.
  // A sablon minden mutáló gombja `detail.id`-t küld, ezért onnantól MINDEN mentés/
  // publikálás/törlés ténylegesen A-t módosítaná, miközben az URL végig B-t mutatja.
  // Ez a mező tartja nyilván, melyik feladatsor a loader AKTUÁLIS célpontja, hogy egy
  // elhagyott entitás mutációja ne indíthasson újratöltést egy MÁSIK entitás nézetébe.
  private _detailTaskSetId: number | null = null;

  readonly taskSets = computed(() => this._taskSets());
  readonly selectedDetail = computed(() => this._selectedDetail());
  readonly publishResult = computed(() => this._publishResult());
  readonly loading = computed(() => this._loading());
  readonly mineLoading = computed(() => this._mineLoading());
  readonly error = computed(() => this._error());

  loadMine(): void {
    this._mineLoading.set(true);
    this._error.set(null);

    this.service
      .getMine()
      .pipe(
        take(1),
        finalize(() => this._mineLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (taskSets) => this._taskSets.set(taskSets),
        error: (err) => this._error.set(extractErrorMessage(err, 'A feladatsorok betöltése sikertelen.')),
      });
  }

  loadDetail(id: number, onSuccess?: () => void): void {
    // UI-TT-72: MÁSIK feladatsorra navigáláskor a korábban betöltött adatot
    // azonnal törölni kell, különben a válasz megérkezéséig az ELŐZŐ
    // feladatsor adatlapja látszik az ÚJ URL alatt. DE ugyanazon id
    // újratöltésekor (mutateAndReload()/publish() minden sikeres mentés után
    // ide fut vissza) a régi adatot szándékosan megtartjuk - a loading() a
    // UI-TT-45 fix óta ilyenkor is true marad, egy null selectedDetail a
    // sablon @else if (loading()) ágán keresztül a TELJES szerkesztő űrlapot
    // egy spinnerre cserélné minden egyes mentésnél.
    if (this._selectedDetail()?.id !== id) {
      this._selectedDetail.set(null);
    }

    const generation = ++this._detailGeneration;
    this._detailTaskSetId = id;
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getDetail(id)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._detailGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          // Egy elavult reload válasza sem a store-t nem frissítheti, sem az
          // `onSuccess`-t nem sütheti el (az a hívó oldalán toastot/navigációt
          // válthat ki egy már túlhaladott művelet nevében).
          if (generation !== this._detailGeneration) return;
          this._selectedDetail.set(detail);
          if (onSuccess) onSuccess();
        },
        error: (err) => {
          if (generation !== this._detailGeneration) return;
          this._error.set(extractErrorMessage(err, 'A feladatsor betöltése sikertelen.'));
        },
      });
  }

  create(request: CreateTeacherTaskSetRequest, onSuccess?: (taskSet: TeacherTaskSetDto) => void): void {
    this.mutate(this.service.create(request), (taskSet) => {
      this._taskSets.update((list) => [...list, taskSet]);
      if (onSuccess) onSuccess(taskSet);
    });
  }

  updateTaskSet(id: number, request: CreateTeacherTaskSetRequest): void {
    this.mutateAndReload(this.service.update(id, request), id);
  }

  deleteTaskSet(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id), () => {
      this._taskSets.update((list) => list.filter((ts) => ts.id !== id));
      this._selectedDetail.set(null);
      if (onSuccess) onSuccess();
    });
  }

  publish(id: number, onSuccess?: () => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .publish(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this._publishResult.set(result);
          if (result.success) {
            // Loading marad true (a loadDetail() gondoskodik a lezárásáról), amíg az
            // újratöltés válasza meg nem érkezik — enélkül a "Publikálás" gomb és a
            // fejléc-jelvény átmenetileg úgy mutatná, mintha a publikálás sikertelen
            // lenne / még nem történt volna meg (UI-TT-45).
            this.loadDetail(id, onSuccess);
          } else {
            this._loading.set(false);
          }
        },
        error: (err) => {
          this._error.set(extractErrorMessage(err, 'A publikálás sikertelen.'));
          this._loading.set(false);
        },
      });
  }

  addTask(taskSetId: number, request: CreateTeacherTaskRequest, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.addTask(taskSetId, request), taskSetId, onSuccess);
  }

  updateTask(taskSetId: number, taskId: number, request: CreateTeacherTaskRequest): void {
    this.mutateAndReload(this.service.updateTask(taskId, request), taskSetId);
  }

  deleteTask(taskSetId: number, taskId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.deleteTask(taskId), taskSetId, onSuccess);
  }

  addSolution(taskSetId: number, taskId: number, request: CreateTeacherSolutionRequest, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.addSolution(taskId, request), taskSetId, onSuccess);
  }

  updateSolution(taskSetId: number, solutionId: number, request: CreateTeacherSolutionRequest): void {
    this.mutateAndReload(this.service.updateSolution(solutionId, request), taskSetId);
  }

  deleteSolution(taskSetId: number, solutionId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.deleteSolution(solutionId), taskSetId, onSuccess);
  }

  upsertSolutionSnippets(taskSetId: number, solutionId: number, snippets: SnippetDto[], onSuccess?: () => void): void {
    if (this._loading()) return;
    this.mutateAndReload(this.service.upsertSolutionSnippets(solutionId, snippets), taskSetId, onSuccess);
  }

  // UI-TT-121 testvér-eset: ez a metódus - a fenti upsertSolutionSnippets()-szel
  // ellentétben - eddig NEM kapta meg a "már folyamatban van egy kérés" guardot.
  // A guard szándékosan ITT, a mutateAndReload()-hívás ELŐTT fut (nem magába
  // mutateAndReload()-ba központosítva) - a `this.service...(...)` hívás a
  // mutateAndReload(...) argumentumaként AZONNAL, a metódus-hívás pillanatában
  // kiértékelődne (a JS az argumentumokat a hívás előtt kiértékeli), tehát egy
  // mutateAndReload()-on belüli guard már túl későn futna: a service-metódus
  // (és az általa becsomagolt HttpClient-hívás létrehozása) MÁR megtörtént
  // volna, mielőtt a guard blokkolhatná - csak a `.subscribe()` marad el, ami
  // a valós hálózati kérést ELINDÍTÓ lépés (az Angular HttpClient observable-jei
  // "cold"-ak), de a mock/teszt szintjén ez már megkülönböztethetetlen lenne
  // egy ténylegesen elindított második hívástól.
  upsertCompleteSolutionSnippets(taskSetId: number, taskId: number, snippets: SnippetDto[], onSuccess?: () => void): void {
    if (this._loading()) return;
    this.mutateAndReload(this.service.upsertCompleteSolutionSnippets(taskId, snippets), taskSetId, onSuccess);
  }

  uploadFile(taskSetId: number, kind: string, file: File, taskId?: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.uploadFile(taskSetId, kind, file, taskId), taskSetId, onSuccess);
  }

  deleteFile(taskSetId: number, fileId: string, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.deleteFile(fileId), taskSetId, onSuccess);
  }

  clearError(): void {
    this._error.set(null);
  }

  clearPublishResult(): void {
    this._publishResult.set(null);
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
        error: (err) => this._error.set(extractErrorMessage(err, 'A művelet sikertelen.')),
      });
  }

  private mutateAndReload<T>(observable: Observable<T>, taskSetId: number, onSuccess?: () => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          // UI-TT-156: csak akkor töltünk újra, ha a mutáció célpontja MÉG MINDIG a
          // loader aktuális célpontja. Ha a tanár időközben egy MÁSIK feladatsorra
          // navigált, az elhagyott (A) mutáció újratöltése felülírná a most megjelenített
          // (B) szerkesztőt — a `_detailGeneration` ezt nem akadályozza meg, mert A
          // reloadja indul utoljára, tehát ő kapná a legmagasabb generációt.
          //
          // A `_loading`-ot ilyenkor SZÁNDÉKOSAN nem állítjuk vissza: a `_detailTaskSetId`
          // kizárólag a `loadDetail()`-ben változik, ami mindig `_loading.set(true)`-val
          // indul és mindig lezáródó `finalize()`-t kap — tehát a loading állapot ekkor
          // már ANNAK a frissebb betöltésnek a tulajdona, ami a célpontot átállította.
          // Egy kézi `false` itt a még futó B-betöltés spinnerét kapcsolná ki idő előtt.
          //
          // A `null` (még semmit nem töltött be a loader) SZÁNDÉKOSAN átengedi az
          // újratöltést: ilyenkor nincs megjelenített feladatsor, amit felül lehetne írni,
          // viszont a UI-TT-45 szerződés (a `_loading` csak a reload befejeztével vált
          // false-ra) EZEN a reloadon múlik — blokkolva a spinner örökre bent ragadna.
          if (this._detailTaskSetId !== null && this._detailTaskSetId !== taskSetId) return;

          // Loading marad true a mutáció válasza UTÁN is, egészen addig, amíg a
          // szinkron módon elindított loadDetail() saját finalize()-a le nem futtatja
          // — enélkül a mutáció válaszának megérkezésekor azonnal false-ra váltana,
          // mielőtt a UI ténylegesen a frissített (pl. újonnan mentett) állapotot
          // mutatná (UI-TT-45).
          this.loadDetail(taskSetId, onSuccess);
        },
        error: (err) => {
          // TEACH-6: ugyanaz a guard, mint a SIKER-ágon fent (UI-TT-156) - ha a tanár
          // időközben egy MÁSIK feladatsorra navigált, az elhagyott (A) mutáció HIBÁS
          // válasza sem írhatja felül a közben megnyitott (B) feladatsor loading/error
          // állapotát (rossz-kontextusú hibabanner B fölött, illetve a B loadDetail()-je
          // saját finalize()-a előtt idő előtt kikapcsolt spinner).
          if (this._detailTaskSetId !== null && this._detailTaskSetId !== taskSetId) return;

          this._error.set(extractErrorMessage(err, 'A művelet sikertelen.'));
          this._loading.set(false);
        },
      });
  }
}
