import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * A tanári fájlokat kiszolgáló backend-route bearer tokent igényel, ezért
 * nyers <a href> binding-ként nem tölthető be (a token localStorage-ban van,
 * nem cookie-ban, egy sima navigáció nem viszi magával) — a token kizárólag
 * a HttpClient-en (és rajta keresztül az auth-interceptoron) át kerül a
 * kérésre. Ld. az azonos mintát a diák-fe-ben (orafoglalo-tudastar-fe).
 */
const TEACHER_FILE_URL_MARKER = '/api/teacher-files/';

@Injectable({ providedIn: 'root' })
export class AuthorizedFileService {
  private readonly http = inject(HttpClient);
  private readonly objectUrls = new Set<string>();

  isAuthorizedFileUrl(url: string | null | undefined): boolean {
    return !!url && url.includes(TEACHER_FILE_URL_MARKER);
  }

  /**
   * Ha az URL tanári fájlra mutat, letölti bearer tokennel és blob object URL-t
   * ad vissza; egyébként változatlanul visszaadja az eredeti URL-t.
   */
  resolveUrl(url: string): Observable<string> {
    if (!this.isAuthorizedFileUrl(url)) {
      return of(url);
    }

    return this.http.get(url, { responseType: 'blob' }).pipe(
      map((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.add(objectUrl);
        return objectUrl;
      }),
    );
  }

  revoke(objectUrl: string | null | undefined): void {
    if (objectUrl && this.objectUrls.has(objectUrl)) {
      URL.revokeObjectURL(objectUrl);
      this.objectUrls.delete(objectUrl);
    }
  }
}
