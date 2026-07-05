const http = require('http');
const options = {
  hostname: '127.0.0.1',
  port: 5173,
  path: '/',
  method: 'GET',
  headers: {
    Host: '127.0.0.1'
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS', res.statusCode);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('BODY_LENGTH', body.length);
    console.log('BODY_START', body.slice(0, 200));
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('ERR', err.message);
  process.exit(1);
});

req.end();
