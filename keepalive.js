const https = require('https');

const target = process.env.KEEPALIVE_URL || 'https://my-cv-nbou.onrender.com/';

function ping() {
  https.get(target, (res) => {
    console.log(`Keepalive OK -> ${target} (${res.statusCode})`);
    res.resume();
  }).on('error', (err) => {
    console.error(`Keepalive FAIL -> ${target} (${err.message})`);
  });
}

ping();
setInterval(ping, 14 * 60 * 1000);
