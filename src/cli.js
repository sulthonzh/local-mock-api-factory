#!/usr/bin/env node

const { start } = require('./index');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

// Help
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
mockapi — Spin up mock REST APIs from a JSON file

Usage:
  mockapi <definition.json> [--port 8080]

Options:
  --port, -p    Port to listen on (default: 3456 or from definition)
  --help, -h    Show this help

Example:
  mockapi api.json
  mockapi ./mocks/api.json --port 4000

Definition file format (JSON):
  {
    "port": 3456,
    "cors": true,
    "routes": {
      "/users": {
        "get": { "status": 200, "body": [{ "id": 1, "name": "Ada" }] }
      },
      "/users/:id": {
        "get": { "status": 200, "body": { "id": 1, "name": "Ada" } }
      },
      "/health": {
        "get": { "status": 200, "body": { "status": "ok", "_eval": "{ uptime: Math.floor(Date.now() / 1000) }" } }
      }
    }
  }
`);
  process.exit(0);
}

// Parse args
let defFile = null;
let port = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[++i], 10);
  } else if (!args[i].startsWith('-')) {
    defFile = args[i];
  }
}

if (!defFile) {
  console.error('Error: No definition file specified. Run `mockapi --help` for usage.');
  process.exit(1);
}

const resolvedPath = path.resolve(defFile);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found: ${resolvedPath}`);
  process.exit(1);
}

start(resolvedPath, { port }).catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
