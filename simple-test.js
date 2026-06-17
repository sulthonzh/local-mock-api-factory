const assert = require('assert');
const { createServer, buildRoutes, resolveBody } = require('./src/index.js');

const testDefinition = {
  routes: {
    "/users": {
      "get": {
        "status": 200,
        "body": [{ id: 1, name: 'Ada' }, { id: 2, name: 'Alan' }]
      },
      "post": {
        "status": 201,
        "body": { ok: true, id: 1 }
      }
    },
    "/users/:id": {
      "get": {
        "status": 200,
        "body": {
          id: 123,
          name: 'User 123',
          timestamp: Date.now()
        }
      }
    },
    "/health": {
      "get": {
        "status": 200,
        "body": { status: 'ok' }
      }
    },
    "/slow": {
      "get": {
        "status": 200,
        "body": { message: 'slow response' },
        "delay": 1000
      }
    },
    "/file": {
      "get": {
        "status": 200,
        "body": { "_file": "test/fixtures/sample.json" }
      }
    }
  }
};

// Simple test that works
try {
  console.log('Testing buildRoutes...');
  const routes = buildRoutes(testDefinition);
  assert.strictEqual(routes.length, 6);
  console.log('✓ buildRoutes test passed');
  
  console.log('Testing resolveBody...');
  const result = resolveBody(testDefinition.routes['/users'].get.body, {}, {});
  assert.deepStrictEqual(result, [{ id: 1, name: 'Ada' }, { id: 2, name: 'Alan' }]);
  console.log('✓ resolveBody test passed');
  
  console.log('Testing createServer...');
  const server = createServer(testDefinition);
  assert.ok(server instanceof require('http').Server);
  console.log('✓ createServer test passed');
  
  // Close server
  server.close();
  console.log('✓ Server closed successfully');
  
  console.log('\n🎉 All basic tests passed!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
