import { extraArgs, json, scrapeCatalog, toMeta } from "../lib/stremio.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  try {
    const args = extraArgs(req);
    const items = await scrapeCatalog(args.search || "");
    return json(res, 200, { metas: items.map(toMeta) });
  } catch (error) {
    return json(res, 502, { metas: [], error: error.message || "Catalog unavailable" });
  }
}
