// Lightspeed CH (iKentoo) does not expose webhooks at MVP.
// This route exists as a forward-compatibility placeholder.
// If Lightspeed adds webhook support, implement HMAC verification here
// following the same pattern as Gastrofix / Eversports.

export async function POST(): Promise<Response> {
  return new Response("not implemented", { status: 501 });
}
