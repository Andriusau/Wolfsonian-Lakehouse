// Ensure Node.js HTTP server keeps connections open longer than upstream reverse proxies (e.g., IIS ARR, NGINX)
// This prevents 502 Bad Gateway errors caused by IIS reusing idle TCP connections that Node abruptly closed (default was 5s).
const http = require('http');
const originalCreateServer = http.createServer;

http.createServer = function(...args) {
  const server = originalCreateServer.apply(this, args);
  server.keepAliveTimeout = 120000; // 120 seconds
  server.headersTimeout = 125000;   // 125 seconds (must be > keepAliveTimeout)
  server.requestTimeout = 300000;   // 5 minutes
  return server;
};
