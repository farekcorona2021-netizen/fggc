import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

export const ID_PREFIX = "faselhd:";
const BASE_URL = process.env.FASELHD_BASE_URL || "https://faselhdx.bid";

export function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.end(JSON.stringify(body));
}

export function encodeId(value) {
  return ID_PREFIX + Buffer.from(value, "utf8").toString("base64url");
}

export function decodeId(value) {
  if (!value?.startsWith(ID_PREFIX)) return null;
  return Buffer.from(value.slice(ID_PREFIX.length), "base64url").toString("utf8");
}

export function extraArgs(req) {
  const url = new URL(req.url, "https://addon.invalid");
  return Object.fromEntries(url.searchParams.entries());
}

function text(value) {
  return value.replace(/\s+/g, " ").trim();
}

export async function scrapeCatalog(search = "") {
  const target = search ? `${BASE_URL}/?s=${encodeURIComponent(search)}` : BASE_URL;
  const executablePath = await chromium.executablePath();
  const browser = await playwright.launch({ args: chromium.args, executablePath, headless: true });
  try {
    const page = await browser.newPage({ userAgent: chromium.defaultUserAgent });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    const items = await page.evaluate(() => {
      const results = [];
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = anchor.href;
        const name = (anchor.querySelector("img")?.alt || anchor.textContent || "").replace(/\s+/g, " ").trim();
        const poster = anchor.querySelector("img")?.src || undefined;
        if (!name || !href || !/^https?:/i.test(href) || results.some(item => item.url === href)) continue;
        results.push({ type: "movie", name, poster, url: href });
      }
      return results.slice(0, 100);
    });
    return items.map(item => ({ ...item, id: encodeId(item.url) }));
  } finally { await browser.close(); }
}

export function toMeta(item) {
  return { id: item.id, type: item.type, name: item.name, poster: item.poster, videos: [{ id: item.id, title: item.name, season: 1, number: 1 }].filter(Boolean) };
}
