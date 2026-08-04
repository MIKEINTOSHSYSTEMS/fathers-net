export type DependencyStatus = 'up' | 'down';

export interface DependencyCheck {
  name: string;
  status: DependencyStatus;
  latency_ms?: number;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  checks: DependencyCheck[];
  latency_ms?: number;
}

/** Single probe against one dependency. Must resolve without throwing. */
export type ReadinessProbe = () => Promise<DependencyCheck>;

export interface ReadinessRegistry {
  register(name: string, probe: ReadinessProbe): void;
  checkAll(): Promise<ReadinessResult>;
}

/**
 * Readiness probe registry. Services register dependency probes at boot;
 * `/readyz` runs them all. In Milestone 1 the registry starts empty (no
 * business dependencies are wired yet) so readiness reports ready.
 */
export function createReadinessRegistry(): ReadinessRegistry {
  const probes = new Map<string, ReadinessProbe>();

  return {
    register(name, probe) {
      probes.set(name, probe);
    },
    async checkAll() {
      const started = Date.now();
      const results = await Promise.allSettled(
        [...probes.entries()].map(async ([, probe]) => {
          const probeStarted = Date.now();
          const check = await probe();
          return { ...check, latency_ms: Date.now() - probeStarted };
        }),
      );

      const checks: DependencyCheck[] = results.map((result, index) => {
        // eslint-disable-next-line security/detect-object-injection -- `index` is bounded by the fixed number of registered probes.
        const name = [...probes.keys()][index] ?? 'unknown';
        if (result.status === 'fulfilled') {
          return result.value;
        }
        return { name, status: 'down' as const };
      });

      return {
        status: checks.every((check) => check.status === 'up') ? 'ready' : 'not_ready',
        checks,
        latency_ms: Date.now() - started,
      };
    },
  };
}
