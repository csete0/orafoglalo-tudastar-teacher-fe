import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TeacherTeamService } from './teacher-team.service';
import { environment } from '../../../environments/environment';

describe('TeacherTeamService', () => {
  it('tanári végpontok a teacher/teams alatt, a csapat-adatok a közös teams alatt', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(TeacherTeamService);
    const http = TestBed.inject(HttpTestingController);
    void firstValueFrom(api.create(7, 'Büfé', [1, 2], null));
    expect(http.expectOne(`${environment.apiUrl}/teacher/teams/groups/7`).request.body).toEqual({ groupId: 7, name: 'Büfé', memberUserIds: [1, 2], projectTitle: null });
    void firstValueFrom(api.reject(3, 'más felosztás'));
    expect(http.expectOne(`${environment.apiUrl}/teacher/teams/3/reject`).request.body).toEqual({ reason: 'más felosztás' });
    void firstValueFrom(api.activity(3));
    http.expectOne((r) => r.url === `${environment.apiUrl}/teams/3/activity`);
    void firstValueFrom(api.testRunners());
    expect(http.expectOne(`${environment.apiUrl}/teams/test-runners`).request.method).toBe('GET');
  });
});
