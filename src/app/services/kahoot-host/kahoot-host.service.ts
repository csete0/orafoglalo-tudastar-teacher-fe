import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  KahootActiveRoomDto,
  KahootGameSummaryDto,
  KahootRoomDto,
  KahootRoomSnapshotDto,
} from '../../models/kahoot-host.model';

/**
 * Az élő játék tanári REST-oldala: szoba-nyitás és listázások. A játékmenet-
 * vezérlés (indítás, léptetés, zárás) a /kahoothub-on megy (KahootSignalRService).
 */
@Injectable({ providedIn: 'root' })
export class KahootHostService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  /**
   * Szoba nyitása (lobby). Ha a (kvíz, csoport) párra nincs élő kiadás, a
   * backend létrehozza - az élő játék maga is kiadás.
   */
  createRoom(quizId: number, groupId: number): Observable<KahootRoomDto> {
    return this.http.post<KahootRoomDto>(
      `${this.baseUrl}/quizzes/${quizId}/kahoot-sessions`,
      { groupId },
    );
  }

  /** A kvíz korábbi (és épp futó) élő játékai. */
  getGames(quizId: number): Observable<KahootGameSummaryDto[]> {
    return this.http.get<KahootGameSummaryDto[]>(
      `${this.baseUrl}/quizzes/${quizId}/kahoot-sessions`,
    );
  }

  /** Host-oldali állapot-helyreállítás (F5) - a hub-join mellett REST-fallback. */
  getRoom(kahootSessionId: number): Observable<KahootRoomSnapshotDto> {
    return this.http.get<KahootRoomSnapshotDto>(
      `${this.baseUrl}/kahoot-sessions/${kahootSessionId}`,
    );
  }

  /** Az összes SAJÁT kvíz éppen élő szobája, minden csoport között - a dashboard kártyájának. */
  getActiveRooms(): Observable<KahootActiveRoomDto[]> {
    return this.http.get<KahootActiveRoomDto[]>(`${this.baseUrl}/kahoot-sessions/active`);
  }
}
