const http = require('http');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    if (options.body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function login() {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Admin', password: 'Wurm4444' })
  });
  console.log('Login status:', res.status);
  console.log('Login headers:', JSON.stringify(res.headers, null, 2));
  const headers = res.headers || {};
  const cookies = headers['set-cookie'] || headers['Set-Cookie'] || [];
  console.log('Cookies:', cookies);
  const sessionCookie = cookies.find(c => typeof c === 'string' && c.startsWith('session='));
  const cookieHeader = sessionCookie ? sessionCookie.split(';')[0] : '';
  return cookieHeader;
}

async function test(cookie) {
  const res = await request('/api/alliances/1/activity', {
    headers: { Cookie: cookie }
  });
  console.log('Activity status:', res.status);
  console.log('Activity data:', JSON.stringify(res.data, null, 2));
}

(async () => {
  try {
    const cookie = await login();
    console.log('Session cookie:', cookie);
    await test(cookie);
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
