const duckdb = require('@duckdb/duckdb-wasm');
const path = require('path');
const Worker = require('web-worker');

const DUCKDB_DIST = path.dirname(require.resolve('@duckdb/duckdb-wasm'));

let con = null;

async function getConnection() {
  if (con !== null) {
    return con;
  }
  const DUCKDB_CONFIG = await duckdb.selectBundle({
    mvp: {
      mainModule: path.resolve(DUCKDB_DIST, './duckdb-mvp.wasm'),
      mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-mvp.worker.cjs'),
    },
    eh: {
      mainModule: path.resolve(DUCKDB_DIST, './duckdb-eh.wasm'),
      mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-eh.worker.cjs'),
    },
  });

  const logger = new duckdb.ConsoleLogger();
  const worker = new Worker(DUCKDB_CONFIG.mainWorker);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(DUCKDB_CONFIG.mainModule, DUCKDB_CONFIG.pthreadWorker);

  con = await db.connect();

  return con;
}

async function handler(event) {
  try {
    let ip = false;

    console.log(
      JSON.stringify({
        headers: event.headers,
        query: event.queryStringParameters,
      })
    );

    try {
      ip = resolveIP(getIP({ ...event, query: event.queryStringParameters }));
    } catch (e) {
      // silent catch
    }

    if (!ip) {
      return {
        body: JSON.stringify({ status: 401 }),
        statusCode: 401,
        headers: { 'content-type': 'application/json' },
      };
    }

    const con = await getConnection();

    const stmt = await con.prepare(
      `SELECT country_code, country_name, region,city, lat, lng, zip, tz FROM read_parquet('${__dirname}/ip2tz.file') where ip_to >= ?::INT8 and ip_from <= ?::INT8`
    );

    const res = (await stmt.query(ip, ip)).toArray();

    // const res = await new Promise((resolve, reject) => {
    //   con.all(
    //     `SELECT country_code, country_name, region,city, lat, lng, zip, tz FROM read_parquet('${__dirname}/ip2tz.file') where ip_to >= ?::INT8 and ip_from <= ?::INT8`,
    //     ip,
    //     ip,
    //     (error, result) => {
    //       console.log({ error, result });
    //       if (error) return reject(error);
    //       resolve(result);
    //     }
    //   );
    // });

    // await con.close();
    // await db.terminate();
    // await worker.terminate();

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
    return {
      statusCode: 500,
      body: error.stack,
      headers: { 'content-type': 'plain/text' },
    };
  }
}

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

  if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '127.0.0.1') {
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
