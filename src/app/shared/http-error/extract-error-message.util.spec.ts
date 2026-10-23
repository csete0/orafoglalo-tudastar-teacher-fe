import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorMessage } from './extract-error-message.util';

describe('extractErrorMessage', () => {
  it('errorMessage alakú body esetén azt adja vissza', () => {
    expect(extractErrorMessage({ error: { errorMessage: 'Nincs jogosultságod.' } }, 'fallback')).toBe(
      'Nincs jogosultságod.',
    );
  });

  it('errors: string[] alakú body esetén a stringeket összefűzve adja vissza', () => {
    expect(extractErrorMessage({ error: { errors: ['Egy hiba.', 'Egy másik hiba.'] } }, 'fallback')).toBe(
      'Egy hiba. Egy másik hiba.',
    );
  });

  it('ValidationProblemDetails ({ errors: { field: string[] } }) alakú body esetén a mezőszintű üzeneteket adja vissza', () => {
    expect(
      extractErrorMessage(
        { error: { errors: { Name: ['A Name mező legfeljebb 255 karakter hosszú lehet.'] } } },
        'fallback',
      ),
    ).toBe('A Name mező legfeljebb 255 karakter hosszú lehet.');
  });

  it('413 státuszkód esetén a fájlméret-üzenetet adja vissza, a body-t figyelmen kívül hagyva', () => {
    expect(extractErrorMessage({ status: 413, error: '<html>...</html>' }, 'fallback')).toBe(
      'A feltöltött fájl mérete meghaladja a megengedett korlátot.',
    );
  });

  it('ismeretlen alakú body esetén a fallbacket adja vissza', () => {
    expect(extractErrorMessage({ error: {} }, 'fallback szöveg')).toBe('fallback szöveg');
    expect(extractErrorMessage({}, 'fallback szöveg')).toBe('fallback szöveg');
    expect(extractErrorMessage(null, 'fallback szöveg')).toBe('fallback szöveg');
  });

  it('valódi HttpErrorResponse-ból is kiolvassa az üzenetet és a 413-at', () => {
    const withBody = new HttpErrorResponse({ status: 400, error: { errorMessage: 'Hibás kérés.' } });
    expect(extractErrorMessage(withBody, 'fallback')).toBe('Hibás kérés.');
    expect(extractErrorMessage(new HttpErrorResponse({ status: 413, error: '<html>' }), 'fallback')).toBe(
      'A feltöltött fájl mérete meghaladja a megengedett korlátot.',
    );
  });

  it('nem objektum hiba vagy body esetén a fallbacket adja vissza', () => {
    expect(extractErrorMessage('szöveges hiba', 'fallback')).toBe('fallback');
    expect(extractErrorMessage(undefined)).toBe('Hiba történt.');
    expect(extractErrorMessage({ error: 'nem JSON' }, 'fallback')).toBe('fallback');
    expect(extractErrorMessage({ error: { errorMessage: '   ', errors: [1, ' '] } }, 'fallback')).toBe('fallback');
  });
});
