import { json, scrapeMeta } from "../lib/stremio.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const id = new URL(req.url, "https://addon.invalid").pathname.split("/").filter(Boolean).at(-1)?.replace(/\.json$/, "");
  if (!id) return json(res, 404, { meta: null });
  try {
    const meta = await scrapeMeta(id);
    return json(res, meta ? 200 : 404, { meta });
  } catch (error) {
    return json(res, 502, { meta: null, error: error.message || "Metadata unavailable" });
  }
}
