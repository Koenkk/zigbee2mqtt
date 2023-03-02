import metrics from "prom-client";
import http from 'node:http'
import * as settings from '../../util/settings';
import bind from 'bind-decorator';
import logger from "../../util/logger";

export class MetricsServer {
  private server: http.Server;
  private host = settings.get().metrics.host;
  private port = settings.get().metrics.port;

  private constructor() {
    this.server = http.createServer(this.onRequest);

  }

  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, resolve)
        .on('error', reject)
    })

    logger.info(`Started metrics on port ${this.host}:${this.port}/metrics`);
  }

  async stop() {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) { return reject(err) }
        resolve()
      })
    })
    logger.info(`Stopped metrics on port ${this.host}:${this.port}/metrics`);
  }

  @bind private onRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
    if (request.url !== '/metrics') {
      response.statusCode = 404
      response.end()
      return
    }

    this.onMetricsRequest(request, response);
  }

  private async onMetricsRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const metricsResponse = await metrics.register.metrics()
    response.write(metricsResponse)
    response.end()
  }

  static async create(): Promise<MetricsServer> {
    const server = new MetricsServer()
    await server.start()
    return server
  }
}