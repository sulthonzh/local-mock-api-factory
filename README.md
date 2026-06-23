# local-mock-api-factory

> **⚠️ DEPRECATED - CRITICAL SECURITY VULNERABILITY**
>
> This project contains a critical security vulnerability and is deprecated. Please use [msw](https://github.com/mswjs/msw), [json-server](https://github.com/typicode/json-server), or [MirageJS](https://miragejs.com/) instead.
>
> **Security Issue:** The `_eval` feature uses `new Function()` for arbitrary code execution, which enables remote code injection attacks if used in production or shared environments. This vulnerability cannot be fixed without a complete redesign.
>
> **Deprecation Date:** June 23, 2026

---

> Spin up a mock REST API from a JSON file. Zero dependencies, zero config.

Because you shouldn't have to set up Express, write boilerplate, or install a heavy framework just to fake an API for your frontend.

## What it does

You write a JSON file describing your endpoints. This tool gives you a running server with those routes in about 2 seconds. That's it.

No Express, no Fastify, no plugins, no config files. Just Node's built-in HTTP server and a JSON definition.

## Install

```bash
npm install -g local-mock-api-factory
```

Or run without installing:

```bash
npx local-mock-api-factory ./api.json
```

## Quick Start

Create `api.json`:

```json
{
  "port": 3456,
  "routes": {
    "/users": {
      "get": {
        "status": 200,
        "body": [
          { "id": 1, "name": "Ada Lovelace" },
          { "id": 2, "name": "Alan Turing" }
        ]
      },
      "post": {
        "status": 201,
        "body": { "ok": true }
      }
    },
    "/users/:id": {
      "get": {
        "status": 200,
        "body": { "id": 1, "name": "Ada Lovelace" }
      }
    },
    "/health": {
      "get": {
        "status": 200,
        "body": {
          "status": "ok",
          "timestamp": { "_eval": "new Date().toISOString()" }
        }
      }
    }
  }
}
```

Run it:

```bash
mockapi ./api.json
```

Now hit your endpoints:

```bash
curl http://localhost:3456/users
curl http://localhost:3456/users/1
curl http://localhost:3456/health
```

## Features

### Route params

Use `:param` in paths — matched values are available in `_eval` expressions:

```json
"/users/:id": {
  "get": {
    "status": 200,
    "body": {
      "_eval": "{ id: parseInt(params.id), name: 'User ' + params.id }"
    }
  }
}
```

### Dynamic responses with `_eval`

Generate timestamps, computed values, whatever JS can do:

```json
{
  "timestamp": { "_eval": "new Date().toISOString()" },
  "count": { "_eval": "Math.floor(Math.random() * 100)" }
}
```

### Simulated latency

Add `delay` in milliseconds to simulate slow APIs:

```json
"/heavy-data": {
  "get": {
    "status": 200,
    "delay": 2000,
    "body": { "data": "took a while, huh?" }
  }
}
```

### Serve from file

Load response body from a separate JSON file:

```json
"/catalog": {
  "get": {
    "status": 200,
    "body": { "_file": "./data/catalog.json" }
  }
}
```

### CORS

CORS headers are on by default (`Access-Control-Allow-Origin: *`). Disable with `"cors": false`.

### Auto 404

Any path not defined in your routes returns a clean 404:

```json
{ "error": "Not found", "path": "/unknown", "method": "GET" }
```

## Why another mock tool?

Honestly, most mock API tools are overengineered. They need config files, proxy setups, or a whole DSL. I just wanted something where I write a JSON file and get a server. No deps, no fuss.

Use cases:
- **Frontend prototyping** — build UI before the real API exists
- **Testing** — consistent, predictable responses for integration tests
- **Demos** — realistic-ish API without standing up a backend
- **Workshops** — give participants a working API in seconds

## CLI

```bash
mockapi <definition.json> [--port 8080]
```

| Flag        | Description                          |
|-------------|--------------------------------------|
| `--port, -p`| Override port (default: 3456)        |
| `--help, -h`| Show help                            |

## Programmatic API

```javascript
const { start, createServer } = require('local-mock-api-factory');

// Start a server
const server = await start('./api.json', { port: 4000 });
// ... later
server.close();

// Or create without starting
const server = createServer(definition);
server.listen(4000);
```

## Zero Dependencies

This package has **zero npm dependencies**. It uses only Node.js built-ins (`http`, `fs`, `path`, `url`). Your `node_modules` stays clean.

## License

MIT
