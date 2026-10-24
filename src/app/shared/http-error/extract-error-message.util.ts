/** A HTTP-hiba azon része, amit a helper olvas. Szerkezeti (nem `instanceof
 *  HttpErrorResponse`) szűkítés: a store-ok és a specek gyakran sima
 *  `{ status, error }` objektumot dobnak tovább, azokra is működnie kell. */
interface HttpErrorLike {
  status?: unknown;
  error?: unknown;
}

interface ErrorBody {
  errorMessage?: unknown;
  errors?: unknown;
}

function asObject<T extends object>(value: unknown): T | null {
  return typeof value === 'object' && value !== null ? (value as T) : null;
}

/**
 * UI-TT-89/UI-TT-90: a backend hibaválaszai VÉGPONTONKÉNT eltérő alakúak -
 * a legtöbb helyen `{ errorMessage: string }`, néhol `{ errors: string[] }`
 * (pl. `PublishResultDto` HTTP-hibaágon), az ASP.NET DataAnnotations validáció
 * pedig sztenderd `ValidationProblemDetails`-t ad (`{ errors: { [field: string]: string[] } }`).
 * Ha egy store csak az `errorMessage` mezőt olvassa ki, a másik két alak esetén
 * csendben eldobja a konkrét backend-indokot, és a felhasználó csak egy
 * tartalmatlan generikus üzenetet lát. Ez a helper mindhárom alakot (és a
 * szótár-alakot) sorban megpróbálja, mielőtt a hívó által megadott generikus
 * szöveghez folyamodna. Eredetileg a `TeacherTaskSetStore`-ban (UI-TT-89/90),
 * majd a `GroupStore`/`SchoolStore`-ban is (255 karakteres névhossz-limit
 * túllépése) bevezetve, ide emelve, hogy ne triplázódjon.
 */
export function extractErrorMessage(err: unknown, fallback = 'Hiba történt.'): string {
  const httpError = asObject<HttpErrorLike>(err);
  // UI-TT-109: egy nginx `client_max_body_size`-t meghaladó fájlfeltöltés HTML-testű
  // 413-at ad vissza (nem JSON-t) — a body?.errorMessage/body?.errors ellenőrzések erre
  // értelemszerűen sosem illenek rá, ezért ez korábban csendben a tartalmatlan `fallback`
  // üzenetre esett vissza, és a felhasználó sosem tudta meg, hogy a fájl mérete volt a gond
  // (és a nginx-limit jóval alacsonyabb, mint a dokumentált, kind-onkénti app-szintű
  // limitek). A státuszkódot a body-értelmezés ELŐTT kell ellenőrizni, mert a body ebben
  // az esetben irreleváns/nem-parseolható.
  if (httpError?.status === 413) {
    return 'A feltöltött fájl mérete meghaladja a megengedett korlátot.';
  }
  const body = asObject<ErrorBody>(httpError?.error);
  const errorMessage = body?.errorMessage;
  if (typeof errorMessage === 'string' && errorMessage.trim()) {
    return errorMessage;
  }
  const errors = body?.errors;
  if (Array.isArray(errors)) {
    const joined = errors.filter((e: unknown) => typeof e === 'string' && e.trim()).join(' ');
    if (joined) return joined;
  } else {
    const fieldErrors = asObject<Record<string, unknown>>(errors);
    if (fieldErrors) {
      const joined = Object.values(fieldErrors)
        .flatMap((messages) => (Array.isArray(messages) ? messages : [messages]))
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .join(' ');
      if (joined) return joined;
    }
  }
  return fallback;
}
