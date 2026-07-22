import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Notification } from '../../models/notification.model';
import { environment } from '../../../environments/environment';

/**
 * UI-TT-82: ugyanaz a megosztott /api/notifications végpont, amit a diák-fe
 * is használ - a backend nem tesz különbséget diák/tanár értesítés közt,
 * kizárólag a hívó saját UserId-jéhez tartozó sorokat adja vissza.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/notifications`;

  getNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>(this.apiUrl);
  }

  markAsRead(userNotificationId: number): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${userNotificationId}/read`, {});
  }

  markAllAsRead(): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/read-all`, {});
  }

  deleteNotification(userNotificationId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${userNotificationId}`);
  }

  deleteAllNotifications(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/delete-all`);
  }
}
