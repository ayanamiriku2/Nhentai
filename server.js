const express = require("express");
const compression = require("compression");
const https = require("https");
const http = require("http");
const { createProxyMiddleware, responseInterceptor } = require("http-proxy-middleware");
const cheerio = require("cheerio");

// ============================================================
// CONFIGURATION
// ============================================================
const TARGET_HOST = process.env.TARGET_HOST || "nhentai.xxx";
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Your mirror domain — SET THIS via env var in production
// e.g. MIRROR_DOMAIN=yourdomain.com
const MIRROR_DOMAIN = process.env.MIRROR_DOMAIN || "";

// ============================================================
// AD / TRACKER DOMAINS TO BLOCK
// ============================================================
const BLOCKED_DOMAINS = [
  "tsvideo.sacdnssedge.com",
  "sacdnssedge.com",
  "waust.at",
  "exosrv.com",
  "exoclick.com",
  "tsyndicate.com",
  "trafficjunky.com",
  "juicyads.com",
  "popads.net",
  "popcash.net",
  "clickadu.com",
  "hilltopads.net",
  "a-ads.com",
  "ad.doubleclick.net",
  "adnxs.com",
  "realsrv.com",
  "tsyndicate.com",
  "syndication.realsrv.com",
  "mc.yandex.ru",
  "counter.yadro.ru",
  "ad-delivery.net",
  "syndication.exoclick.com",
  "static.tsyndicate.com",
  "ads.exoclick.com",
  "go.hentaigold.net",
  "hentaigold.net",
  "static-proxy.strpst.com",
  "strpst.com",
];

