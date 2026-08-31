Deno.serve(() => new Response(JSON.stringify({ error: "PayPal has been retired. Olive Vintage Gallery uses Square." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
