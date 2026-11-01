import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

const DEFAULT_ALLOWED_HOSTS = [
  "faselhdx.bid"
];

function isAllowedHost(hostname) {
  const allowed = (
    process.env.FASELHD_ALLOWED_HOSTS ||
    DEFAULT_ALLOWED_HOSTS.join(",")
  )
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

  const host = hostname.toLowerCase();

  return allowed.some(domain =>
    host === domain || host.endsWith(`.${domain}`)
  );
}

function validateUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Invalid protocol");
  }

  if (!isAllowedHost(url.hostname)) {
    throw new Error("Domain is not allowed");
  }

  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }

  return url;
}

function isM3U8(url) {
  return /\.m3u8(?:$|[?#])/i.test(url);
}

function isMaster(url) {
  return /master|index\.m3u8/i.test(url);
}

export async function resolveFaselhd(rawUrl) {
  const target = validateUrl(rawUrl);

  const executablePath = await chromium.executablePath();

  const browser = await playwright.launch({
    args: chromium.args,
    executablePath,
    headless: true
  });

  try {
    const context = await browser.newContext({
      userAgent: chromium.defaultUserAgent,
      viewport: {
        width: 1365,
        height: 768
      },
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    const found = new Map();

    function capture(url, headers = {}) {
      if (!url || typeof url !== "string") return;
      if (!isM3U8(url)) return;
      if (!/^https?:\/\//i.test(url)) return;

      const cleanHeaders = {};

      for (const key of [
        "referer",
        "user-agent",
        "origin",
        "cookie"
      ]) {
        const value = headers[key];

        if (value) {
          cleanHeaders[key] = value;
        }
      }

      found.set(url, {
        url,
        headers: cleanHeaders,
        master: isMaster(url),
        timestamp: Date.now()
      });
    }

    // مراقبة طلبات الشبكة
    page.on("request", request => {
      capture(
        request.url(),
        request.headers()
      );
    });

    page.on("response", response => {
      capture(
        response.url(),
        response.request().headers()
      );
    });

    // مراقبة fetch و XMLHttpRequest
    await page.exposeFunction(
      "__captureM3U8",
      url => capture(url)
    );

    await page.addInitScript(() => {
      function emit(url) {
        if (
          typeof url === "string" &&
          /\.m3u8(?:$|[?#])/i.test(url)
        ) {
          window.__captureM3U8?.(url);
        }
      }

      const originalFetch = window.fetch;

      window.fetch = function (...args) {
        try {
          const input = args[0];

          emit(
            typeof input === "string"
              ? input
              : input?.url
          );
        } catch {}

        return originalFetch.apply(this, args);
      };

      const originalOpen = XMLHttpRequest.prototype.open;

      XMLHttpRequest.prototype.open = function (
        method,
        url,
        ...rest
      ) {
        emit(String(url));

        return originalOpen.call(
          this,
          method,
          url,
          ...rest
        );
      };
    });

    // فتح صفحة الحلقة
    await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(3500);

    // محاولة تشغيل المشغل
    await page.evaluate(() => {
      try {
        if (window.jwplayer) {
          try {
            window.jwplayer().play(true);
          } catch {}
        }
      } catch {}

      const selectors = [
        ".jw-icon-playback",
        ".jw-display-icon-container",
        ".vjs-big-play-button",
        ".plyr__control--overlaid",
        ".play-button",
        "button[aria-label*='play' i]"
      ];

      for (const selector of selectors) {
        document
          .querySelectorAll(selector)
          .forEach(element => {
            try {
              element.click();
            } catch {}
          });
      }

      const video = document.querySelector("video");

      if (video) {
        try {
          video.play();
        } catch {}
      }
    });

    // انتظار ظهور رابط البث
    const deadline = Date.now() + 40000;

    while (
      Date.now() < deadline &&
      found.size === 0
    ) {
      await page.waitForTimeout(1000);
    }

    // استخراج روابط محتملة من عناصر الصفحة
    if (found.size === 0) {
      const candidates = await page.evaluate(() => {
        const results = [];

        for (const element of document.querySelectorAll(
          "video, source"
        )) {
          const src =
            element.src ||
            element.getAttribute("src");

          if (src) results.push(src);
        }

        for (const script of document.scripts) {
          const matches =
            script.textContent.match(
              /https?:[^"'\\s<>]+\.m3u8(?:\?[^"'\\s<>]*)?/gi
            ) || [];

          results.push(...matches);
        }

        return results;
      });

      candidates.forEach(url => capture(url));
    }

    const results = [...found.values()].sort(
      (a, b) =>
        Number(b.master) - Number(a.master) ||
        b.timestamp - a.timestamp
    );

    if (!results.length) {
      return null;
    }

    const chosen = results[0];

    // إضافة الكوكيز عند الحاجة
    const cookies = await context.cookies();

    if (!chosen.headers.cookie && cookies.length) {
      chosen.headers.cookie = cookies
        .map(cookie =>
          `${cookie.name}=${cookie.value}`
        )
        .join("; ");
    }

    if (!chosen.headers.referer) {
      chosen.headers.referer = page.url();
    }

    if (!chosen.headers["user-agent"]) {
      chosen.headers["user-agent"] =
        chromium.defaultUserAgent;
    }

    return {
      source: chosen.url,
      headers: chosen.headers,

      candidates: results.map(item => ({
        url: item.url,
        isMaster: item.master
      })),

      pageUrl: page.url()
    };

  } finally {
    await browser.close();
  }
}
