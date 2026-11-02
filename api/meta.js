import { decodeId, json } from "../lib/stremio.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const id = new URL(req.url, "https://addon.invalid").pathname.split("/").filter(Boolean).at(-1)?.replace(/\.json$/, "");
  const url = decodeId(id);
  if (!url) return json(res, 404, { meta: null });
  return json(res, 200, { meta: { id, type: "movie", name: "FASELHD title", videos: [{ id, title: "FASELHD", season: 1, number: 1, episodeUrl: url }] } });
}
