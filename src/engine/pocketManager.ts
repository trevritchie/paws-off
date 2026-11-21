import { SilentKeepAlive } from '../audio/silentKeepAlive';

export interface PocketHandlers {
  onPlay: () => void;
  onStop: () => void;
  onReplay: () => void;
  onSkip: () => void;
}

export interface PocketMetadata {
  title: string;
  artist?: string;
  album: string;
}

export interface PocketController {
  activate(handlers: PocketHandlers): void;
  deactivate(): void;
  updateMetadata(metadata: PocketMetadata): void;
  recoverAudioSession(): void;
  isWakeLockActive(): boolean;
  onWakeLockChange(cb: (active: boolean) => void): () => void;
  dispose(): void;
}

export function createArtworkDataUrl(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#121417';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#2B323B';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 232, 232);

    if (typeof Path2D !== 'undefined') {
      ctx.save();
      ctx.translate(36, 36);
      ctx.scale(7.667, 7.667);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = '#E5A93C';
      ctx.lineWidth = 2.2;
      ctx.stroke(
        new Path2D('M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0'),
      );

      ctx.strokeStyle = '#4FB3A4';
      ctx.lineWidth = 2.1;
      ctx.stroke(new Path2D('M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4'));
      ctx.restore();
    } else {
      ctx.strokeStyle = '#E5A93C';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(128, 118, 52, Math.PI * 0.9, Math.PI * 2.2);
      ctx.stroke();
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export class PocketManager implements PocketController {
  private keepAlive = new SilentKeepAlive();
  private wakeLock: WakeLockSentinel | null = null;
  private wakeLockListeners = new Set<(active: boolean) => void>();
  private wakeLockState = false;
  private active = false;
  private artworkUrl: string | null = null;
  private visibilityListener: (() => void) | null = null;

  private setWakeLockState(next: boolean): void {
    if (this.wakeLockState === next) return;
    this.wakeLockState = next;
    for (const cb of this.wakeLockListeners) {
      cb(next);
    }
  }

  private async requestWakeLock(): Promise<void> {
    if (
      !this.active ||
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator)
    ) {
      return;
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.active) {
        await sentinel.release().catch(() => {});
        return;
      }
      this.wakeLock = sentinel;
      this.setWakeLockState(true);
      sentinel.addEventListener('release', () => {
        if (this.wakeLock === sentinel) {
          this.wakeLock = null;
          this.setWakeLockState(false);
        }
      });
    } catch {
      this.setWakeLockState(false);
    }
  }

  private releaseWakeLock(): void {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    this.setWakeLockState(false);
    if (sentinel) {
      void sentinel.release().catch(() => {});
    }
  }

  private registerMediaActions(handlers: PocketHandlers): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    const bind = (action: MediaSessionAction, fn: (() => void) | null) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Some browsers reject unsupported action names.
      }
    };

    bind('play', handlers.onPlay);
    bind('pause', handlers.onStop);
    bind('stop', handlers.onStop);
    bind('previoustrack', handlers.onReplay);
    bind('nexttrack', handlers.onSkip);
  }

  activate(handlers: PocketHandlers): void {
    this.active = true;
    if (typeof navigator !== 'undefined') {
      try {
        const nav = navigator as Navigator & {
          audioSession?: { type: string };
        };
        if (nav.audioSession) {
          nav.audioSession.type = 'playback';
        }
      } catch {
        // Ignore on browsers without Web Audio Session API.
      }
    }
    this.keepAlive.start();
    this.registerMediaActions(handlers);

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
      } catch {
        // Ignore
      }
    }

    if (typeof document !== 'undefined' && !this.visibilityListener) {
      this.visibilityListener = () => {
        if (this.active && document.visibilityState === 'visible') {
          this.keepAlive.ensurePlaying();
          if (!this.wakeLock) {
            void this.requestWakeLock();
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }

    void this.requestWakeLock();
  }

  updateMetadata(metadata: PocketMetadata): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    if (typeof MediaMetadata === 'undefined') return;

    if (this.artworkUrl === null) {
      this.artworkUrl = createArtworkDataUrl();
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata.title,
        artist: metadata.artist ?? 'Paws Off',
        album: metadata.album,
        artwork: this.artworkUrl
          ? [{ src: this.artworkUrl, sizes: '256x256', type: 'image/png' }]
          : [],
      });
      navigator.mediaSession.playbackState = this.active ? 'playing' : 'paused';
    } catch {
      // Ignore
    }
  }

  recoverAudioSession(): void {
    if (!this.active) return;
    this.keepAlive.ensurePlaying();
  }

  deactivate(): void {
    this.active = false;
    this.keepAlive.stop();
    this.releaseWakeLock();

    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'paused';
      } catch {
        // Ignore
      }
    }
  }

  isWakeLockActive(): boolean {
    return this.wakeLockState;
  }

  onWakeLockChange(cb: (active: boolean) => void): () => void {
    this.wakeLockListeners.add(cb);
    return () => {
      this.wakeLockListeners.delete(cb);
    };
  }

  dispose(): void {
    this.deactivate();
    this.keepAlive.dispose();
    this.wakeLockListeners.clear();
  }
}