// Script/element patterns to remove from HTML
const AD_SCRIPT_PATTERNS = [
  /cdn-cgi\/challenge-platform/i,
  /cdn-cgi\/scripts/i,
  /rocket-loader/i,
  /waust\.at/i,
  /exosrv\.com/i,
  /exoclick\.com/i,
  /tsyndicate\.com/i,
  /trafficjunky/i,
  /juicyads/i,
  /popads/i,
  /popcash/i,
  /clickadu/i,
  /hilltopads/i,
  /realsrv\.com/i,
  /sacdnssedge\.com/i,
  /tsvideo\./i,
  /ad-delivery/i,
  /hentaigold\.net/i,
  /go\.hentaigold/i,
  /strpst\.com/i,
  /static-proxy\.strpst/i,
  /document\.write\s*\(.*<scr/i,
  /_wau\.push/i,
  /var\s+_wau/i,
];

// ============================================================
// IMAGE CDN PROXY CONFIG
// ============================================================
// Regex to match image CDN URLs like https://i5.nhentaimg.com/018/xxx/thumb.jpg
// Captures: (1) full match, groups: subdomain, path
const IMG_CDN_REGEX = /(https?:)?\/\/(i\d+\.nhentaimg\.com)(\/?)/gi;

// Simple in-memory cache for proxied images (limit ~200MB)
const IMG_CACHE = new Map();
const IMG_CACHE_MAX = 2000; // max items
const IMG_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ============================================================
// HELPERS
// ============================================================

function getMirrorOrigin(reqProtocol, mirrorHost) {
  return `${reqProtocol}://${mirrorHost}`;
}

/**
 * Build a regex that matches ALL variations of the target host
 * in URLs within HTML/CSS/JS content.
 */
function buildTargetRegex() {
  const escaped = TARGET_HOST.replace(/\./g, "\\.");
  return new RegExp(`(https?:)?\/\/${escaped}`, "gi");
}

const TARGET_URL_REGEX = buildTargetRegex();

/**
 * Rewrite all image CDN URLs to local proxy path.
 * e.g. https://i5.nhentaimg.com/018/xxx/thumb.jpg → /_img/i5.nhentaimg.com/018/xxx/thumb.jpg
 */
function rewriteImageUrls(body) {
  return body.replace(
    /(?:https?:)?\/\/(i\d+\.nhentaimg\.com)(\/[^\s"'<>)]*)/gi,
    "/_img/$1$2"
  );
}

/**
 * Rewrite all occurrences of the target domain in text content
 * to relative paths, and rewrite image CDN URLs to local proxy.
 */
function rewriteUrls(body, reqProtocol, mirrorHost) {
  // 1. Replace target host URLs with relative paths
  let result = body.replace(TARGET_URL_REGEX, "");
  // 2. Replace image CDN URLs with local proxy path
  result = rewriteImageUrls(result);
  return result;
}

/**
 * Check if a URL/src belongs to a blocked ad domain
 */
function isBlockedUrl(url) {
  if (!url) return false;
  return BLOCKED_DOMAINS.some((domain) => url.includes(domain));
}

/**
 * Check if a script src matches ad patterns
 */
function isAdScript(src) {
  if (!src) return false;
  return AD_SCRIPT_PATTERNS.some((pattern) => pattern.test(src));
}

/**
 * Process HTML to fix SEO, rewrite URLs, remove ads, fix rocket-loader
 */
function processHtml(html, reqUrl, reqProtocol, mirrorHost) {
  const mirrorOrigin = mirrorHost ? getMirrorOrigin(reqProtocol, mirrorHost) : "";
  const canonicalUrl = mirrorHost ? `${mirrorOrigin}${reqUrl}` : reqUrl;

  // First pass: global URL rewrite (target domain → relative paths)
  let processed = rewriteUrls(html, reqProtocol, mirrorHost);

  // === FIX CLOUDFLARE ROCKET-LOADER ===
  // Rocket-loader changes type="text/javascript" to type="HASH-text/javascript"
  // We need to detect the hash and revert ALL script types back to normal
  // Pattern: type="f880cf8162109bab5d051284-text/javascript" → type="text/javascript"
  processed = processed.replace(/type="[a-f0-9]+-text\/javascript"/gi, 'type="text/javascript"');

  // Remove data-cf-settings attributes
  processed = processed.replace(/\s*data-cf-settings="[^"]*"/gi, '');

  // Second pass: cheerio for structured HTML manipulation
  const $ = cheerio.load(processed, { decodeEntities: false });

  // ========== REMOVE ROCKET-LOADER SCRIPT ITSELF ==========
  $('script[src*="rocket-loader"]').remove();
  $('script[src*="cdn-cgi/"]').remove();

  // ========== REMOVE ADS & TRACKERS ==========

  // Remove all scripts that match ad/tracker patterns
  $("script").each(function () {
    const src = $(this).attr("src") || "";
    const innerHTML = $(this).html() || "";

    // Remove by src
    if (isAdScript(src) || isBlockedUrl(src)) {
      $(this).remove();
      return;
    }

    // Remove inline scripts that reference ad domains
    if (AD_SCRIPT_PATTERNS.some((p) => p.test(innerHTML))) {
      $(this).remove();
      return;
    }
  });

  // Remove ad iframes
  $("iframe").each(function () {
    const src = $(this).attr("src") || "";
    if (isBlockedUrl(src) || isAdScript(src)) {
      $(this).remove();
    }
  });

  // Remove ad video elements (like tsvideo.sacdnssedge.com)
  $("video").each(function () {
    const sources = $(this).find("source");
    let isAd = false;
    sources.each(function () {
      const src = $(this).attr("src") || "";
      if (isBlockedUrl(src)) isAd = true;
    });
    if ($(this).hasClass("ts-im-video")) isAd = true;
    if (isAd) $(this).remove();
  });

  // Remove elements with ad-related classes/IDs
  $(
    ".ts-im-video, .exoclick, .juicyads, [id*='exoclick'], [id*='juicyads'], " +
    "[class*='ad-container'], [class*='ad-banner'], [id*='ad-container'], " +
    "[class*='ts-im'], [id*='tsim']"
  ).remove();

  // Remove link preloads for ad/tracker resources
  $("link[rel='preload'], link[rel='prefetch'], link[rel='dns-prefetch'], link[rel='preconnect']").each(function () {
    const href = $(this).attr("href") || "";
    if (isBlockedUrl(href) || isAdScript(href)) {
      $(this).remove();
    }
  });

  // Remove noscript ad tags
  $("noscript").each(function () {
    const content = $(this).html() || "";
    if (AD_SCRIPT_PATTERNS.some((p) => p.test(content))) {
      $(this).remove();
    }
  });

  // ========== REMOVE DOCUMENT.WRITE AD INJECTORS ==========
  // These use document.write to inject scripts from ad domains
  $("script").each(function () {
    const content = $(this).html() || "";
    if (/document\.write\s*\(/i.test(content) && /go\.hentaigold|exoclick|exosrv|tsyndicate|juicyads|popads/i.test(content)) {
      $(this).remove();
      return;
    }
    // Remove _wau tracker
    if (/_wau/.test(content)) {
      $(this).remove();
      return;
    }
  });

  // Remove elements with ts-im classes (ad popups like the CTA button)
  $('[class*="ts-im"]').remove();

  // ========== FIX LAZY-LOADED IMAGES ==========
  // Move data-src → src for all img.lazy so images load even if LazyLoad fails
  $("img[data-src]").each(function () {
    const dataSrc = $(this).attr("data-src");
    if (dataSrc) {
      $(this).attr("src", dataSrc);
      $(this).removeClass("lazy preloader");
    }
  });

  // Also handle data-lazy-src
  $("img[data-lazy-src]").each(function () {
    const lazySrc = $(this).attr("data-lazy-src");
    if (lazySrc) {
      $(this).attr("src", lazySrc);
    }
  });

  // ========== SEO FIXES ==========

  // --- Canonical Tag ---
  $('link[rel="canonical"]').remove();
  if (mirrorHost) {
    $("head").append(`<link rel="canonical" href="${canonicalUrl}" />`);
  }

  // --- Meta Robots ---
  $('meta[name="robots"]').remove();
  $("head").append('<meta name="robots" content="index, follow" />');

  // --- Open Graph ---
  if (mirrorHost) {
    $('meta[property="og:url"]').attr("content", canonicalUrl);
    if ($('meta[property="og:url"]').length === 0) {
      $("head").append(`<meta property="og:url" content="${canonicalUrl}" />`);
    }
  }

  // --- Twitter ---
  if (mirrorHost) {
    $('meta[name="twitter:url"]').attr("content", canonicalUrl);
  }

  // --- Remove/fix base tag ---
  $("base").each(function () {
    const href = $(this).attr("href") || "";
    if (href.includes(TARGET_HOST)) {
      $(this).attr("href", "/");
    }
  });

  // --- Rewrite remaining href/src/action that still reference target ---
  $("[href], [src], [action], [data-src], [data-lazy-src], [srcset]").each(function () {
    for (const attr of ["href", "src", "action", "data-src", "data-lazy-src"]) {
      const val = $(this).attr(attr);
      if (val && val.includes(TARGET_HOST)) {
        // Rewrite to relative path
        $(this).attr(attr, val.replace(TARGET_URL_REGEX, ""));
      }
    }
    const srcset = $(this).attr("srcset");
    if (srcset && srcset.includes(TARGET_HOST)) {
      $(this).attr("srcset", srcset.replace(TARGET_URL_REGEX, ""));
    }
  });

  // --- Fix inline styles ---
  $("[style]").each(function () {
    const style = $(this).attr("style");
    if (style && style.includes(TARGET_HOST)) {
      $(this).attr("style", style.replace(TARGET_URL_REGEX, ""));
    }
  });

  // --- Add hreflang if not present ---
  if (mirrorHost && $('link[rel="alternate"][hreflang]').length === 0) {
    $("head").append(`<link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`);
  }

  // --- Inject CSS to hide any remaining ad containers ---
  $("head").append(`<style>
    .ts-im-video, .ts-im-button-cta-wrapper, .ts-im-button-cta,
    [class*="ts-im"], [class*="exo-"], [id*="exo_"], [class*="tsim"],
    div[style*="z-index: 2147483647"], div[data-ad], .ad-container,
    iframe[src*="exoclick"], iframe[src*="juicyads"],
    [class*="hide_cta"], .ad-banner, .ad-overlay,
    div[id^="ad_"], div[class^="ad-"] { display:none!important; visibility:hidden!important; height:0!important; overflow:hidden!important; }
  </style>`);

  // --- Inject anti-redirect / anti-popup script ---
  $("body").append(`<script type="text/javascript">
  (function() {
    // Block popunders: override window.open
    var _origOpen = window.open;
    window.open = function(url) {
      if (!url) return null;
      // Only allow opens to same origin
      try {
        var u = new URL(url, window.location.href);
        if (u.origin === window.location.origin) return _origOpen.apply(window, arguments);
      } catch(e) {}
      return null;
    };

    // Block click hijacking: remove onclick handlers on body/document
    document.addEventListener('click', function(e) {
      var t = e.target;
      // If click target is an actual link or inside one, allow it
      if (t.closest && t.closest('a[href]')) return;
      // If click target is a button or input, allow it
      if (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      // If click target is inside navigation/form, allow it
      if (t.closest && (t.closest('form') || t.closest('nav') || t.closest('.pagination'))) return;
    }, true);

    // MutationObserver: remove dynamically injected ad elements
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          var cl = (node.className || '').toString();
          var id = (node.id || '').toString();
          // Remove ts-im popups, exoclick elements, etc.
          if (/ts-im|exoclick|exo_|tsim|ad-overlay|popunder/i.test(cl + ' ' + id)) {
            node.remove();
            return;
          }
          // Remove injected iframes from ad domains
          if (node.tagName === 'IFRAME') {
            var src = node.src || '';
            if (/exoclick|juicyads|trafficjunky|popads|hentaigold|strpst|tsyndicate/i.test(src)) {
              node.remove();
            }
          }
          // Remove injected scripts from ad domains
          if (node.tagName === 'SCRIPT') {
            var src = node.src || '';
            if (/exoclick|juicyads|trafficjunky|popads|hentaigold|strpst|tsyndicate|waust|sacdnssedge/i.test(src)) {
              node.remove();
            }
          }
          // Remove high z-index overlays (common ad popup technique)
          if (node.style && parseInt(node.style.zIndex) > 999999) {
            node.remove();
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Neutralize beforeunload popups from ads
    window.addEventListener('beforeunload', function(e) {
      delete e.returnValue;
    });
  })();
  </script>`);

  return $.html();
}

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

// Trust proxy (Railway/Render put you behind a load balancer)
app.set("trust proxy", true);

// Gzip compression
app.use(compression());

// ---- Security & SEO Headers ----
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "index, follow");
  res.removeHeader("x-powered-by");
  next();
});

// ---- Health check ----
app.get("/healthz", (_req, res) => {
  res.status(200).send("OK");
});

// ---- Block Cloudflare challenge paths (they don't work outside CF) ----
app.all("/cdn-cgi/*", (_req, res) => {
  res.status(204).end();
});

// ============================================================
// IMAGE CDN PROXY  /_img/:host/*
// e.g. /_img/i5.nhentaimg.com/018/xxx/thumb.jpg
// ============================================================
app.get(/^\/_img\/(i\d+\.nhentaimg\.com)\/(.+)$/, (req, res) => {
  const imgHost = req.params[0];
  const imgPath = req.params[1];
  const imgUrl = `https://${imgHost}/${imgPath}`;

  // Check cache
  const cacheKey = `${imgHost}/${imgPath}`;
  const cached = IMG_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.time < IMG_CACHE_TTL)) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.setHeader("X-Cache", "HIT");
    return res.send(cached.data);
  }

  // Fetch from origin CDN
  https.get(imgUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Referer": TARGET_ORIGIN + "/",
    },
  }, (upstream) => {
    // Handle redirects from CDN
    if ([301, 302, 307, 308].includes(upstream.statusCode)) {
      const location = upstream.headers["location"];
      if (location) {
        // Follow redirect internally
        https.get(location, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": TARGET_ORIGIN + "/",
          },
        }, (redir) => {
          streamImageResponse(redir, res, cacheKey);
        }).on("error", () => res.status(502).send("Image fetch failed"));
        return;
      }
    }

    if (upstream.statusCode !== 200) {
      return res.status(upstream.statusCode).send("Image not found");
    }

    streamImageResponse(upstream, res, cacheKey);
  }).on("error", (err) => {
    console.error(`[Image Proxy Error] ${imgUrl}:`, err.message);
    res.status(502).send("Image fetch failed");
  });
});

