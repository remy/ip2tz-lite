const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');

// Docs on event and context https://docs.netlify.com/functions/build/#code-your-function-2
const handler = async (event) => {
  try {
    let ip = false;

    try {
      ip = resolveIP(getIP({ ...event, query: event.queryStringParameters }));
    } catch (e) {
      // silent catch
    }

    if (!ip) {
      return {
        body: JSON.stringify({ status: 401 }),
        status: 401,
        headers: { 'content-type': 'application/json' },
      };
    }

    const con = db.connect();
    const res = await new Promise((resolve, reject) => {
      con.all(
        `SELECT country_code, country_name, region,city, lat, lng, zip, tz FROM read_parquet('${__dirname}/ip2tz.file') where ip_to >= ?::INT8 and ip_from <= ?::INT8`,
        ip,
        ip,
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
    });

    const [countryCode, country, region, city, lat, lng, zip, tz] =
      Object.values(res[0]);

    return {
      body: JSON.stringify({
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
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};

module.exports = { handler };

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
