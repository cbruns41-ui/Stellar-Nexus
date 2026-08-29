const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/alliances/1/activity',
  method: 'GET',
  headers: {
    'Cookie': 'session=test'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
});
req.on('error', (e) => console.error('Error:', e.message));
req.end();
