# ============================================================================
# Biztonsági fejlécek — UI-TT-159 / UI-TS-239
# ============================================================================
# Ezt a fájlt MINDEN location blokknak `include`-olnia kell. Ok: az nginx `add_header`
# direktívái NEM öröklődnek egy location blokkba, ha annak SAJÁT add_header-e van — a
# szerver szinten deklarált fejlécek ezért csendben eltűntek pont azokról a válaszokról,
# amiket a felhasználó ténylegesen megnyit (a `location /` SPA-ága Cache-Control-t állít).
#
# Az `always` kapcsoló azért kell, hogy hibaválaszokra (4xx/5xx) is kimenjenek — az
# `error_page 404 /index.html` miatt ez itt nem elméleti eset.
#
# Az értékkészlet SZÁNDÉKOSAN azonos a backend `SecurityHeadersMiddleware.cs`-ével,
# hogy a HTML- és az API-réteg ne mondjon ellent egymásnak ugyanazon az originen.

add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

# HSTS: a `preload` SZÁNDÉKOSAN kimarad — az visszafordíthatatlan (böngészőbe épített
# lista), külön, tudatos döntést érdemel.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# CSP. A tanári alkalmazás — a diákoldallal ellentétben — nem használ Monaco-t,
# web workert, `<iframe>`-et, `<embed>`/`<object>`-et és külső scriptet sem (az
# index.html-ben egyetlen <script src> sincs), ezért itt a teljes CSP érvényesíthető,
# nem kell report-only átmeneti fázis.
#   - style-src 'unsafe-inline': az Angular a komponens-stílusokat futásidőben,
#     inline <style> tagként szúrja be — enélkül az egész felület stílus nélkül maradna.
#   - connect-src: staging alatt az API ugyanazon az originen van ('self'), prodban a
#     tanári app külön hoston fut, ezért a www.patricks.hu explicit szükséges.
#   - script-src 'self' (unsafe-inline NÉLKÜL): az Angular CLI production build
#     alapból egy inline onload="this.media='all'" attribútumot szúr be a CSS
#     <link>-re (kritikus-CSS betöltés-optimalizáció) — ezt ez a szigorú CSP
#     letiltja, aminek eredményeként a teljes felület stílus NÉLKÜL renderelődik
#     (ez okozta az éles "design szétesett" incidenst, 2026-08-18). A helyes fix
#     NEM a CSP lazítása (unsafe-inline hozzáadása), hanem az `angular.json`
#     production/staging konfigurációjában az `optimization.styles.inlineCritical:
#     false` beállítása, ami megszünteti az inline onload-ot a forrásnál.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://www.patricks.hu; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
