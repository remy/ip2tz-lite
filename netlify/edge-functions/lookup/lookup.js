import { urlParse } from 'https://deno.land/x/url_parse/mod.ts';
import * as queryString from 'https://deno.land/x/querystring@v1.0.2/mod.js';

const tz = getTz();

const source = await Deno.readFile('./result-compressed.bin');
const view = new DataView(source.buffer);

export default async (request) => {
  console.log(request.headers);
  const query = queryString.parse(urlParse(request.url).search || '');

  let ip = false;

  try {
    ip = resolveIP(getIP({ headers: request.headers, query }));
  } catch (e) {
    // silent catch
  }

  if (!ip) {
    return new Response(JSON.stringify({ status: 401 }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let last = null;

  for (let i = 0; i < source.byteLength; i += 5) {
    const record = view.getUint32(i, true);
    const value = view.getUint8(i + 4, true);

    if (record > ip) {
      break;
    }

    last = value;
  }

  return new Response(
    JSON.stringify({
      tz: tz.get(last),
      status: 200,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );
};

function resolveIP(ip) {
  const [a, b, c, d] = ip
    .trim()
    .split('.')
    .map((_) => parseInt(_, 10))
    .filter((_) => 0 < _ && _ < 255);

  if (d === undefined) {
    return false;
  }

  return 16777216 * a + 65536 * b + 256 * c + d;
}

function getIP(req) {
  let ip =
    req.query.ip ||
    req.ip ||
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.headers?.get('x-forwarded-for');

  if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '::ffff:127.0.0.1') {
    ip = '0.0.0.0';
  }
  console.log(ip);

  if (ip === '0.0.0.0' || Deno.env.TEST) {
    ip = '86.13.179.215';
  }
  console.log(ip);

  if (ip.includes(',')) {
    [ip] = ip.split(',');
  }

  return ip;
}

function getTz() {
  return new Map(
    Array.from(
      [
        '-',
        '+00:00',
        '+01:00',
        '+02:00',
        '+03:00',
        '+04:00',
        '+04:30',
        '+05:00',
        '+05:30',
        '+05:45',
        '+06:00',
        '+06:30',
        '+07:00',
        '+08:00',
        '+09:00',
        '+09:30',
        '+10:00',
        '+11:00',
        '+12:00',
        '+13:00',
        '+14:00',
        '-01:00',
        '-02:00',
        '-02:30',
        '-03:00',
        '-04:00',
        '-05:00',
        '-06:00',
        '-07:00',
        '-08:00',
        '-09:00',
        '-09:30',
        '-10:00',
        '-11:00',
      ],
      (_, i) => [i, _]
    )
  );
}