function streamImageResponse(upstream, res, cacheKey) {
  const contentType = upstream.headers["content-type"] || "image/jpeg";
  const chunks = [];

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
  res.setHeader("X-Cache", "MISS");

  upstream.on("data", (chunk) => {
    chunks.push(chunk);
    res.write(chunk);
  });

  upstream.on("end", () => {
    res.end();
    // Cache the image (only if reasonable size < 5MB)
    const buf = Buffer.concat(chunks);
    if (buf.length < 5 * 1024 * 1024) {
      // Evict oldest if cache is full
      if (IMG_CACHE.size >= IMG_CACHE_MAX) {
        const oldest = IMG_CACHE.keys().next().value;
        IMG_CACHE.delete(oldest);
      }
      IMG_CACHE.set(cacheKey, { data: buf, contentType, time: Date.now() });
    }
  });

  upstream.on("error", () => {
    if (!res.headersSent) res.status(502).send("Image stream error");
  });
}

// ---- robots.txt ----
app.get("/robots.txt", (req, res) => {
  const mirrorHost = MIRROR_DOMAIN || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  res.type("text/plain").send(
    `User-agent: *
Allow: /

Sitemap: ${proto}://${mirrorHost}/sitemap.xml
`
  );
});

// ============================================================
// REVERSE PROXY
// ============================================================
const proxy = createProxyMiddleware({
  target: TARGET_ORIGIN,
  changeOrigin: true,
  secure: true,
  followRedirects: false,
  selfHandleResponse: true,

  on: {
    proxyReq: (proxyReq, req) => {
      // Set correct Host header for the target
      proxyReq.setHeader("Host", TARGET_HOST);

      // Remove forwarding headers
      proxyReq.removeHeader("x-forwarded-host");
      proxyReq.removeHeader("x-forwarded-proto");
      proxyReq.removeHeader("x-forwarded-for");

      // Set browser-like User-Agent
      proxyReq.setHeader(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Request identity encoding so we get uncompressed response for rewriting
      proxyReq.setHeader("Accept-Encoding", "identity");
    },

    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const mirrorHost = MIRROR_DOMAIN || req.headers.host;
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const statusCode = proxyRes.statusCode;

      // ---- Handle Redirects ----
      if ([301, 302, 307, 308].includes(statusCode)) {
        let location = proxyRes.headers["location"] || "";
        if (location) {
          // Rewrite target domain to relative path
          location = location.replace(TARGET_URL_REGEX, "");

          // If it's now a relative path, make it absolute with mirror origin
          if (location.startsWith("/")) {
            location = `${proto}://${mirrorHost}${location}`;
          }

          res.setHeader("Location", location);
        }
        res.statusCode = statusCode;
        return Buffer.from("");
      }

      // ---- Content-Type detection ----
      const contentType = (proxyRes.headers["content-type"] || "").toLowerCase();
      const isHtml = contentType.includes("text/html");
      const isTextual =
        isHtml ||
        contentType.includes("text/css") ||
        contentType.includes("javascript") ||
        contentType.includes("application/json") ||
        contentType.includes("text/xml") ||
        contentType.includes("application/xml");

      // Non-textual → pass through
      if (!isTextual) {
        return responseBuffer;
      }

      let body = responseBuffer.toString("utf-8");

      if (isHtml) {
        body = processHtml(body, req.url, proto, mirrorHost);
      } else {
        body = rewriteUrls(body, proto, mirrorHost);
      }

      res.setHeader("Content-Length", Buffer.byteLength(body, "utf-8"));
      return Buffer.from(body, "utf-8");
    }),

    error: (err, req, res) => {
      console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
      if (!res.headersSent) {
        res.status(502).send("Bad Gateway — upstream unavailable");
      }
    },
  },
});

// Apply proxy to all routes
app.use("/", proxy);

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Mirror proxy running on port ${PORT}`);
  console.log(`Target: ${TARGET_ORIGIN}`);
  console.log(`Mirror domain: ${MIRROR_DOMAIN || "(auto-detect from Host header)"}`);
});
