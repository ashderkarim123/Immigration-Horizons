const net = require('node:net');

/**
 * A minimal, dependency-free SMTP server for tests. Mirror of
 * test/helpers/fakeSmtp.ts in the root app.
 *
 * The point is to exercise nodemailer's real session — connection, EHLO,
 * AUTH, envelope, DATA — rather than stubbing our own wrapper and proving
 * only that it calls itself. A transport that has never spoken SMTP to
 * anything is exactly the gap deployment blocker 4 describes.
 */
async function startFakeSmtp(options = {}) {
  const messages = [];
  // net.Server.close() only stops NEW connections; it waits for open ones.
  // nodemailer pools its connection, so without destroying these the
  // close() below never resolves and every passing SMTP test hangs.
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));

    let buffer = '';
    let inData = false;
    let current = { from: '', recipients: [], data: '' };

    const write = (text) => socket.write(`${text}\r\n`);
    write('220 fake-smtp ready');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      for (;;) {
        const index = buffer.indexOf('\r\n');
        if (index === -1) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current);
            current = { from: '', recipients: [], data: '' };
            write(options.failOn === 'data' ? '554 message rejected' : '250 queued');
          } else {
            current.data += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          }
          continue;
        }

        const upper = line.toUpperCase();

        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          write('250-fake-smtp');
          write('250-AUTH PLAIN LOGIN');
          write('250 SMTPUTF8');
        } else if (upper.startsWith('AUTH')) {
          write(options.failOn === 'auth' ? '535 authentication failed' : '235 accepted');
        } else if (upper.startsWith('MAIL FROM')) {
          current.from = line.slice(line.indexOf(':') + 1).trim();
          write('250 ok');
        } else if (upper.startsWith('RCPT TO')) {
          current.recipients.push(line.slice(line.indexOf(':') + 1).trim());
          write('250 ok');
        } else if (upper.startsWith('DATA')) {
          inData = true;
          write('354 send it');
        } else if (upper.startsWith('QUIT')) {
          write('221 bye');
          socket.end();
        } else {
          write('250 ok');
        }
      }
    });

    socket.on('error', () => {
      /* the client hangs up mid-session on failure paths; not a test failure */
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    port: server.address().port,
    messages,
    close: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        sockets.clear();
        server.close(() => resolve());
      }),
  };
}

module.exports = { startFakeSmtp };
