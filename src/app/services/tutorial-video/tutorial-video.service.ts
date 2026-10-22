import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TutorialVideoList, TutorialVideoStreamUrl } from '../../models/tutorial-video.model';

/**
 * Oktatóvideók. A <video>/<img> elem nem küld Bearer-fejlécet (a JWT localStorage-ban él), ezért a BE aláírt, rövid életű
 * URL-t ad; itt csak a backend originjével egészítjük ki. Így a tekerés (HTTP Range) is működik, blob-letöltés nélkül.
 */
@Injectable({ providedIn: 'root' })
export class TutorialVideoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/tutorial-videos`;

  /** A menüpont lakatja (Prémium nélkül is 200). */
  hasPremium(): Observable<boolean> {
    return this.http.get<{ hasPremium: boolean }>(`${this.baseUrl}/access`).pipe(map((r) => r.hasPremium));
  }

  /** Prémium nélkül 403 SubscriptionRequired. A borítókép-URL-ek már abszolútak. */
  list(): Observable<TutorialVideoList> {
    return this.http.get<TutorialVideoList>(this.baseUrl).pipe(
      map((list) => ({
        categories: list.categories.map((c) => ({
          ...c,
          videos: c.videos.map((v) => ({ ...v, posterUrl: v.posterUrl ? absolute(v.posterUrl) : null })),
        })),
      })),
    );
  }

  /** Friss lejátszási URL (lejárt jegy után is ezt kell újra kérni). */
  streamUrl(id: string): Observable<string> {
    return this.http
      .get<TutorialVideoStreamUrl>(`${this.baseUrl}/${encodeURIComponent(id)}/stream-url`)
      .pipe(map((r) => absolute(r.url)));
  }
}

function absolute(path: string): string {
  return `${environment.backendUrl}${path}`;
}
