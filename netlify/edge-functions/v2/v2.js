import { Temporal } from 'npm:@js-temporal/polyfill';

export default async function handler(request, context) {
  const instant = Temporal.Now.instant();
  const zone = instant.toZonedDateTimeISO(context.geo.timezone);

  const res = {
    ...context.geo,
    offset: zone.offset,
    ip: context.ip,
  };

  return new Response(JSON.stringify(res), {
    headers: { 'content-type': 'application/json' },
  });
}
