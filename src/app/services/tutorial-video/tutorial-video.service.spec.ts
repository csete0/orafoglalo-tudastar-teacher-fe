import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TutorialVideoService } from './tutorial-video.service';
import { TutorialVideoList } from '../../models/tutorial-video.model';
import { expectRequest } from '../testing/expect-request';

describe('TutorialVideoService', () => {
  let service: TutorialVideoService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher/tutorial-videos`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TutorialVideoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('hasPremium: GET …/access → a hasPremium mező', () => {
    const result = expectRequest(httpMock, service.hasPremium(), { method: 'GET', url: `${api}/access` }, { hasPremium: true });
    expect(result).toBe(true);
  });

  it('list: GET /teacher/tutorial-videos; a borítókép-útvonal a backend originjével abszolút lesz, a null marad', () => {
    const list: TutorialVideoList = {
      categories: [
        {
          name: 'Első lépések',
          videos: [
            { id: 'v1', title: 'Csoport', description: '', durationSeconds: 95, posterUrl: '/api/tutorial-videos/v1/poster?token=x' },
            { id: 'v2', title: 'Kiadás', description: '', durationSeconds: 60, posterUrl: null },
          ],
        },
      ],
    };

    const result = expectRequest(httpMock, service.list(), { method: 'GET', url: api }, list);

    expect(result!.categories[0].videos.map((v) => v.posterUrl)).toEqual([
      `${environment.backendUrl}/api/tutorial-videos/v1/poster?token=x`,
      null,
    ]);
    expect(result!.categories[0].videos[0].title).toBe('Csoport');
  });

  it('streamUrl: GET …/{id}/stream-url (kódolt azonosítóval) → abszolút URL', () => {
    const result = expectRequest(
      httpMock,
      service.streamUrl('a b/c'),
      { method: 'GET', url: `${api}/a%20b%2Fc/stream-url` },
      { url: '/api/tutorial-videos/a/stream?token=t', expiresInSeconds: 300 },
    );
    expect(result).toBe(`${environment.backendUrl}/api/tutorial-videos/a/stream?token=t`);
  });
});
