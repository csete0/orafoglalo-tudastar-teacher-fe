import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let service: ConfirmService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmService);
  });

  it('ask beállítja a pending signalt a kapott opciókkal', () => {
    service.ask({ message: 'Biztos?' });

    expect(service.pending()).toEqual({ message: 'Biztos?' });
  });

  it('resolve(true) true-val settleli a promise-t és üríti a pendinget', async () => {
    const promise = service.ask({ message: 'Biztos?' });

    service.resolve(true);

    await expect(promise).resolves.toBe(true);
    expect(service.pending()).toBeNull();
  });

  it('resolve(false) false-szal settleli a promise-t', async () => {
    const promise = service.ask({ message: 'Biztos?' });

    service.resolve(false);

    await expect(promise).resolves.toBe(false);
  });

  it('új ask a korábbi (még nyitott) kérdést elutasítottként zárja', async () => {
    const first = service.ask({ message: 'Első' });
    const second = service.ask({ message: 'Második' });

    await expect(first).resolves.toBe(false);
    expect(service.pending()).toEqual({ message: 'Második' });

    service.resolve(true);
    await expect(second).resolves.toBe(true);
  });
});
