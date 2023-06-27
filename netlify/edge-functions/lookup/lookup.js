import * as sqlite from 'https://deno.land/x/sqlite/mod.ts';
import { posix, win32 } from 'https://deno.land/std@0.192.0/path/mod.ts';
import { urlParse } from 'https://deno.land/x/url_parse/mod.ts';
import * as queryString from 'https://deno.land/x/querystring@v1.0.2/mod.js';

const filename = posix.fromFileUrl(import.meta.resolve('./ip2tz.db'));
const db = new sqlite.DB(filename, { mode: 'read' });

export default async (request) => {
  const query = queryString.parse(urlParse(request.url).search || '');

  let ip = false;

  try {
    ip = resolveIP(getIP({ ...request, query }));
  } catch (e) {
    // silent catch
  }

  if (!ip) {
    return new Response(JSON.stringify({ status: 401 }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const [[countryCode, country, region, city, lat, lng, zip, tz]] =
    await db.query(
      `SELECT country_code, country_name, region_name,city_name, latitude, longitude, zip_code, time_zone FROM IpGeo where ip_to >= ${ip} and ip_from <= ${ip}`
    );

  return new Response(
    JSON.stringify({
      countryCode,
      country,
      region,
      city,
      lat,
      lng,
      zip,
      tz,
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
    req.connection?.remoteAddress;

  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '0.0.0.0';
  }

  if (ip === '0.0.0.0' || Deno.env.TEST) {
    ip = '86.13.179.215';
  }

  if (ip.includes(',')) {
    [ip] = ip.split(',');
  }

  return ip;
}
