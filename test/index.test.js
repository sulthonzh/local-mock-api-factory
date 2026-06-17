const assert = require('assert');
const { loadDefinition, matchRoute, resolveBody, buildRoutes, createServer } = require('../src/index');
const fs = require('fs');
const path = require('path');

// Create test directory if it doesn't exist
const testDir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Test fixtures
const testDefinition = {
  port: 3456,
  cors: true,
  routes: {
    "/users": {
      "get": {
        "status": 200,
        "body": [
          { "id": 1, "name": "Ada" },
          { "id": 2, "name": "Alan" }
        ]
      },
      "post": {
        "status": 201,
        "body": { "ok": true, "id": Date.now() }
      }
    },
    "/users/:id": {
      "get": {
        "status": 200,
        "body": {
          "_eval": "({ id: parseInt(params.id), name: 'User ' + params.id, timestamp: Date.now() })"
        }
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
    },
    "/slow": {
      "get": {
        "status": 200,
        "delay": 100,
        "body": { "message": "slow response" }
      }
    },
    "/file": {
      "get": {
        "status": 200,
        "body": { "_file": "fixtures/sample.json" }
      }
    }
  }
};

// Write test fixtures
fs.writeFileSync(path.join(testDir, 'sample.json'), JSON.stringify({ message: "Hello from file!" }));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('.');
  } catch (err) {
    failed++;
    process.stdout.write('F');
    console.error(`\n✗ ${name}: ${err.message}`);
    console.error(err.stack);
  }
}

// ── loadDefinition ──────────────────────────────────────

test('loadDefinition: valid JSON file', () => {
  const defPath = path.join(__dirname, 'test-def.json');
  fs.writeFileSync(defPath, JSON.stringify(testDefinition));
  const result = loadDefinition(defPath);
  assert.deepStrictEqual(result, testDefinition);
});

test('loadDefinition: file not found throws error', () => {
  assert.throws(() => loadDefinition('nonexistent.json'), /Definition file not found/);
});

test('loadDefinition: invalid JSON throws error', () => {
  const defPath = path.join(__dirname, 'invalid.json');
  fs.writeFileSync(defPath, '{ invalid json }');
  assert.throws(() => loadDefinition(defPath), /Failed to parse/);
});

// ── matchRoute ───────────────────────────────────────────

test('matchRoute: exact match', () => {
  const result = matchRoute('/users', '/users');
  assert.ok(result.matched);
  assert.deepStrictEqual(result.params, {});
});

test('matchRoute: parameter match', () => {
  const result = matchRoute('/users/:id', '/users/123');
  assert.ok(result.matched);
  assert.deepStrictEqual(result.params, { id: '123' });
});

test('matchRoute: multiple parameters', () => {
  const result = matchRoute('/users/:id/posts/:postId', '/users/123/posts/456');
  assert.ok(result.matched);
  assert.deepStrictEqual(result.params, { id: '123', postId: '456' });
});

test('matchRoute: no match wrong path', () => {
  const result = matchRoute('/users', '/posts');
  assert.ok(!result.matched);
});

test('matchRoute: no match wrong length', () => {
  const result = matchRoute('/users/:id', '/users/123/extra');
  assert.ok(!result.matched);
});

test('matchRoute: no match static part', () => {
  const result = matchRoute('/users/:id', '/posts/123');
  assert.ok(!result.matched);
});

// ── resolveBody ──────────────────────────────────────────

test('resolveBody: static object', () => {
  const body = { message: 'hello', count: 42 };
  const result = resolveBody(body, {}, {});
  assert.deepStrictEqual(result, { message: 'hello', count: 42 });
});

