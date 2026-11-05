// No-op receiver for sunoapi.org callbacks. The app polls for status, so we just acknowledge.
export default async () => new Response(JSON.stringify({ code: 200, msg: "received" }), {
  headers: { "Content-Type": "application/json" },
});
