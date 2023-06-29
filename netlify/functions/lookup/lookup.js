const fs = require('fs');

const tz = getTz();

// const source = await Deno.readFile('./data.bin');
// const view = new DataView(source.buffer);

// const filename = posix.fromFileUrl(import.meta.resolve('./data.bin'));
const filename = __dirname + '/data.bin';
const stat = fs.statSync(filename);

module.exports = { handler };

async function handler(request) {
  // const query = queryString.parse(urlParse(request.url).search || '');

  let ip = false;

  try {
    ip = resolveIP(
      getIP({ headers: request.headers, query: request.queryStringParameters })
    );
  } catch (e) {
    // silent catch
    return {
      body: JSON.stringify({ status: 401, stack: e.stack, message: e.message }),
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
    };
  }

  if (!ip) {
    return {
      body: JSON.stringify({ status: 401, message: 'no error, no IP found' }),
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
    };
  }

  const fd = await fs.promises.open(filename, 'r', 0o444);

  const tzIndex = await findTZForIPBtree(ip, fd);

  await fd.close();

  return {
    body: JSON.stringify(tz.get(tzIndex)),
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
  };
}

function findTZForIPBtree(ip, fd) {
  const len = stat.size;
  const blockSize = 5;

  const records = len / 5;
  const position = (records / 2) | 0;

  const buffer = new DataView(new ArrayBuffer(5));
  return getAt({
    fd,
    position,
    ip,
    buffer,
    records,
    inc: (records / 4) | 0,
  });
}

/**
 * @param {import('fs/promises').FileHandle} fd
 * @param {number} position
 * @param {number} records
 * @param {number} inc
 * @param {number} ip
 * @param {DataView} buffer
 * @returns UInt8Array
 */
async function getAt({ fd, position, ip, buffer, records, inc, lastPosition }) {
  const res = await fd.read({
    buffer,
    position: position * 5,
  });

  const record = buffer.getUint32(0, true);
  const value = buffer.getUint8(4);

  if (ip === record) {
    return value;
  }

  let newPos = null;
  if (ip >= record) {
    newPos = position + inc;
  } else {
    newPos = position - inc;
  }
  inc = Math.round(inc / 2);

  // out of bounds
  if (newPos === 0) {
    return 0;
  }

  // out of bounds
  if (newPos >= records) {
    return value;
  }

  // increment has reduced, get last record
  if (inc === 0) {
    return -1;
  }

  // this is likely to be the HIT
  if (newPos === lastPosition) {
    return -1;
  }

  const next = await getAt({
    fd,
    position: newPos,
    ip,
    buffer,
    records,
    inc,
    lastPosition: position,
  });

  // returning the previous result
  if (next === -1) {
    return value;
  }

  return next;
}

async function findTZForIP(ip) {
  let last = null;

  for (let i = 0; i < source.byteLength; i += 5) {
    const record = view.getUint32(i, true);
    const value = view.getUint8(i + 4, true);

    if (record > ip) {
      break;
    }

    last = value;
  }
}

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

  if (ip === '0.0.0.0') {
    ip = '86.13.179.215';
  }

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
