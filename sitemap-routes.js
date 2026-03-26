const fs = require("fs");
const path = require("path");

// ============================================================
// SITEMAP CONFIGURATION (Yoast SEO-style)
// ============================================================
const URLS_PER_SITEMAP = 1000;

// Pages that should NOT be in the sitemap (noindex pages)
const EXCLUDED_PATHS = ["/login", "/register"];

// Load URL paths from the text file
let ALL_PATHS = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, "sitemap-urls.txt"), "utf-8");
  ALL_PATHS = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !EXCLUDED_PATHS.includes(l));
} catch (err) {
  console.error("[Sitemap] Failed to load sitemap-urls.txt:", err.message);
}

// Categorize URLs for separate sub-sitemaps (like Yoast does per post type)
const PAGE_PATHS = ALL_PATHS.filter(
  (p) => p === "/" || ["/tags", "/artists", "/characters", "/parodies", "/groups", "/tos", "/contact"].includes(p)
);
const GALLERY_PATHS = ALL_PATHS.filter((p) => p.startsWith("/g/"));
const CATEGORY_PATHS = ALL_PATHS.filter(
  (p) =>
    p.startsWith("/tag/") ||
    p.startsWith("/artist/") ||
    p.startsWith("/character/") ||
    p.startsWith("/parody/") ||
    p.startsWith("/group/") ||
    p.startsWith("/language/")
);
// Everything else (pagination, tag listing pages, etc.)
const OTHER_PATHS = ALL_PATHS.filter(
  (p) =>
    !PAGE_PATHS.includes(p) &&
    !GALLERY_PATHS.includes(p) &&
    !CATEGORY_PATHS.includes(p)
);

// Build chunked arrays for sub-sitemaps
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const GALLERY_CHUNKS = chunkArray(GALLERY_PATHS, URLS_PER_SITEMAP);
const CATEGORY_CHUNKS = chunkArray(CATEGORY_PATHS, URLS_PER_SITEMAP);
const OTHER_CHUNKS = chunkArray(OTHER_PATHS, URLS_PER_SITEMAP);

// ============================================================
// XML HELPERS
// ============================================================
function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

// ============================================================
// XSL STYLESHEET (Yoast-style)
// ============================================================
function generateXsl() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:html="http://www.w3.org/TR/REC-html40"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>XML Sitemap</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <style type="text/css">
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; color: #444; }
    #sitemap { max-width: 980px; margin: 20px auto; }
    #sitemap__header { padding: 20px 0; }
    #sitemap__header h1 { font-size: 24px; font-weight: 700; }
    #sitemap__header p { font-size: 14px; color: #777; margin: 5px 0; }
    #sitemap__table { width: 100%; border-collapse: collapse; border: 1px solid #e0e0e0; }
    #sitemap__table th { text-align: left; padding: 10px 12px; background: #4275f4; color: #fff; font-size: 13px; }
    #sitemap__table td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
    #sitemap__table tr:nth-child(odd) td { background: #f9f9f9; }
    #sitemap__table td a { color: #05809e; text-decoration: none; }
    #sitemap__table td a:hover { text-decoration: underline; }
    .text-right { text-align: right; }
  </style>
</head>
<body>
<div id="sitemap">
  <div id="sitemap__header">
    <h1>XML Sitemap</h1>
    <p>This XML Sitemap is generated to help search engines better index this site.</p>
    <p><a href="https://www.sitemaps.org/">Learn more about XML sitemaps.</a></p>
  </div>
  <xsl:choose>
    <xsl:when test="//sitemap:sitemapindex">
      <p>This XML Sitemap Index file contains <strong><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/></strong> sitemaps.</p>
      <table id="sitemap__table">
        <thead><tr><th>Sitemap</th><th class="text-right">Last Modified</th></tr></thead>
        <tbody>
          <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
            <tr>
              <td><a><xsl:attribute name="href"><xsl:value-of select="sitemap:loc"/></xsl:attribute><xsl:value-of select="sitemap:loc"/></a></td>
              <td class="text-right"><xsl:value-of select="sitemap:lastmod"/></td>
            </tr>
          </xsl:for-each>
        </tbody>
      </table>
    </xsl:when>
    <xsl:otherwise>
      <p>Number of URLs in this XML Sitemap: <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong>.</p>
      <table id="sitemap__table">
        <thead><tr><th>URL</th><th class="text-right">Priority</th><th class="text-right">Change Freq.</th><th class="text-right">Last Modified</th></tr></thead>
        <tbody>
          <xsl:for-each select="sitemap:urlset/sitemap:url">
            <tr>
              <td><a><xsl:attribute name="href"><xsl:value-of select="sitemap:loc"/></xsl:attribute><xsl:value-of select="sitemap:loc"/></a></td>
              <td class="text-right"><xsl:value-of select="sitemap:priority"/></td>
              <td class="text-right"><xsl:value-of select="sitemap:changefreq"/></td>
              <td class="text-right"><xsl:value-of select="sitemap:lastmod"/></td>
            </tr>
          </xsl:for-each>
        </tbody>
      </table>
    </xsl:otherwise>
  </xsl:choose>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>`;
}

// ============================================================
// SITEMAP INDEX (like Yoast's sitemap_index.xml)
// ============================================================
function generateSitemapIndex(baseUrl) {
  const today = todayDate();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="${baseUrl}/sitemap-style.xsl"?>\n`;
  xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Page sitemap (homepage + main pages)
  if (PAGE_PATHS.length > 0) {
    xml += `  <sitemap>\n`;
    xml += `    <loc>${baseUrl}/page-sitemap.xml</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `  </sitemap>\n`;
  }

  // Category sitemaps (tags, artists, characters, etc.)
  for (let i = 0; i < CATEGORY_CHUNKS.length; i++) {
    xml += `  <sitemap>\n`;
    xml += `    <loc>${baseUrl}/category-sitemap${i + 1}.xml</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `  </sitemap>\n`;
  }

  // Gallery sitemaps (individual doujin pages)
  for (let i = 0; i < GALLERY_CHUNKS.length; i++) {
    xml += `  <sitemap>\n`;
    xml += `    <loc>${baseUrl}/gallery-sitemap${i + 1}.xml</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `  </sitemap>\n`;
  }

  // Other pages (pagination, etc.)
  for (let i = 0; i < OTHER_CHUNKS.length; i++) {
    xml += `  <sitemap>\n`;
    xml += `    <loc>${baseUrl}/misc-sitemap${i + 1}.xml</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `  </sitemap>\n`;
  }

  xml += `</sitemapindex>`;
  return xml;
}

