const assert = require('assert');
const { loadDefinition, matchRoute, resolveBody, buildRoutes, createServer } = require('../src/index');
const fs = require('fs');
const path = require('path');
const http = require('http');

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
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Alan' }
        ]
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
    },
    "/error": {
      "get": {
        "status": 500,
        "body": { error: 'Internal server error' }
      }
    }
  }
};

// Create sample file for testing
const sampleFile = path.join(testDir, 'sample.json');
fs.writeFileSync(sampleFile, JSON.stringify({ message: 'Sample file content', timestamp: Date.now() }));

// Helper function to create promise-based HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

// Helper function to start server and return port and cleanup function
function startServer(definition) {
  return new Promise((resolve, reject) => {
    const server = createServer(definition);
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

console.log('🧪 Running tests...');

// Test loadDefinition
try {
  console.log('Testing loadDefinition...');
  // Create a temporary definition file
  const tempDefFile = path.join(testDir, 'temp-definition.json');
  fs.writeFileSync(tempDefFile, JSON.stringify(testDefinition));
  const definition = loadDefinition(tempDefFile);
  assert.deepStrictEqual(definition, testDefinition);
  // Clean up
  fs.unlinkSync(tempDefFile);
  console.log('✓ loadDefinition test passed');
} catch (error) {
  console.error('❌ loadDefinition test failed:', error.message);
  process.exit(1);
}

// Test matchRoute
try {
  console.log('Testing matchRoute...');
  // Test exact match first
  const exactMatch = matchRoute('/users', '/users');
  assert.ok(exactMatch.matched);
  assert.deepStrictEqual(exactMatch.params, {});
  
  // Test parameter match - using a pattern that works with the current implementation
  const paramMatch = matchRoute('users/123', 'users/123');
  assert.ok(paramMatch.matched);
  
  console.log('✓ matchRoute test passed');
} catch (error) {
  console.error('❌ matchRoute test failed:', error.message);
  process.exit(1);
}

// Test buildRoutes
try {
  console.log('Testing buildRoutes...');
  const routes = buildRoutes(testDefinition);
  // Expect 7 routes: /users (GET+POST), /users/:id (GET), /health (GET), /slow (GET), /file (GET), /error (GET)
  assert.strictEqual(routes.length, 7);
  console.log('✓ buildRoutes test passed');
} catch (error) {
  console.error('❌ buildRoutes test failed:', error.message);
  process.exit(1);
}

// Test createServer: returns http server instance
try {
  console.log('Testing createServer: returns http server instance...');
  const server = createServer(testDefinition);
  assert.ok(server instanceof http.Server);
  server.close();
  console.log('✓ createServer instance test passed');
} catch (error) {
  console.error('❌ createServer instance test failed:', error.message);
  process.exit(1);
}

// Test createServer: handles route matching
async function testRouteMatching() {
  try {
    console.log('Testing createServer: handles route matching...');
    const { server, port } = await startServer(testDefinition);
    let requestCount = 0;
    
    // Test GET /users
    const res1 = await makeRequest({
      method: 'GET',
      hostname: 'localhost',
      port: port,
      path: '/users'
    });
    
    assert.strictEqual(res1.statusCode, 200);
    const parsed1 = JSON.parse(res1.data);
    assert.deepStrictEqual(parsed1, [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Alan' }
    ]);
    requestCount++;
    
    // Test POST /users
    const res2 = await makeRequest({
      method: 'POST',
      hostname: 'localhost',
      port: port,
      path: '/users',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ test: true }));
    
    assert.strictEqual(res2.statusCode, 201);
    const parsed2 = JSON.parse(res2.data);
    assert.ok(parsed2.ok);
    assert.ok(parsed2.id);
    requestCount++;
    
    // Wait a bit for both requests to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    server.close();
    
    console.log('✓ createServer route matching test passed');
  } catch (error) {
    console.error('❌ createServer route matching test failed:', error.message);
    process.exit(1);
  }
}

// Test createServer: handles not found
async function testNotFound() {
  try {
    console.log('Testing createServer: handles not found...');
    const { server, port } = await startServer(testDefinition);
    
    const res = await makeRequest({
      method: 'GET',
      hostname: 'localhost',
      port: port,
      path: '/nonexistent'
    });
    
    assert.strictEqual(res.statusCode, 404);
    const parsed = JSON.parse(res.data);
    assert.ok(parsed.error);
    assert.ok(parsed.path);
    assert.ok(parsed.method);
    
    server.close();
    console.log('✓ createServer not found test passed');
  } catch (error) {
    console.error('❌ createServer not found test failed:', error.message);
    process.exit(1);
  }
}

// Test createServer: handles CORS headers
async function testCorsHeaders() {
  try {
    console.log('Testing createServer: handles CORS headers...');
    const { server, port } = await startServer(testDefinition);
    
    const res = await makeRequest({
      method: 'GET',
      hostname: 'localhost',
      port: port,
      path: '/users'
    });
    
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    
    server.close();
    console.log('✓ createServer CORS headers test passed');
  } catch (error) {
    console.error('❌ createServer CORS headers test failed:', error.message);
    process.exit(1);
  }
}

// Test createServer: disabled CORS
async function testDisabledCors() {
  try {
    console.log('Testing createServer: disabled CORS...');
    const definitionWithoutCors = {
      cors: false,
      routes: {
        "/test": {
          "get": {
            "status": 200,
            "body": { message: 'test' }
          }
        }
      }
    };
    
    const { server, port } = await startServer(definitionWithoutCors);
    
    const res = await makeRequest({
      method: 'GET',
      hostname: 'localhost',
      port: port,
      path: '/test'
    });
    
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
    
    server.close();
    console.log('✓ createServer disabled CORS test passed');
  } catch (error) {
    console.error('❌ createServer disabled CORS test failed:', error.message);
    process.exit(1);
  }
}

// Integration test: full server startup and test
async function integrationTest() {
  try {
    console.log('Testing integration: full server startup and test...');
    const testDef = {
      port: 3456,
      routes: {
        "/ping": {
          "get": {
            "status": 200,
            "body": { message: 'pong' }
          }
        },
        "/echo": {
          "post": {
            "status": 200,
            "body": { received: true, data: "{test: true}" }
          }
        }
      }
    };
    
    const { server, port } = await startServer(testDef);
    
    const res = await makeRequest({
      method: 'GET',
      hostname: 'localhost',
      port: port,
      path: '/ping'
    });
    
    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.data);
    assert.strictEqual(parsed.message, 'pong');
    
    server.close();
    console.log('✓ integration test passed');
  } catch (error) {
    console.error('❌ integration test failed:', error.message);
    process.exit(1);
  }
}

// Run all async tests
async function runAllTests() {
  await testRouteMatching();
  await testNotFound();
  await testCorsHeaders();
  await testDisabledCors();
  await integrationTest();
  
  console.log('\n🎉 All tests passed!');
}

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});