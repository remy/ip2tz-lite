const fs = require('fs');
const { Address6 } = require('ip-address');
const tz = getTz();

// const source = await Deno.readFile('./data.bin');
// const view = new DataView(source.buffer);

// const filename = posix.fromFileUrl(import.meta.resolve('./data.bin'));

module.exports = { handler };

async function handler(request) {
  // const query = queryString.parse(urlParse(request.url).search || '');

  let sourceIP;

  try {
    sourceIP = getIP({
      headers: request.headers,
      query: request.queryStringParameters,
    });
  } catch (e) {
    // silent catch
    return {
      body: JSON.stringify({ status: 401, stack: e.stack, message: e.message }),
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
    };
  }

  let ip = false;

  ip = resolveIP(sourceIP);

  if (!ip && sourceIP) {
    // probably got ipv6 - let's try to extract
    const v6 = new Address6(sourceIP);
    if (Address6.isValid(sourceIP)) {
      ip = BigInt(new Address6(sourceIP).bigInteger().toString());
    }
  }

  if (!ip) {
    return {
      body: JSON.stringify({
        status: 401,
        message: 'could not parse IP / possibly IPv6 not supported (yet)',
        sourceIP,
      }),
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
    };
  }

  let tzIndex;
  try {
    tzIndex = await findTZForIPBtree(ip);
  } catch (e) {
    return {
      body: JSON.stringify({
        status: 500,
        message: e.message,
        stack: e.stack,
        sourceIP,
      }),
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
    };
  }

  return {
    body: JSON.stringify({ tz: tz.get(tzIndex), ip: sourceIP }),
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
  };
}

async function findTZForIPBtree(ip) {
  let filename;

  let blockSize = 5;
  if (typeof ip === 'bigint') {
    // let's just support lower or upper for the moment
    blockSize = 8 + 1; // 64bit + 1 byte

    const lower = ip & 0xffffffffffffffffn;
    const upper = ip >> 64n;

    if (lower !== 0n && upper !== 0n) {
      filename = __dirname + '/ipv6-full.bin';
      blockSize += 8;
      // throw new Error('This current IPv6 address is not supported yet.');
    } else if (lower === 0) {
      filename = __dirname + '/ipv6-upper.bin';
    } else if (upper === 0) {
      filename = __dirname + '/ipv6-lower.bin';
    }
  } else {
    filename = __dirname + '/ipv4.bin';
  }

  const size = (await fs.promises.stat(filename)).size;

  const fd = await fs.promises.open(filename, 'r', 0o444);

  const records = size / blockSize;
  const position = (records / 2) | 0;

  const buffer = new DataView(new ArrayBuffer(blockSize));
  let result;

  try {
    result = await getAt({
      fd,
      position,
      ip,
      buffer,
      records,
      inc: (records / 4) | 0,
      blockSize,
    });
  } catch (e) {
    await fd.close();
    throw e;
  }

  await fd.close();

  return result;
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
async function getAt({
  fd,
  position,
  ip,
  buffer,
  records,
  inc,
  lastPosition,
  blockSize,
}) {
  const res = await fd.read({
    buffer,
    position: position * blockSize,
  });

  let is128bit = false;

  let method = 'getUint32';
  if (blockSize > 8) {
    method = 'getBigUint64';
    if (blockSize === 17) {
      /// 128bit
      is128bit = true;
    }
  }

  let record = buffer[method](0, true);

  if (is128bit) {
    let lower = BigInt(buffer[method](8, true));
    record = BigInt(record);
    record = (record << 64n) + lower;
  }

  const value = buffer.getUint8(blockSize - 1);

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
    blockSize,
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

const toHex = (n, size = 8) => {
  if (n < 0) {
    n = parseInt(toBinary(n, size), 2);
  }
  return n
    .toString(16)
    .padStart(size / (8 / 2), 0)
    .toUpperCase();
};

const toBinary = (n, size = 8) => {
  if (n < 0) {
    return Array.from({ length: size }, (_, i) => {
      return ((n >> i) & 1) === 1 ? 1 : 0;
    })
      .reverse()
      .join('');
  }
  return n.toString(2).padStart(size, 0);
};
