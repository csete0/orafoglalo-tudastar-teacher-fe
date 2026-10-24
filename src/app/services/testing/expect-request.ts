import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Observable } from 'rxjs';

/** Egy service-hívás elvárt HTTP-kérése (csak specekhez). */
export interface ExpectedRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Teljes URL, query string nélkül. */
  url: string;
  /** A teljes query-paraméter-készlet; elhagyva: nincs paraméter. */
  params?: Record<string, string>;
  /** Ha megadott, a kérés törzsének ezzel kell egyeznie. */
  body?: unknown;
}

/**
 * Feliratkozik a hívásra, ellenőrzi az egyetlen kimenő kérést (metódus, URL, paraméterek, törzs),
 * visszaküldi a `response`-t, és a hívás által kibocsátott értéket adja vissza.
 */
export function expectRequest<T>(
  httpMock: HttpTestingController,
  call: Observable<T>,
  expected: ExpectedRequest,
  response: Parameters<TestRequest['flush']>[0] = null,
): T | undefined {
  let value: T | undefined;
  let completed = false;
  call.subscribe({ next: (v) => (value = v), complete: () => (completed = true) });

  const req = httpMock.expectOne((r) => r.url === expected.url, `${expected.method} ${expected.url}`);
  expect(req.request.method).toBe(expected.method);
  const params = Object.fromEntries(req.request.params.keys().map((k) => [k, String(req.request.params.get(k))]));
  expect(params).toEqual(expected.params ?? {});
  if ('body' in expected) expect(req.request.body).toEqual(expected.body);

  req.flush(response);
  expect(completed).toBe(true);
  return value;
}
