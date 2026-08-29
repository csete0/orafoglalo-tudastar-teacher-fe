import {
  computed,
  inject,
  Injectable,
  NgZone,
  OnDestroy,
  signal,
} from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { HttpTransportType, HubConnectionState } from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { TokenService } from '../auth/token.service';
import { KahootRoomSnapshotDto } from '../../models/kahoot-host.model';

/**
 * A /kahoothub host-oldali kapcsolat-kezelője - a diák-app kahoot-signalr
 * szolgáltatásának copy-adapt portja (a repók közti megosztás mintája a
 * token.service-szel azonos):
 *
 *  - a kapcsolat-életciklus NgZone-on KÍVÜL fut, az eseménykezelők zone-BAN
 *    hívódnak vissza (signal-írás → UI-frissülés);
 *  - a JWT accessTokenFactory-val megy (a WebSocket-handshake nem hordozhat
 *    Authorization fejlécet - a backend a query access_token-t fogadja el);
 *  - a szerver-timeout a backend KeepAliveInterval=15s / ClientTimeout=60s
 *    beállításához igazítva.
 *
 * Reconnectnél a SignalR-csoporttagság elveszik - a hívó (KahootHostStore) az
 * onReconnected-ben újra JoinRoom-ot hív, ami friss snapshotot is ad.
 */
@Injectable({ providedIn: 'root' })
export class KahootSignalRService implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly tokenService = inject(TokenService);

  private hubConnection: signalR.HubConnection | null = null;
  private connectionPromise: Promise<void> | null = null;
  private reconnectedCallback: (() => void) | null = null;

  private readonly _state = signal<HubConnectionState>(HubConnectionState.Disconnected);
  readonly state = this._state.asReadonly();
  readonly isConnected = computed(() => this._state() === HubConnectionState.Connected);
  readonly isReconnecting = computed(() => this._state() === HubConnectionState.Reconnecting);

  ngOnDestroy(): void {
    this.disconnect();
  }

  startConnection(): Promise<void> {
    if (this.connectionPromise) return this.connectionPromise;
    if (this.hubConnection?.state === HubConnectionState.Connected) {
      return Promise.resolve();
    }

    this.connectionPromise = this.ngZone
      .runOutsideAngular(() => this.connectInternal())
      .finally(() => {
        this.connectionPromise = null;
      });

    return this.connectionPromise;
  }

  private async connectInternal(): Promise<void> {
    if (!this.hubConnection || this.hubConnection.state === HubConnectionState.Disconnected) {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(environment.backendUrl + '/kahoothub', {
          skipNegotiation: false,
          transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents,
          withCredentials: false,
          accessTokenFactory: async () => (await this.tokenService.getValidAccessToken()) ?? '',
        })
        .withAutomaticReconnect()
        .withServerTimeout(60000)
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      this.hubConnection.onreconnecting(() => this.updateState(HubConnectionState.Reconnecting));
      this.hubConnection.onreconnected(() => {
        this.updateState(HubConnectionState.Connected);
        if (this.reconnectedCallback) {
          this.ngZone.run(this.reconnectedCallback);
        }
      });
      this.hubConnection.onclose(() => this.updateState(HubConnectionState.Disconnected));
    }

    if (this.hubConnection.state !== HubConnectionState.Connected) {
      await this.hubConnection.start();
      this.updateState(this.hubConnection.state);
    }
  }

  disconnect(): void {
    const connection = this.hubConnection;
    this.hubConnection = null;
    this.reconnectedCallback = null;
    if (connection) {
      this.ngZone.runOutsideAngular(() => void connection.stop().catch(() => undefined));
    }
    this._state.set(HubConnectionState.Disconnected);
  }

  setReconnectedCallback(callback: (() => void) | null): void {
    this.reconnectedCallback = callback;
  }

  // ── Hub-metódusok (host) ────────────────────────────────

  joinRoom(kahootSessionId: number): Promise<KahootRoomSnapshotDto> {
    return this.invoke<KahootRoomSnapshotDto>('JoinRoom', kahootSessionId);
  }

  startGame(kahootSessionId: number): Promise<void> {
    return this.invoke<void>('StartGame', kahootSessionId);
  }

  nextQuestion(kahootSessionId: number): Promise<void> {
    return this.invoke<void>('NextQuestion', kahootSessionId);
  }

  closeQuestion(kahootSessionId: number): Promise<void> {
    return this.invoke<void>('CloseQuestion', kahootSessionId);
  }

  endGame(kahootSessionId: number): Promise<void> {
    return this.invoke<void>('EndGame', kahootSessionId);
  }

  leaveRoom(kahootSessionId: number): Promise<void> {
    return this.invoke<void>('LeaveRoom', kahootSessionId);
  }

  /** Szerver-esemény feliratkozás - a handler zone-BAN fut. */
  on<T>(eventName: string, handler: (payload: T) => void): void {
    this.hubConnection?.on(eventName, (payload: T) => {
      this.ngZone.run(() => handler(payload));
    });
  }

  private async invoke<T>(methodName: string, ...args: unknown[]): Promise<T> {
    await this.startConnection();
    if (!this.hubConnection) {
      throw new Error('Nincs élő kapcsolat.');
    }
    return this.ngZone.runOutsideAngular(() =>
      this.hubConnection!.invoke<T>(methodName, ...args),
    );
  }

  private updateState(state: HubConnectionState): void {
    this.ngZone.run(() => this._state.set(state));
  }
}