// ============================================================
// SUB-SITEMAP: Pages (homepage, tags, artists, etc.)
// ============================================================
function generatePageSitemap(baseUrl) {
  const today = todayDate();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="${baseUrl}/sitemap-style.xsl"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for (const p of PAGE_PATHS) {
    const isHome = p === "/";
    const priority = isHome ? "1.0" : "0.8";
    const changefreq = isHome ? "daily" : "weekly";
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(baseUrl + p)}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${changefreq}</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>`;
  return xml;
}

// ============================================================
// SUB-SITEMAP: Gallery pages (chunked, max 1000 per file)
// ============================================================
function generateGallerySitemap(chunkIndex, baseUrl) {
  if (chunkIndex < 0 || chunkIndex >= GALLERY_CHUNKS.length) return null;

  const today = todayDate();
  const chunk = GALLERY_CHUNKS[chunkIndex];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="${baseUrl}/sitemap-style.xsl"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for (const p of chunk) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(baseUrl + p)}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>monthly</changefreq>\n`;
    xml += `    <priority>0.6</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>`;
  return xml;
}

// ============================================================
// SUB-SITEMAP: Category pages (tags, artists, characters, etc.)
// ============================================================
function generateCategorySitemap(chunkIndex, baseUrl) {
  if (chunkIndex < 0 || chunkIndex >= CATEGORY_CHUNKS.length) return null;

  const today = todayDate();
  const chunk = CATEGORY_CHUNKS[chunkIndex];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="${baseUrl}/sitemap-style.xsl"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for (const p of chunk) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(baseUrl + p)}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>`;
  return xml;
}

// ============================================================
// SUB-SITEMAP: Misc pages (pagination, etc.)
// ============================================================
function generateMiscSitemap(chunkIndex, baseUrl) {
  if (chunkIndex < 0 || chunkIndex >= OTHER_CHUNKS.length) return null;

  const today = todayDate();
  const chunk = OTHER_CHUNKS[chunkIndex];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<?xml-stylesheet type="text/xsl" href="${baseUrl}/sitemap-style.xsl"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for (const p of chunk) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(baseUrl + p)}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.5</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>`;
  return xml;
}

// ============================================================
// REGISTER ROUTES
// ============================================================
function registerSitemapRoutes(app) {
  // XSL Stylesheet
  app.get("/sitemap-style.xsl", (_req, res) => {
    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(generateXsl());
  });

  // Sitemap Index (main entry point)
  app.get("/sitemap.xml", (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = process.env.MIRROR_DOMAIN || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(generateSitemapIndex(baseUrl));
  });

  // Also serve at /sitemap_index.xml (Yoast convention)
  app.get("/sitemap_index.xml", (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = process.env.MIRROR_DOMAIN || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(generateSitemapIndex(baseUrl));
  });

  // Page sitemap (homepage, taxonomy, etc.)
  app.get("/page-sitemap.xml", (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = process.env.MIRROR_DOMAIN || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(generatePageSitemap(baseUrl));
  });

  // Gallery sitemaps: /gallery-sitemap1.xml, /gallery-sitemap2.xml, etc.
  app.get(/^\/gallery-sitemap(\d+)\.xml$/, (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = process.env.MIRROR_DOMAIN || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    const chunkIndex = parseInt(req.params[0], 10) - 1;

    const xml = generateGallerySitemap(chunkIndex, baseUrl);
    if (!xml) {
      return res.status(404).send("Sitemap not found");
    }

    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // Category sitemaps: /category-sitemap1.xml, /category-sitemap2.xml, etc.
  app.get(/^\/category-sitemap(\d+)\.xml$/, (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = process.env.MIRROR_DOMAIN || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    const chunkIndex = parseInt(req.params[0], 10) - 1;

    const xml = generateCategorySitemap(chunkIndex, baseUrl);
    if (!xml) {
      return res.status(404).send("Sitemap not found");
    }

    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // Misc sitemaps: /misc-sitemap1.xml, /misc-sitemap2.xml, etc.
  app.get(/^\/misc-sitemap(\d+)\.xml$/, (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = process.env.MIRROR_DOMAIN || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    const chunkIndex = parseInt(req.params[0], 10) - 1;

    const xml = generateMiscSitemap(chunkIndex, baseUrl);
    if (!xml) {
      return res.status(404).send("Sitemap not found");
    }

    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  console.log(
    `[Sitemap] Loaded ${ALL_PATHS.length} URLs → 1 page sitemap, ${CATEGORY_CHUNKS.length} category sitemaps, ${GALLERY_CHUNKS.length} gallery sitemaps, ${OTHER_CHUNKS.length} misc sitemaps`
  );
}

module.exports = { registerSitemapRoutes };
