import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

export const ID_PREFIX = "faselhd:";
const BASE_URL = process.env.FASELHD_BASE_URL || "https://web1120x.faselhdx.one/main";
const ALLOWED_HOSTS = new Set(["web1120x.faselhdx.one", "faselhdx.one"]);

export function isAllowedFaselhdUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (ALLOWED_HOSTS.has(url.hostname) || url.hostname.endsWith(".faselhdx.one"));
  } catch {
    return false;
  }
}

export function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  const target = search ? `${BASE_URL}?s=${encodeURIComponent(search)}` : BASE_URL;
  const executablePath = await chromium.executablePath();
  const browser = await playwright.launch({ args: chromium.args, executablePath, headless: true });
  try {
    const page = await browser.newPage({ userAgent: chromium.defaultUserAgent });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    const items = await page.evaluate(() => {
      const results = [];
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = anchor.href;
        const image = anchor.querySelector("img");
        const name = (image?.alt || anchor.textContent || "").replace(/\s+/g, " ").trim();
        const isContentLink = /movie|film|series|مسلسل|فيلم|انمي|anime|episode|الحلقة/i.test(`${href} ${name}`);
        if (!isContentLink || !name || !href || !/^https?:/i.test(href) || results.some(item => item.url === href)) continue;
        results.push({
          type: /series|مسلسل|انمي|anime/i.test(`${href} ${name}`) ? "series" : "movie",
          name,
          poster: image?.src,
          url: href
        });
      }
      return results.slice(0, 100);
    });
    return items.map(item => ({ ...item, id: encodeId(item.url) }));
  } finally {
    await browser.close();
  }
}

export async function scrapeMeta(id) {
  const target = decodeId(id);
  if (!target || !isAllowedFaselhdUrl(target)) return null;
  const executablePath = await chromium.executablePath();
  const browser = await playwright.launch({ args: chromium.args, executablePath, headless: true });
  try {
    const page = await browser.newPage({ userAgent: chromium.defaultUserAgent });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    const data = await page.evaluate(() => {
      const text = value => value?.replace(/\\s+/g, " ").trim() || undefined;
      const title = text(document.querySelector("h1, .title, .entry-title")?.textContent) || text(document.title);
      const poster = document.querySelector("meta[property='og:image'], .poster img, img")?.content || document.querySelector(".poster img, img")?.src;
      const description = text(document.querySelector("meta[name='description'], meta[property='og:description']")?.content) || text(document.querySelector(".description, .story, .plot")?.textContent);
      const links = [...document.querySelectorAll("a[href]")].map(anchor => ({
        id: anchor.href,
        title: text(anchor.textContent) || `Episode ${anchor.href}`
      })).filter(item => /episode|الحلقة|season|الموسم|watch|مشاهدة/i.test(`${item.id} ${item.title}`));
      return { title, poster, description, episodes: links.slice(0, 200) };
    });
    const type = /episode|الحلقة|season|الموسم|series|مسلسل/i.test(`${data.title} ${target}`) ? "series" : "movie";
    return {
      id,
      type,
      name: data.title || "FASELHD",
      poster: data.poster,
      description: data.description,
      videos: data.episodes.map((episode, index) => ({ id: encodeId(episode.id), title: episode.title, season: 1, number: index + 1 }))
    };
  } finally {
    await browser.close();
  }
}

export function toMeta(item) {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    poster: item.poster,
    description: item.description,
    releaseInfo: item.year,
    videos: item.videos
  };
}
