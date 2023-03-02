import Extension from '../extension';
import metrics from 'prom-client'

import { createZhMetrics } from './createZhMetrics';
import { MetricsServer } from './server';
import { createZ2MMetrics as createZ2MMetrics } from './createZ2MMetrics'

/**
 * This extension serves prometheus metrics
 */
export default class Metrics extends Extension {
  server: MetricsServer;

  override async start(): Promise<void> {

    createZ2MMetrics(this.zigbee, this.mqtt, this.state)
    createZhMetrics()

    this.server = await MetricsServer.create()
  }

  override async stop(): Promise<void> {
    super.stop()

    metrics.register.clear()

    if (this.server) {
      await this.server.stop()
    }
  }
}
