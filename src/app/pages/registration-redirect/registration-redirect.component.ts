import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../environments/environment';

/**
 * 0.C-4: a tanári appnak nincs (és a jelenlegi backend mellett nem is lehet) saját
 * regisztrációs űrlapja - a `RegisterUserHandler` a megerősítő email linkjét MINDIG a
 * `Urls:Prod:Frontend` (= diák-app) alá építi, `app=`-szerű megkülönböztetés nélkül. Egy
 * itteni regisztrációs űrlap tehát csak áthelyezné a zsákutcát: a tanár a saját appjában
 * regisztrálna, majd a megerősítő link a diák-appba dobná át.
 *
 * Ezért a `/registration` (és a magyar `/regisztracio`) nem űrlap, hanem átirányítás a
 * diák-app regisztrációjára. A visszaút már ma is működik: a `roleGuard('teacher')` a
 * szerep nélküli belépőt a `/jelentkezes`-re irányítja, a login-oldal pedig szövegesen is
 * elmondja, hol regisztráljon.
 *
 * Korábban ez a két útvonal a `**` ágon a 404-oldalra esett - egy tanár, aki a
 * "regisztrálj a teachers.patricks.hu-n" utasítást kapta, itt akadt el.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-registration-redirect',
  standalone: true,
  template: `
    <div class="max-w-md mx-auto px-4 py-20 text-center flex flex-col items-center gap-4">
      <h1 class="text-2xl font-black tracking-tight">Átirányítás a regisztrációhoz…</h1>
      <p class="text-text-muted">
        A regisztráció a patricks.hu-n történik. Ha nem indul el automatikusan, kattints ide:
      </p>
      <a [href]="registrationUrl" class="btn btn-primary">Regisztráció a patricks.hu-n</a>
    </div>
  `,
})
export class RegistrationRedirectComponent implements OnInit {
  private readonly document = inject(DOCUMENT);

  readonly registrationUrl = `${environment.studentAppUrl}/registration`;

  ngOnInit(): void {
    // `replace` és nem `href`: a regisztrációs oldalról visszafelé lépve a felhasználó ne
    // essen vissza erre az átirányító oldalra (ami azonnal újra elnavigálná - a "vissza"
    // gomb használhatatlanná válna).
    this.document.defaultView?.location.replace(this.registrationUrl);
  }
}
