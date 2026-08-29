export const environment = {
  production: false,
  apiUrl: 'https://192.168.1.77:9443/api',
  // A SignalR hub (/kahoothub) NEM az /api alatt el - a backend originje kell.
  // FIGYELEM: a tudastar-teacher-staging nginx site-nak sajat /kahoothub
  // location blokk kell WebSocket-upgrade fejlecekkel, kulonben neman torik.
  backendUrl: 'https://192.168.1.77:9443',
  studentAppUrl: 'https://192.168.1.77',
  providerUri: 'https://192.168.1.77:9443/auth',
};
