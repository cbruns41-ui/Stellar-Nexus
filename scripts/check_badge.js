const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};
const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const cookies = [];
    res.headers['set-cookie']?.forEach(c => cookies.push(c.split(';')[0]));
    const cookie = cookies.join('; ');
    const stateReq = http.request({
      hostname: 'localhost', port: 3000, path: '/api/state', method: 'GET',
      headers: { Cookie: cookie }
    }, (res2) => {
      let d = '';
      res2.on('data', (chunk) => d += chunk);
      res2.on('end', () => {
        const state = JSON.parse(d);
        console.log('Hints alliance:', state.hints?.alliance);
        console.log('Alliance activity in snap:', state.snap?.allianceActivity);
        console.log('Has alliance badge element:', !!document?.querySelector?.('[data-badge="alliance"]'));
      });
    });
    stateReq.end();
  });
});
req.write(JSON.stringify({ username: 'Admin', password: 'Wurm4444' }));
req.end();
