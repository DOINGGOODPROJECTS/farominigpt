const path = require('path');
const net = require('net');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
});
const { pool } = require('./lib/db.ts');

function checkTcpConnection(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = (error) => {
      socket.destroy();
      resolve({ ok: false, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', onError);
    socket.once('timeout', () => onError(new Error('Timeout')));
    socket.connect(port, host, () => {
      socket.end();
      resolve({ ok: true });
    });
  });
}

async function testConnection() {
  try {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
    console.log(`TCP check -> ${host}:${port}`);
    const tcp = await checkTcpConnection(host, port);
    if (!tcp.ok) {
      console.error('TCP connection failed:', tcp.error?.message || tcp.error);
    } else {
      console.log('TCP connection successful.');
    }

    const [rows] = await pool.query('SELECT 1 AS test');
    console.log('Connection successful:', rows);
    process.exit(0);
  } catch (error) {
    console.error('Connection failed:', error);
    process.exit(1);
  }
}

testConnection();
