export default async (request, context) => {
  return new Response(JSON.parse({ ...context.geo, ip: context.ip }), {
    headers: { 'content-type': 'application/json' },
  });
};
