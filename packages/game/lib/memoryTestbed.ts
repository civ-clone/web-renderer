export type MemorySample = {
  objectCount: number;
  timestamp: number;
  turn: number;
  usedJSHeapSize: number | null;
};

export type MemoryTestbed = {
  exportCsv: () => string;
  samples: MemorySample[];
  stop: () => void;
};

type SnapshotProvider = () => {
  objectCount: number;
  turn: number;
};

export type MemoryTestbedOptions = {
  intervalMs?: number;
  maxSamples?: number | null;
};

declare global {
  interface Window {
    __civMemoryTestbed?: MemoryTestbed;
  }
}

const csvEscape = (value: string | number | null) =>
  `${value === null ? '' : value}`.replace(/"/g, '""');

export const createMemoryTestbed = (
  getSnapshot: SnapshotProvider,
  { intervalMs = 2000, maxSamples = null }: MemoryTestbedOptions = {}
): MemoryTestbed => {
  const samples: MemorySample[] = [];

  const sample = () => {
    const { turn, objectCount } = getSnapshot(),
      memory = (performance as any).memory;

    samples.push({
      timestamp: Date.now(),
      turn,
      objectCount,
      usedJSHeapSize:
        memory && typeof memory.usedJSHeapSize === 'number'
          ? memory.usedJSHeapSize
          : null,
    });

    if (maxSamples !== null && maxSamples > 0 && samples.length > maxSamples) {
      samples.splice(0, samples.length - maxSamples);
    }
  };

  sample();

  const reference = window.setInterval(sample, intervalMs);

  return {
    samples,
    stop() {
      window.clearInterval(reference);
    },
    exportCsv() {
      return [
        ['timestamp', 'turn', 'objectCount', 'usedJSHeapSize'].join(','),
        ...samples.map(({ timestamp, turn, objectCount, usedJSHeapSize }) =>
          [timestamp, turn, objectCount, usedJSHeapSize]
            .map((value) => csvEscape(value))
            .join(',')
        ),
      ].join('\n');
    },
  };
};

export default createMemoryTestbed;
