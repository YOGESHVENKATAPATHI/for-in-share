import fetch from 'node-fetch';

// Reusable KeepAliveService for script-based keep-alive pings
export class KeepAliveService {
  constructor({ intervalMs = 30000, timeoutMs = 5000, maxFailures = 5 } = {}) {
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.maxFailures = maxFailures;
    this.servers = new Map(); // url -> { url, consecutiveFailures, isActive }
    this.interval = null;
  }

  addServer(url) {
    if (!url) return;
    if (this.servers.has(url)) return;
    this.servers.set(url, { url, consecutiveFailures: 0, isActive: true });
    console.log(`KeepAlive: Added server ${url}`);
  }

  removeServer(url) {
    if (!this.servers.has(url)) return;
    this.servers.delete(url);
    console.log(`KeepAlive: Removed server ${url}`);
  }

  getStatus() {
    const list = Array.from(this.servers.values()).map(s => ({ url: s.url, isActive: s.isActive, consecutiveFailures: s.consecutiveFailures }));
    return { intervalMs: this.intervalMs, servers: list };
  }

  async pingServer(server) {
    const endpoints = ['/api/ping', '/health', '/api/health', '/'];
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      const pingUrl = `${server.url.replace(/\/$/, '')}${endpoint}`;
      try {
        const res = await fetch(pingUrl, { timeout: this.timeoutMs, headers: { 'User-Agent': 'KeepAlive-Script/1.0', 'X-Keep-Alive': 'true' } });
        if (res.ok || (res.status >= 200 && res.status < 400) || res.status === 404) {
          server.consecutiveFailures = 0;
          if (!server.isActive) {
            server.isActive = true;
            console.log(`KeepAlive: ${server.url} back online (via ${endpoint})`);
          } else {
            console.log(`KeepAlive: ${server.url} responded (${res.status}) via ${endpoint}`);
          }
          return true;
        }
      } catch (err) {
        // try next endpoint
      }
    }
    // All endpoints tried and failed
    server.consecutiveFailures++;
    if (server.isActive && server.consecutiveFailures >= this.maxFailures) {
      server.isActive = false;
      console.warn(`KeepAlive: ${server.url} marked as inactive after ${server.consecutiveFailures} failures`);
    } else {
      console.warn(`KeepAlive: Failed ping to ${server.url} (failure count: ${server.consecutiveFailures})`);
    }
    return false;
  }

  start() {
    if (this.interval) return;
    console.log(`KeepAlive: Starting with ${this.servers.size} servers, interval ${this.intervalMs}ms`);
    this.interval = setInterval(async () => {
      for (const s of this.servers.values()) {
        await this.pingServer(s);
      }
    }, this.intervalMs);
  }

  stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    console.log('KeepAlive: Stopped');
  }
}

export default KeepAliveService;
