import https from 'node:https';
const allowed = new Set(['api.frankfurter.dev', 'api.maptiler.com', 'api.openai.com']);
// A bounded IPv4 HTTPS transport avoids dual-stack connection timeouts without changing host DNS.
export const providerFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    url.protocol !== 'https:' ||
    !allowed.has(url.hostname) ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password
  )
    throw new Error('Unsupported provider endpoint.');
  if (init.body != null && typeof init.body !== 'string')
    throw new Error('Provider requests require a string body.');
  const headers = new Headers(init.headers);
  headers.set('Accept-Encoding', 'identity');
  headers.set('User-Agent', 'Roamly/1.0');
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)])
    : AbortSignal.timeout(10000);
  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      url,
      { family: 4, method: init.method || 'GET', headers: Object.fromEntries(headers), signal },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1000000) {
            req.destroy(new Error('Provider response exceeded the size limit.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', () => reject(new Error('Provider connection failed.')));
        res.on('end', () => {
          const encoding = res.headers['content-encoding'];
          if (encoding && encoding !== 'identity') {
            reject(new Error('Unsupported provider response encoding.'));
            return;
          }
          const status = res.statusCode || 502;
          if (status < 200 || (status >= 300 && status < 400)) {
            reject(new Error('Provider redirects are not followed.'));
            return;
          }
          resolve(
            new Response([204, 205].includes(status) ? null : Buffer.concat(chunks), {
              status,
              headers: {
                'Content-Type': String(res.headers['content-type'] || 'application/json'),
              },
            }),
          );
        });
      },
    );
    req.on('error', () => reject(new Error('Provider connection failed.')));
    if (init.body) req.write(init.body);
    req.end();
  });
};
