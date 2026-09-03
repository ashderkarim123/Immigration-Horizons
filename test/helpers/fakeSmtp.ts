import net from "node:net";

/**
 * A minimal, dependency-free SMTP server for tests.
 *
 * The point is to exercise the real nodemailer path — connection, EHLO,
 * envelope, DATA, termination — rather than stubbing `sendMail` and proving
 * only that our own wrapper calls itself. A transport that has never spoken
 * SMTP to anything is exactly the gap deployment blocker 4 describes.
 *
 * It implements just enough of RFC 5321 for nodemailer to complete a
 * session, and captures what it received so a test can assert on the
 * envelope and the message body.
 */

export type CapturedMessage = {
  from: string;
  recipients: string[];
  data: string;
};

export type FakeSmtpServer = {
  port: number;
  messages: CapturedMessage[];
  close: () => Promise<void>;
};

export async function startFakeSmtp(
  options: { failOn?: "auth" | "data" | null } = {},
): Promise<FakeSmtpServer> {
  const messages: CapturedMessage[] = [];
  // net.Server.close() only stops NEW connections; it waits for open ones.
  // nodemailer pools its connection, so without tracking and destroying
  // these the close() below never resolves and every SMTP test that
  // succeeds hangs until the socket timeout.
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = "";
    let inData = false;
    let current: CapturedMessage = { from: "", recipients: [], data: "" };

    const write = (text: string) => socket.write(`${text}\r\n`);
    write("220 fake-smtp ready");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      while (true) {
        const index = buffer.indexOf("\r\n");
        if (index === -1) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(current);
            current = { from: "", recipients: [], data: "" };
            write(options.failOn === "data" ? "554 message rejected" : "250 queued");
          } else {
            // Undo dot-stuffing so the captured body matches what was sent.
            current.data += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          }
          continue;
        }

        const upper = line.toUpperCase();

        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          // No STARTTLS advertised: these tests run in the clear on
          // loopback, which is what keeps them dependency-free.
          write("250-fake-smtp");
          write("250-AUTH PLAIN LOGIN");
          write("250 SMTPUTF8");
        } else if (upper.startsWith("AUTH")) {
          write(options.failOn === "auth" ? "535 authentication failed" : "235 accepted");
        } else if (upper.startsWith("MAIL FROM")) {
          current.from = line.slice(line.indexOf(":") + 1).trim();
          write("250 ok");
        } else if (upper.startsWith("RCPT TO")) {
          current.recipients.push(line.slice(line.indexOf(":") + 1).trim());
          write("250 ok");
        } else if (upper.startsWith("DATA")) {
          inData = true;
          write("354 send it");
        } else if (upper.startsWith("QUIT")) {
          write("221 bye");
          socket.end();
        } else if (upper.startsWith("RSET") || upper.startsWith("NOOP")) {
          write("250 ok");
        } else {
          write("250 ok");
        }
      }
    });

    socket.on("error", () => {
      /* client hangs up mid-session on failure paths; not a test failure */
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as net.AddressInfo;

  return {
    port: address.port,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        sockets.clear();
        server.close(() => resolve());
      }),
  };
}
