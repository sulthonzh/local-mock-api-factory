const { createServer, buildRoutes, resolveBody } = require('./src/index.js');

const testDefinition = {
  routes: {
    "/users": {
      "get": {
        "status": 200,
        "body": [{ id: 1, name: 'Ada' }, { id: 2, name: 'Alan' }]
      }
    },
    "/health": {
      "get": {
        "status": 200,
        "body": { status: 'ok' }
      }
    }
  }
};

// Basic functionality test
async function testBasic() {
  console.log('Testing basic functionality...');
  
  // Test buildRoutes
  const routes = buildRoutes(testDefinition);
  console.log(`✓ buildRoutes: ${routes.length} routes created`);
  
  // Test resolveBody
  const body = resolveBody(testDefinition.routes['/users'].get.body, {}, {});
  console.log('✓ resolveBody:', body);
  
  // Test createServer
  const server = createServer(testDefinition);
  console.log('✓ createServer: server instance created');
  
  // Test server functionality
  await new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      const http = require('http');
      
      const req = http.get(`http://localhost:${port}/users`, (res) => {
        console.log(`✓ Server response: ${res.statusCode}`);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('✓ Server response body:', JSON.parse(data));
          server.close(() => {
            console.log('✓ Server closed');
            resolve();
          });
        });
      });
      
      req.on('error', reject);
    });
  });
  
  console.log('\n🎉 All basic tests passed!');
}

testBasic().catch(console.error);
