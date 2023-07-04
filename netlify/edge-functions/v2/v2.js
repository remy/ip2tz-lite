import { Temporal } from 'https://esm.sh/@js-temporal/polyfill';

export default async function handler(request, context) {
  const zone = Temporal.Now.instant().toZonedDateTimeISO(context.geo.timezone);

  const res = {
    ...context.geo,
    offset: zone.offset,
    ip: context.ip,
  };

  return new Response(JSON.stringify(res), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
