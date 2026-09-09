export const environment = {
  production: false,
  apiUrl: 'http://localhost:7083/api',
  // A SignalR hub (/kahoothub) NEM az /api alatt el - a backend originje kell.
  backendUrl: 'http://localhost:7083',
  studentAppUrl: 'http://localhost:4200',
  providerUri: 'http://localhost:7083/auth',
  // UI-TS-374: Cloudflare Turnstile teszt-kulcs (mindig átmegy validáción)
  turnstileSiteKey: '1x00000000000000000000AA',
};
