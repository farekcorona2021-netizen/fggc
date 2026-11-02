import { decodeId, json } from "../lib/stremio.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const id = new URL(req.url, "https://addon.invalid").pathname.split("/").filter(Boolean).at(-1)?.replace(/\.json$/, "");
  const episodeUrl = decodeId(id);
  if (!episodeUrl) return json(res, 200, { streams: [] });
  const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  const response = await fetch(`${origin}/api/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: episodeUrl }) });
  const result = await response.json();
  if (!response.ok || !result.source) return json(res, 200, { streams: [] });
  return json(res, 200, { streams: [{ name: "FASELHD", title: "Direct stream", url: result.source, behaviorHints: { notWebReady: true, proxyHeaders: { request: result.headers || {} } } }] });
}
