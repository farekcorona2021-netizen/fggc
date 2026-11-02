import { decodeId, json } from "../lib/stremio.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const id = new URL(req.url, "https://addon.invalid").pathname.split("/").filter(Boolean).at(-1)?.replace(/\.json$/, "");
  const episodeUrl = decodeId(id);
  if (!episodeUrl) return json(res, 200, { streams: [] });
  const publicOrigin = (process.env.PUBLIC_BASE_URL || "https://fggc-h7fd-farekcorona2021-netizens-projects.vercel.app").replace(/\/$/, "");
  const resolverHeaders = { "content-type": "application/json" };
  if (process.env.RESOLVER_TOKEN) {
    resolverHeaders.authorization = `Bearer ${process.env.RESOLVER_TOKEN}`;
  }

  const response = await fetch(`${publicOrigin}/api/resolve`, {
    method: "POST",
    headers: resolverHeaders,
    body: JSON.stringify({ url: episodeUrl })
  });
  const result = await response.json();
  if (response.status === 401) {
    return json(res, 502, {
      streams: [],
      error: "Resolver authentication failed"
    });
  }
  if (!response.ok || !result.source) return json(res, 200, { streams: [] });
  const candidates = Array.isArray(result.candidates) && result.candidates.length
    ? result.candidates
    : [{ url: result.source, isMaster: true }];
  return json(res, 200, {
    streams: candidates.map((candidate, index) => ({
      name: "FASELHD",
      title: candidate.isMaster ? "Master stream" : `Stream ${index + 1}`,
      url: candidate.url,
      behaviorHints: {
        notWebReady: true,
        proxyHeaders: { request: result.headers || {} }
      }
    }))
  });
}
