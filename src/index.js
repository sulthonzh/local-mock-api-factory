const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

/**
 * Parse a mock definition file (JSON or YAML-like plain object).
 * Only JSON is supported natively — zero deps.
 */
function loadDefinition(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Definition file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse ${resolved} — only JSON is supported`);
  }
}

/**
 * Match a route pattern like "/users/:id" against an actual pathname.
 * Returns { matched: true, params: { id: "123" } } or { matched: false }.
 */
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return { matched: false };

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return { matched: false };
    }
  }
  return { matched: true, params };
}

/**
 * Resolve a response body. Supports:
 *  - static value (object/array/string)
 *  - { _eval: "expression" } — simple JS eval for dynamic data (date, count, etc.)
 *  - { _file: "path" } — serve from a file
 */
function resolveBody(bodyDef, params, query, basePath) {
  if (bodyDef === null || bodyDef === undefined) return null;
  if (typeof bodyDef !== 'object' || Array.isArray(bodyDef)) return bodyDef;

  // _file: load from file
  if (bodyDef._file) {
    const fpath = path.resolve(basePath || '', bodyDef._file);
    if (fs.existsSync(fpath)) {
      return JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    }
    return { error: `File not found: ${bodyDef._file}` };
  }

  // _eval: simple dynamic expression
  if (bodyDef._eval) {
    try {
      const fn = new Function('params', 'query', 'now', `return (${bodyDef._eval});`);
      return fn(params, query, Date.now());
    } catch {
      return { error: 'Failed to evaluate expression' };
    }
  }

  // Regular object — recursively resolve any nested _eval/_file
  const result = {};
  for (const [key, val] of Object.entries(bodyDef)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && (val._eval || val._file)) {
      result[key] = resolveBody(val, params, query);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Build a route lookup from the definition.
 * Returns an array of { method, pattern, status, headers, body, delay }.
 */
function buildRoutes(definition) {
  const routes = [];

  for (const [routePath, methods] of Object.entries(definition.routes || {})) {
    for (const [method, config] of Object.entries(methods)) {
      routes.push({
        method: method.toUpperCase(),
        pattern: routePath,
        status: config.status || 200,
        headers: config.headers || { 'Content-Type': 'application/json' },
        body: config.body !== undefined ? config.body : config.response !== undefined ? config.response : null,
        delay: config.delay || 0,
      });
    }
  }

  return routes;
}

/**
 * Create and return an HTTP server.
 */
function createServer(definition, options = {}) {
  const definitionFilePath = options.definitionFilePath || '';
  const routes = buildRoutes(definition);
  const base = definition.basePath || '';
  const cors = definition.cors !== false; // enabled by default

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const query = parsed.query;

    // CORS preflight
    if (cors && req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    // Try to match a route
    for (const route of routes) {
      const fullPath = base + route.pattern;
      const match = matchRoute(fullPath, pathname);
      if (match.matched && route.method === req.method) {
        const body = resolveBody(route.body, match.params, query, path.dirname(definitionFilePath));
        const headers = { ...route.headers };
        if (cors) {
          headers['Access-Control-Allow-Origin'] = '*';
        }

        const send = () => {
          res.writeHead(route.status, headers);
          res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
        };

        if (route.delay > 0) {
          setTimeout(send, route.delay);
        } else {
          send();
        }
        return;
      }
    }

    // 404 — no route matched
    const notFoundHeaders = { 'Content-Type': 'application/json' };
    if (cors) notFoundHeaders['Access-Control-Allow-Origin'] = '*';
    res.writeHead(404, notFoundHeaders);
    res.end(JSON.stringify({ error: 'Not found', path: pathname, method: req.method }, null, 2));
  });

  return server;
}

/**
 * Start the mock API server.
 * @param {string} definitionPath - Path to JSON definition file
 * @param {object} options - { port: number }
 * @returns {Promise<http.Server>}
 */
function start(definitionPath, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const definition = loadDefinition(definitionPath);
      const port = options.port || definition.port || 3456;
      const server = createServer(definition, { ...options, definitionFilePath: definitionPath });

      server.listen(port, () => {
        const routeCount = buildRoutes(definition).length;
        console.log(`\n  mockapi running on http://localhost:${port}`);
        console.log(`  ${routeCount} route${routeCount !== 1 ? 's' : ''} loaded\n`);
        resolve(server);
      });

      server.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { loadDefinition, matchRoute, resolveBody, buildRoutes, createServer, start };
