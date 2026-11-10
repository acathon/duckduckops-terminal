// @ts-check
'use strict';
// Connects to a host through a SOCKS5 or HTTP proxy and passes the connection
// through stdin/stdout, for OpenSSH's ProxyCommand (Windows' OpenSSH has no `nc`).
// Run with DuckDuckOps' own runtime (ELECTRON_RUN_AS_NODE=1):
//
//   DuckDuckOps.exe proxy.js socks5|http <proxy host> <proxy port> <host> <port>
const net = require('net');

const [type, proxyHost, proxyPort, host, port] = process.argv.slice(2);
if (!['socks5', 'http'].includes(type) || !proxyHost || !proxyPort || !host || !port) {
	process.stderr.write('usage: proxy.js socks5|http <proxy host> <proxy port> <host> <port>\n');
	process.exit(2);
}

/** @param {string} message */
function fail(message) {
	process.stderr.write(`DuckDuckOps proxy ${proxyHost}:${proxyPort}: ${message}\n`);
	process.exit(1);
}

/** Reads from the socket until `done` returns the number of bytes that belong to the handshake */
function readUntil(/** @type {net.Socket} */ socket, /** @type {(data: Buffer) => number} */ done) {
	return new Promise((resolve, reject) => {
		let data = Buffer.alloc(0);
		const onData = (/** @type {Buffer} */ chunk) => {
			data = Buffer.concat([data, chunk]);
			const length = done(data);
			if (length > 0) {
				socket.off('data', onData);
				socket.off('error', reject);
				resolve({ reply: data.subarray(0, length), rest: data.subarray(length) });
			}
		};
		socket.on('data', onData);
		socket.once('error', reject);
	});
}

async function socks5(/** @type {net.Socket} */ socket) {
	// Greeting: version 5, one method, no authentication
	socket.write(Buffer.from([5, 1, 0]));
	const { reply: method } = await readUntil(socket, data => data.length >= 2 ? 2 : 0);
	if (method[0] !== 5 || method[1] !== 0) {
		fail('the proxy requires authentication, which is not supported');
	}
	const name = Buffer.from(host);
	socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([Number(port) >> 8, Number(port) & 0xff])]));
	const { reply, rest } = await readUntil(socket, data => {
		if (data.length < 5) { return 0; }
		const address = data[3] === 1 ? 4 : data[3] === 4 ? 16 : data[3] === 3 ? 1 + data[4] : -1;
		return address < 0 ? data.length : data.length >= 4 + address + 2 ? 4 + address + 2 : 0;
	});
	if (reply[1] !== 0) {
		fail(`the proxy refused the connection to ${host}:${port} (SOCKS5 reply ${reply[1]})`);
	}
	return rest;
}

async function http(/** @type {net.Socket} */ socket) {
	socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
	const { reply, rest } = await readUntil(socket, data => {
		const end = data.indexOf('\r\n\r\n');
		return end < 0 ? 0 : end + 4;
	});
	const status = reply.toString('latin1').split('\r\n')[0];
	if (!/^HTTP\/1\.[01] 200\b/.test(status)) {
		fail(`the proxy refused the connection to ${host}:${port} (${status})`);
	}
	return rest;
}

const socket = net.connect(Number(proxyPort), proxyHost);
socket.once('error', error => fail(error.message));
socket.once('connect', async () => {
	try {
		const rest = await (type === 'socks5' ? socks5(socket) : http(socket));
		if (rest.length) { process.stdout.write(rest); }
		socket.pipe(process.stdout);
		process.stdin.pipe(socket);
		// Either side closing ends the connection
		socket.on('close', () => process.exit(0));
		process.stdout.on('error', () => process.exit(0));
		process.stdin.on('end', () => socket.end());
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
});
