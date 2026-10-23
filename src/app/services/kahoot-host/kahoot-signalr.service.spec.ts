import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { HttpTransportType, HubConnectionState, IHttpConnectionOptions } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { TokenService } from '../auth/token.service';
import { KahootSignalRService } from './kahoot-signalr.service';
import { KahootRoomSnapshotDto } from '../../models/kahoot-host.model';

/** A HubConnection-nek csak az a része, amit a service használ; a builder `build()`-je ezt adja vissza. */
class FakeHubConnection {
  state = HubConnectionState.Disconnected;
  readonly handlers = new Map<string, (payload: unknown) => void>();
  reconnecting: () => void = () => undefined;
  reconnected: () => void = () => undefined;
  closed: () => void = () => undefined;

  readonly start = vi.fn(async () => {
    this.state = HubConnectionState.Connected;
  });
  readonly stop = vi.fn(async () => {
    this.state = HubConnectionState.Disconnected;
  });
  readonly invoke = vi.fn(async (...args: unknown[]): Promise<unknown> => args);
  readonly on = vi.fn((eventName: string, handler: (payload: unknown) => void) => {
    this.handlers.set(eventName, handler);
  });

  onreconnecting(callback: () => void): void {
    this.reconnecting = callback;
  }
  onreconnected(callback: () => void): void {
    this.reconnected = callback;
  }
  onclose(callback: () => void): void {
    this.closed = callback;
  }
}

describe('KahootSignalRService', () => {
  let service: KahootSignalRService;
  let hubs: FakeHubConnection[];
  let getValidAccessToken: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  let onBuild: (hub: FakeHubConnection) => void;

  /** Az utoljára épített kapcsolat. */
  const hub = (): FakeHubConnection => hubs[hubs.length - 1];

  beforeEach(() => {
    hubs = [];
    onBuild = () => undefined;
    vi.spyOn(signalR.HubConnectionBuilder.prototype, 'build').mockImplementation(() => {
      const created = new FakeHubConnection();
      onBuild(created);
      hubs.push(created);
      return created as unknown as signalR.HubConnection;
    });
    getValidAccessToken = vi.fn<() => Promise<string | null>>().mockResolvedValue('jwt-1');

    TestBed.configureTestingModule({
      providers: [{ provide: TokenService, useValue: { getValidAccessToken } }],
    });
    service = TestBed.inject(KahootSignalRService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('kapcsolódás: /kahoothub a backend originjén, WebSocket+SSE, JWT a token-gyárból, 60 s szerver-timeout', async () => {
    const withUrl = vi.spyOn(signalR.HubConnectionBuilder.prototype, 'withUrl');
    const withServerTimeout = vi.spyOn(signalR.HubConnectionBuilder.prototype, 'withServerTimeout');

    await service.startConnection();

    const [url, options] = withUrl.mock.calls[0] as unknown as [string, IHttpConnectionOptions];
    expect(url).toBe(`${environment.backendUrl}/kahoothub`);
    expect(options.transport).toBe(HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents);
    expect(options.skipNegotiation).toBe(false);
    expect(options.withCredentials).toBe(false);
    expect(await options.accessTokenFactory!()).toBe('jwt-1');
    getValidAccessToken.mockResolvedValue(null);
    expect(await options.accessTokenFactory!()).toBe('');
    expect(withServerTimeout).toHaveBeenCalledWith(60000);

    expect(hub().start).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe(HubConnectionState.Connected);
    expect(service.isConnected()).toBe(true);
  });

  it('párhuzamos indítás egyetlen kapcsolatot nyit, élő kapcsolatnál nem indít újra', async () => {
    const first = service.startConnection();
    const second = service.startConnection();
    expect(second).toBe(first);
    await first;

    await service.startConnection();

    expect(hubs.length).toBe(1);
    expect(hub().start).toHaveBeenCalledTimes(1);
  });

  it('sikertelen indítás után a következő hívás új kapcsolattal próbálkozik', async () => {
    onBuild = (created) => created.start.mockRejectedValueOnce(new Error('offline'));
    await expect(service.startConnection()).rejects.toThrow('offline');
    expect(service.isConnected()).toBe(false);

    onBuild = () => undefined;
    await service.startConnection();

    expect(hubs.length).toBe(2);
    expect(service.isConnected()).toBe(true);
  });

  it('hub-metódusok: a nevük és a szoba-azonosító megy át, a hívás magától kapcsolódik', async () => {
    const calls: [string, (id: number) => Promise<unknown>][] = [
      ['JoinRoom', (id) => service.joinRoom(id)],
      ['StartGame', (id) => service.startGame(id)],
      ['NextQuestion', (id) => service.nextQuestion(id)],
      ['CloseQuestion', (id) => service.closeQuestion(id)],
      ['EndGame', (id) => service.endGame(id)],
      ['LeaveRoom', (id) => service.leaveRoom(id)],
    ];

    for (const [methodName, call] of calls) {
      await call(7);
      expect(hub().invoke).toHaveBeenLastCalledWith(methodName, 7);
    }
    expect(hubs.length).toBe(1);
    expect(hub().start).toHaveBeenCalledTimes(1);
  });

  it('joinRoom a hub válaszát (a szoba-pillanatképet) adja vissza', async () => {
    await service.startConnection();
    const snapshot = { kahootSessionId: 7 } as KahootRoomSnapshotDto;
    hub().invoke.mockResolvedValueOnce(snapshot);

    expect(await service.joinRoom(7)).toBe(snapshot);
  });

  // Zoneless (FE-refaktor Z): nincs NgZone-visszahívás, a kezelő által írt signal maga ütemezi a UI-frissítést.
  it('szerver-esemény: a kezelő megkapja a payloadot, és az általa írt signal azonnal látszik', async () => {
    await service.startConnection();
    const received = signal<{ n: number } | null>(null);
    service.on<{ n: number }>('QuestionStarted', (payload) => received.set(payload));

    expect(hub().on).toHaveBeenCalledWith('QuestionStarted', expect.any(Function));
    hub().handlers.get('QuestionStarted')!({ n: 3 });

    expect(received()).toEqual({ n: 3 });
  });

  it('állapotváltások: újracsatlakozás → reconnect-callback, bezárás → bontott', async () => {
    const reconnected = vi.fn();
    service.setReconnectedCallback(reconnected);
    await service.startConnection();

    hub().reconnecting();
    expect(service.isReconnecting()).toBe(true);
    expect(service.isConnected()).toBe(false);

    hub().reconnected();
    expect(service.isConnected()).toBe(true);
    expect(reconnected).toHaveBeenCalledTimes(1);

    hub().closed();
    expect(service.state()).toBe(HubConnectionState.Disconnected);
  });

  it('bontás: leállítja a kapcsolatot (a stop hibáját elnyeli), a következő indítás új kapcsolatot épít', async () => {
    await service.startConnection();
    const old = hub();
    old.stop.mockRejectedValueOnce(new Error('already closed'));

    service.disconnect();
    await Promise.resolve();

    expect(old.stop).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe(HubConnectionState.Disconnected);

    await service.startConnection();
    expect(hubs.length).toBe(2);
  });
});
