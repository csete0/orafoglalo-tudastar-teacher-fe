import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherOfficeTaskService } from './teacher-office-task.service';
import { OfficeTaskJobDto, OfficeTaskProposal } from '../../models/office-task.model';

describe('TeacherOfficeTaskService', () => {
  let service: TeacherOfficeTaskService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/teacher/task-sets/9/office-task`;
  const proposal: OfficeTaskProposal = { title: 't', description: 'd', sourceMode: 'derived', subtasks: [] };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherOfficeTaskService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('keret: a közös MI-segítség végpont', () => {
    service.getQuota().subscribe();
    expect(httpMock.expectOne(`${environment.apiUrl}/teacher/ai-helpers/quota`).request.method).toBe('GET');
  });

  it('indítás: multipart (file, level, subtaskCount, notes)', () => {
    const file = new File(['PK'], 'kupa.xlsx');
    service.startJob(9, { file, level: 'emelt', subtaskCount: 4, notes: 'diagram is' }).subscribe();
    const req = httpMock.expectOne(`${base}/jobs`);
    const body = req.request.body as FormData;
    expect(req.request.method).toBe('POST');
    expect((body.get('file') as File).name).toBe('kupa.xlsx');
    expect(body.get('level')).toBe('emelt');
    expect(body.get('subtaskCount')).toBe('4');
    expect(body.get('notes')).toBe('diagram is');
    req.flush({});
  });

  it('indítás grafikánál: a kiinduló kép is (sourceFile)', () => {
    const file = new File(['x'], 'logo_megoldas.png');
    const sourceFile = new File(['y'], 'logo.jpg');
    service.startJob(9, { file, level: 'kozep', subtaskCount: 3, notes: null, sourceFile }).subscribe();
    const req = httpMock.expectOne(`${base}/jobs`);
    const body = req.request.body as FormData;
    expect((body.get('file') as File).name).toBe('logo_megoldas.png');
    expect((body.get('sourceFile') as File).name).toBe('logo.jpg');
    expect(body.get('notes')).toBeNull();
    req.flush({});
  });

  it('aktív job: 204 → null, 200 → a job', () => {
    let result: OfficeTaskJobDto | null | undefined;
    service.getActiveJob(9).subscribe((j) => (result = j));
    httpMock.expectOne(`${base}/jobs/active`).flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toBeNull();
    service.getActiveJob(9).subscribe((j) => (result = j));
    httpMock.expectOne(`${base}/jobs/active`).flush({ jobId: 12 });
    expect(result).toEqual({ jobId: 12 });
  });

  it('újraellenőrzés: multipart jobId + proposal JSON-szövegként, opcionális sourceFile', () => {
    service.validate(9, 12, proposal, null).subscribe();
    let body = httpMock.expectOne(`${base}/validate`).request.body as FormData;
    expect(body.get('jobId')).toBe('12');
    expect(JSON.parse(body.get('proposal') as string)).toEqual(proposal);
    expect(body.has('sourceFile')).toBe(false);

    service.validate(9, 12, proposal, new File(['PK'], 'kiindulo.xlsx')).subscribe();
    body = httpMock.expectOne(`${base}/validate`).request.body as FormData;
    expect((body.get('sourceFile') as File).name).toBe('kiindulo.xlsx');
  });

  it('mentés: JSON { jobId, proposal }; elvetés; fájl-letöltés blobként', () => {
    service.apply(9, 12, proposal).subscribe();
    expect(httpMock.expectOne(`${base}/apply`).request.body).toEqual({ jobId: 12, proposal });
    service.dismiss(9, 12).subscribe();
    expect(httpMock.expectOne(`${base}/jobs/12/dismiss`).request.method).toBe('POST');
    service.downloadFile(9, 12, 'source').subscribe();
    expect(httpMock.expectOne(`${base}/jobs/12/files/source`).request.responseType).toBe('blob');
  });
});
