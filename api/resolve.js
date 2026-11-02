import { resolveFaselhd } from "../lib/faselhd.js";
import { isAllowedFaselhdUrl } from "../lib/stremio.js";

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      service: "FASELHD Resolver",
      usage: "POST { url: 'episode-url' }"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  const token = process.env.RESOLVER_TOKEN;

  if (token) {
    const auth = req.headers.authorization || "";

    if (auth !== `Bearer ${token}`) {
      return send(res, 401, {
        ok: false,
        error: "Unauthorized"
      });
    }
  }

  const url = req.body?.url;

  if (!url || typeof url !== "string") {
    return send(res, 400, {
      ok: false,
      error: "Missing episode URL"
    });
  }

  if (!isAllowedFaselhdUrl(url)) {
    return send(res, 400, {
      ok: false,
      error: "URL must belong to the configured FASELHD domain"
    });
  }

  try {
    const result = await resolveFaselhd(url);

    if (!result) {
      return send(res, 404, {
        ok: false,
        error: "M3U8 not found"
      });
    }

    return send(res, 200, {
      ok: true,
      ...result
    });

  } catch (error) {
    console.error(error);

    return send(res, 500, {
      ok: false,
      error: error.message || "Resolver failed"
    });
  }
}
