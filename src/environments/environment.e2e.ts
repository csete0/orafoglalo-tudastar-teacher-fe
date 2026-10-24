// A tanári repó Playwright E2E-je (dev-szerver `--configuration e2e`, port 4310): saját backend-port (17083), hogy a
// staging CT-n futó példányokkal (7083/4300) ne ütközzön. Különben azonos a fejlesztői környezettel.
export const environment = {
  production: false,
  apiUrl: 'http://localhost:17083/api',
  // A SignalR hub (/kahoothub) NEM az /api alatt el - a backend originje kell.
  backendUrl: 'http://localhost:17083',
  studentAppUrl: 'http://localhost:4210',
  providerUri: 'http://localhost:17083/auth',
  // UI-TS-374: Cloudflare Turnstile teszt-kulcs (mindig átmegy validáción)
  turnstileSiteKey: '1x00000000000000000000AA',
};
