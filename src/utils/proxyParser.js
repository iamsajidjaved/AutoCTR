function parse(proxyString) {
  const parts = proxyString.split(':');
  if (parts.length < 2) throw new Error(`Invalid proxy string: ${proxyString}`);
  const [host, portStr, username = '', password = ''] = parts;
  const port = parseInt(portStr, 10);
  const url = username
    ? `http://${username}:${password}@${host}:${port}`
    : `http://${host}:${port}`;
  return { host, port, username, password, url };
}

module.exports = { parse };
