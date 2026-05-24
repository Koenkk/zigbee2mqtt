/**
 * Z2M MCP Server - HTTP Transport
 * Phase 4: Optional HTTP transport for AI tools via network
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/shared/jsonrpc';
import logger from '../../util/logger';

export interface HttpTransportOptions {
  host?: string;
  port?: number;
  apiKey?: string;
  corsOrigins?: string[];
}

/**
 * HTTP Transport for MCP Server
 * Allows remote AI tools to connect via HTTP instead of just Stdio
 */
export class HttpTransport implements Transport {
  private host: string;
  private port: number;
  private apiKey?: string;
  private corsOrigins: string[];
  private isConnected: boolean = false;

  constructor(options: HttpTransportOptions = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 3000;
    this.apiKey = options.apiKey;
    this.corsOrigins = options.corsOrigins || ['localhost', 'localhost:3000', 'localhost:8123'];
  }

  /**
   * Initialize HTTP server (placeholder - requires Express)
   */
  async start(): Promise<void> {
    logger.warn('HTTP transport not fully implemented - requires Express dependency');
    this.isConnected = true;
  }

  /**
   * Emit events from transport
   */
  public onmessage?: (message: JSONRPCMessage) => void | Promise<void>;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  /**
   * Send message to client
   */
  async send(message: JSONRPCMessage): Promise<void> {
    logger.debug('HTTP transport sending:', message);
  }

  /**
   * Close transport
   */
  async close(): Promise<void> {
    this.isConnected = false;
    logger.info('Z2M MCP HTTP transport closed');
  }
}
