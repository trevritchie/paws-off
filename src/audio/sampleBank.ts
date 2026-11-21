export type AcousticSampleTimbreId =
  | 'grand-piano'
  | 'warm-strings'
  | 'chamber-cello'
  | 'french-horn'
  | 'concert-harp'
  | 'nylon-guitar'
  | 'clean-guitar'
  | 'harmonium'
  | 'pipe-organ'
  | 'marimba'
  | 'woodwind-choir'
  | 'steel-guitar'
  | 'pizzicato-strings'
  | 'warm-sax'
  | 'warm-trombone';

export interface AcousticPackConfig {
  id: AcousticSampleTimbreId;
  anchors: readonly number[];
  sustained: boolean;
}

export const ACOUSTIC_SAMPLES_VERSION = '3';

const STANDARD_10_ANCHORS: readonly number[] = [
  40, 44, 48, 52, 56, 60, 64, 68, 72, 76,
];

export const ACOUSTIC_PACK_CONFIGS: Record<
  AcousticSampleTimbreId,
  AcousticPackConfig
> = {
  'grand-piano': {
    id: 'grand-piano',
    anchors: [39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78],
    sustained: false,
  },
  'warm-strings': {
    id: 'warm-strings',
    anchors: STANDARD_10_ANCHORS,
    sustained: true,
  },
  'chamber-cello': {
    id: 'chamber-cello',
    anchors: [40, 43, 47, 50, 53, 57, 60, 64, 67, 71, 72],
    sustained: true,
  },
  'french-horn': {
    id: 'french-horn',
    anchors: [36, 39, 43, 50, 53, 57, 60, 74, 77],
    sustained: true,
  },
  'concert-harp': {
    id: 'concert-harp',
    anchors: [38, 41, 45, 48, 52, 55, 59, 62, 65, 69, 72, 76, 79],
    sustained: false,
  },
  'nylon-guitar': {
    id: 'nylon-guitar',
    anchors: [40, 44, 47, 50, 54, 57, 61, 64, 68, 71, 76],
    sustained: false,
  },
  'clean-guitar': {
    id: 'clean-guitar',
    anchors: [42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78],
    sustained: false,
  },
  harmonium: {
    id: 'harmonium',
    anchors: [40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 74],
    sustained: true,
  },
  'pipe-organ': {
    id: 'pipe-organ',
    anchors: STANDARD_10_ANCHORS,
    sustained: true,
  },
  marimba: {
    id: 'marimba',
    anchors: [36, 43, 47, 53, 60, 67, 71, 77],
    sustained: false,
  },
  'woodwind-choir': {
    id: 'woodwind-choir',
    anchors: [43, 45, 48, 50, 53, 58, 62, 65, 70, 72, 76],
    sustained: true,
  },
  'steel-guitar': {
    id: 'steel-guitar',
    anchors: [40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 74],
    sustained: false,
  },
  'pizzicato-strings': {
    id: 'pizzicato-strings',
    anchors: STANDARD_10_ANCHORS,
    sustained: false,
  },
  'warm-sax': {
    id: 'warm-sax',
    anchors: STANDARD_10_ANCHORS,
    sustained: true,
  },
  'warm-trombone': {
    id: 'warm-trombone',
    anchors: STANDARD_10_ANCHORS,
    sustained: true,
  },
};

export function isAcousticSampleTimbre(
  id: string,
): id is AcousticSampleTimbreId {
  return Object.prototype.hasOwnProperty.call(ACOUSTIC_PACK_CONFIGS, id);
}

export function findNearestAnchor(
  anchors: readonly number[],
  targetMidi: number,
): { anchorMidi: number; playbackRate: number } {
  let bestAnchor = anchors[0];
  let bestDist = Math.abs(targetMidi - bestAnchor);
  for (let i = 1; i < anchors.length; i++) {
    const candidate = anchors[i];
    const dist = Math.abs(targetMidi - candidate);
    if (dist < bestDist) {
      bestDist = dist;
      bestAnchor = candidate;
    }
  }
  return {
    anchorMidi: bestAnchor,
    playbackRate: Math.pow(2, (targetMidi - bestAnchor) / 12),
  };
}

export function getAcousticSampleUrl(
  id: AcousticSampleTimbreId,
  anchorMidi: number,
): string {
  const rawBase =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${base}samples/${id}/${anchorMidi}.mp3?v=${ACOUSTIC_SAMPLES_VERSION}`;
}

/**
 * Lazy-loaded, per-instrument decoded AudioBuffer cache for curated real
 * acoustic multi-samples. Each instrument only fetches its samples when chosen.
 */
export class AcousticSampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private loadingByPack = new Map<AcousticSampleTimbreId, Promise<void>>();
  private loadedPacks = new Set<AcousticSampleTimbreId>();
  private readonly fetcher: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher =
      fetcher ??
      ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  }

  private key(id: AcousticSampleTimbreId, anchorMidi: number): string {
    return `${id}:${anchorMidi}`;
  }

  isPackLoaded(id: AcousticSampleTimbreId): boolean {
    return this.loadedPacks.has(id);
  }

  async preload(ctx: AudioContext, id: AcousticSampleTimbreId): Promise<void> {
    if (this.loadedPacks.has(id)) return;
    const inflight = this.loadingByPack.get(id);
    if (inflight) return inflight;
    if (typeof this.fetcher !== 'function') return;

    const cfg = ACOUSTIC_PACK_CONFIGS[id];
    let loadedCount = 0;
    const tasks = cfg.anchors.map((anchorMidi) => {
      const k = this.key(id, anchorMidi);
      if (this.buffers.has(k)) {
        loadedCount++;
        return Promise.resolve();
      }
      const url = getAcousticSampleUrl(id, anchorMidi);
      return this.fetcher(url)
        .then(async (res) => {
          if (!res.ok) return;
          const bytes = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(bytes.slice(0));
          this.buffers.set(k, decoded);
          loadedCount++;
        })
        .catch(() => {
          // Fall back gracefully to Web Audio synth if offline.
        });
    });

    const promise = Promise.all(tasks)
      .then(() => {
        if (loadedCount > 0) {
          this.loadedPacks.add(id);
        }
      })
      .finally(() => {
        this.loadingByPack.delete(id);
      });

    this.loadingByPack.set(id, promise);
    return promise;
  }

  getSample(
    id: AcousticSampleTimbreId,
    targetMidi: number,
  ): { buffer: AudioBuffer; playbackRate: number; sustained: boolean } | null {
    const cfg = ACOUSTIC_PACK_CONFIGS[id];
    const { anchorMidi, playbackRate } = findNearestAnchor(
      cfg.anchors,
      targetMidi,
    );
    const buffer = this.buffers.get(this.key(id, anchorMidi));
    if (!buffer) return null;
    return { buffer, playbackRate, sustained: cfg.sustained };
  }

  clear(): void {
    this.buffers.clear();
    this.loadingByPack.clear();
    this.loadedPacks.clear();
  }
}