test('resolveBody: static array', () => {
  const body = [1, 2, 3];
  const result = resolveBody(body, {}, {});
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test('resolveBody: static string', () => {
  const result = resolveBody('hello', {}, {});
  assert.strictEqual(result, 'hello');
});

test('resolveBody: static null', () => {
  const result = resolveBody(null, {}, {});
  assert.strictEqual(result, null);
});

test('resolveBody: _eval with params', () => {
  const body = { "_eval": "params.id * 2" };
  const result = resolveBody(body, { id: '5' }, {});
  assert.strictEqual(result, 10);
});

test('resolveBody: _eval with query', () => {
  const body = { "_eval": "parseInt(query.limit) || 10" };
  const result = resolveBody(body, {}, { limit: '20' });
  assert.strictEqual(result, 20);
});

test('resolveBody: _eval with timestamp', () => {
  const before = Date.now();
  const body = { "_eval": "now" };
  const result = resolveBody(body, {}, {}, before);
  assert.ok(typeof result === 'number');
  assert.ok(result >= before);
});

test('resolveBody: _eval error returns error object', () => {
  const body = { "_eval": "invalid syntax" };
  const result = resolveBody(body, {}, {});
  assert.ok(result.error);
});

test('resolveBody: _file exists', () => {
  const body = { "_file": "test/fixtures/sample.json" };
  const result = resolveBody(body, {}, {});
  assert.deepStrictEqual(result, { message: "Hello from file!" });
});

test('resolveBody: _file not found', () => {
  const body = { "_file": "nonexistent.json" };
  const result = resolveBody(body, {}, {});
  assert.ok(result.error);
  assert.ok(result.error.includes('File not found'));
});

test('resolveBody: nested _eval', () => {
  const body = {
    user: { "_eval": "({ name: 'User ' + params.id })" },
    timestamp: { "_eval": "Date.now()" }
  };
  const result = resolveBody(body, { id: '123' }, {});
  assert.strictEqual(result.user.name, 'User 123');
  assert.ok(typeof result.timestamp === 'number');
});

// ── buildRoutes ──────────────────────────────────────────

test('buildRoutes: simple definition', () => {
  const routes = buildRoutes(testDefinition);
  assert.strictEqual(routes.length, 6);
  assert.ok(routes.find(r => r.method === 'GET' && r.pattern === '/users'));
  assert.ok(routes.find(r => r.method === 'POST' && r.pattern === '/users'));
  assert.ok(routes.find(r => r.method === 'GET' && r.pattern === '/users/:id'));
  assert.ok(routes.find(r => r.method === 'GET' && r.pattern === '/health'));
  assert.ok(routes.find(r => r.method === 'GET' && r.pattern === '/slow'));
  assert.ok(routes.find(r => r.method === 'GET' && r.pattern === '/file'));
});

test('buildRoutes: no routes returns empty array', () => {
  const definition = { port: 3456 };
  const routes = buildRoutes(definition);
  assert.deepStrictEqual(routes, []);
});

test('buildRoutes: default status and headers', () => {
  const definition = {
    routes: {
      "/test": {
        "get": {
          "body": { message: "ok" }
        }
      }
    }
  };
  const routes = buildRoutes(definition);
  const route = routes.find(r => r.pattern === '/test');
  assert.strictEqual(route.status, 200);
  assert.deepStrictEqual(route.headers, { 'Content-Type': 'application/json' });
});

// ── createServer ─────────────────────────────────────────

test('createServer: returns http server instance', () => {
  const server = createServer(testDefinition);
  assert.ok(server instanceof require('http').Server);
});

test('createServer: handles route matching', (done) => {
  const server = createServer(testDefinition);
  let requestCount = 0;
  
  server.listen(0, () => {
    const port = server.address().port;
    
    // Test GET /users
    const http = require('http');
    const req1 = http.get(`http://localhost:${port}/users`, (res) => {
      assert.strictEqual(res.statusCode, 200);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        assert.deepStrictEqual(parsed, [
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Alan' }
        ]);
        requestCount++;
        if (requestCount === 2) {
          server.close();
          done();
        }
      });
    });
    
    // Test POST /users
    const req2 = http.request({
      method: 'POST',
      hostname: 'localhost',
      port: port,
      path: '/users',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      assert.strictEqual(res.statusCode, 201);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        assert.ok(parsed.ok);
        assert.ok(parsed.id);
        requestCount++;
        if (requestCount === 2) {
          setTimeout(() => {
            server.close();
            done();
          }, 10);
        }
      });
    });
    req2.write(JSON.stringify({ test: true }));
    req2.end();
  });
});

test('createServer: handles route parameters', async () => {
  const server = createServer(testDefinition);
  
  await new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      const http = require('http');
      
      const req = http.get(`http://localhost:${port}/users/123`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const parsed = JSON.parse(data);
          assert.strictEqual(parsed.id, 123);
          assert.strictEqual(parsed.name, 'User 123');
          assert.ok(parsed.timestamp);
          
          // Close server and resolve
          server.close(() => resolve());
        });
      });
    });
  });
});

test('createServer: handles not found', (done) => {
  const server = createServer(testDefinition);
  
  server.listen(0, () => {
    const port = server.address().port;
    const http = require('http');
    
    const req = http.get(`http://localhost:${port}/notfound`, (res) => {
      assert.strictEqual(res.statusCode, 404);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        assert.ok(parsed.error);
        assert.ok(parsed.path);
        assert.ok(parsed.method);
        setTimeout(() => {
          server.close();
          done();
        }, 10);
      });
    });
  });
});

test('createServer: handles CORS headers', (done) => {
  const server = createServer(testDefinition);
  
  server.listen(0, () => {
    const port = server.address().port;
    const http = require('http');
    
    const req = http.get(`http://localhost:${port}/users`, (res) => {
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      setTimeout(() => {
        server.close();
        done();
      }, 10);
    });
  });
});

test('createServer: disabled CORS', (done) => {
  const definitionWithoutCors = {
    cors: false,
    routes: {
      "/test": {
        "get": {
          "status": 200,
          "body": { message: "ok" }
        }
      }
    }
  };
  
  const server = createServer(definitionWithoutCors);
  
  server.listen(0, () => {
    const port = server.address().port;
    const http = require('http');
    
    const req = http.get(`http://localhost:${port}/test`, (res) => {
      assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
      setTimeout(() => {
        server.close();
        done();
      }, 10);
    });
  });
});

// ── Integration ──────────────────────────────────────────

test('integration: full server startup and test', (done) => {
  const testDef = {
    port: 3456,
    routes: {
      "/ping": {
        "get": {
          "status": 200,
          "body": { "message": "pong" }
        }
      }
    }
  };
  
  const server = createServer(testDef);
  
  server.listen(0, () => {
    const port = server.address().port;
    const http = require('http');
    
    const req = http.get(`http://localhost:${port}/ping`, (res) => {
      assert.strictEqual(res.statusCode, 200);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        assert.strictEqual(parsed.message, 'pong');
        setTimeout(() => {
          server.close();
          done();
        }, 10);
      });
    });
  });
});

// ────────────────────────────────────────────────────────

// Cleanup test files
function cleanup() {
  const files = ['test-def.json', 'invalid.json'];
  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// Cleanup before exit
process.on('exit', cleanup);

console.log(`\n\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);