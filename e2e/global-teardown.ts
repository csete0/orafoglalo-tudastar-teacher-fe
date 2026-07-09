import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { BACKEND_PID_FILE, DB_CONTAINER_NAME } from './constants';

export default async function globalTeardown(): Promise<void> {
  console.log('[global-teardown] Backend-folyamat leállítása (global-setup.ts manuálisan indította)...');
  stopBackend();

  console.log('[global-teardown] E2E DB-konténer eltávolítása...');
  try {
    execFileSync('docker', ['rm', '-f', DB_CONTAINER_NAME], { stdio: 'inherit' });
  } catch {
    // A konténer esetleg már nem létezik — nem hiba.
  }
}

function stopBackend(): void {
  if (!fs.existsSync(BACKEND_PID_FILE)) return;

  const pid = fs.readFileSync(BACKEND_PID_FILE, 'utf-8').trim();
  fs.rmSync(BACKEND_PID_FILE, { force: true });
  if (!pid) return;

  try {
    // /T: a teljes folyamatfát leállítja — a `dotnet run` maga is spawnol
    // egy tényleges DigitalCulture.API.exe gyermek-folyamatot.
    execFileSync('taskkill', ['/F', '/T', '/PID', pid], { stdio: 'ignore' });
  } catch {
    // A folyamat esetleg már nem fut — nem hiba.
  }
}
