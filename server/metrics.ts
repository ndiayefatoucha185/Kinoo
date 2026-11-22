import os from 'os';

export interface ServerMetrics {
  timestamp: string;
  uptimeSeconds: number;
  cpu: {
    loadAverage: number[];
    processUsageUserMs: number;
    processUsageSystemMs: number;
    coreCount: number;
  };
  memory: {
    totalMb: number;
    freeMb: number;
    processRssMb: number;
    processHeapUsedMb: number;
    processHeapTotalMb: number;
  };
  websocket: {
    activeConnections: number;
    totalMessagesRelayed: number;
    /** Moyenne des allers-retours ping/pong WebSocket mesurés ; null tant qu'aucune mesure n'existe. */
    averageLatencyMs: number | null;
    /** Non mesuré côté serveur : toujours null (aucune valeur inventée). */
    estimatedPacketLossRate: number | null;
  };
}

let totalMessagesRelayed = 0;
const latencySamples: number[] = [];

export const MetricsCollector = {
  incrementMessageCount() {
    totalMessagesRelayed++;
  },

  recordLatencySample(ms: number) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 60000) return;
    latencySamples.push(ms);
    if (latencySamples.length > 50) {
      latencySamples.shift();
    }
  },

  getSnapshot(activeWsConnections: number = 0): ServerMetrics {
    const memory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const totalMem = os.totalmem() / (1024 * 1024);
    const freeMem = os.freemem() / (1024 * 1024);

    const avgLatency =
      latencySamples.length > 0
        ? Math.round((latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length) * 10) / 10
        : null;

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      cpu: {
        loadAverage: os.loadavg(),
        processUsageUserMs: Math.round(cpuUsage.user / 1000),
        processUsageSystemMs: Math.round(cpuUsage.system / 1000),
        coreCount: os.cpus().length,
      },
      memory: {
        totalMb: Math.round(totalMem),
        freeMb: Math.round(freeMem),
        processRssMb: Math.round(memory.rss / (1024 * 1024)),
        processHeapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        processHeapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
      },
      websocket: {
        activeConnections: activeWsConnections,
        totalMessagesRelayed,
        averageLatencyMs: avgLatency,
        estimatedPacketLossRate: null,
      },
    };
  },
};
