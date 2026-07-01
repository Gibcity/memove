// Custom scraper for Equable state pages.
// Extracts funded-ratio data and links to underlying charts/data sources.
//
// Usage:
//   node equable_state_scrape.mjs <state-slug> [state-slug ...]
// Output: JSON file per state in sources/raw/equable-states/<slug>.json

import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "/home/mongo/projects/browser-tools/repo install/src/browser.js";

const SLUGS = process.argv.slice(2);
if (!SLUGS.length) {
  console.error("usage: node equable_state_scrape.mjs <state-slug> [more slugs...]");
  process.exit(2);
}

const OUT_DIR = "/home/mongo/projects/us-relocation-2026/sources/raw/equable-states";
fs.mkdirSync(OUT_DIR, { recursive: true });

async function extractState(page, slug) {
  const url = `https://equable.org/state/${slug}/`;
  console.error(`[equable] visiting ${url}`);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  // Wait briefly for any client-side hydration
  await new Promise((r) => setTimeout(r, 1500));

  // Pull the rendered DOM, plus any embedded JSON / datawrapper refs.
  const extracted = await page.evaluate(() => {
    const text = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
    };

    // Find datawrapper chart URLs (these hold the actual funded-ratio maps)
    const datawrapperCharts = [...document.querySelectorAll("iframe[src*='datawrapper'], a[href*='datawrapper']")]
      .map((n) => n.src || n.href)
      .filter((u) => u && /datawrapper\.dwcdn\.net\/[a-zA-Z0-9]+\/\d+\/?/.test(u));

    // Also look for chart-image URLs (the map choropleths are usually rendered as <img> with datawrapper URL)
    const chartImages = [...document.querySelectorAll("img[src*='datawrapper']")]
      .map((n) => n.src)
      .filter((u) => u);

    // Find every paragraph / heading text
    const main = document.querySelector("main") || document.body;
    const blocks = [...main.querySelectorAll("h1, h2, h3, h4, p, li, .stat, .stat-num, [data-stat]")]
      .map((n) => n.textContent.replace(/\s+/g, " ").trim())
      .filter((t) => t && t.length > 1);

    // Find script JSON blobs (some sites embed data in __NEXT_DATA__ or window.* globals)
    const scripts = [...document.querySelectorAll("script[type='application/json'], script#__NEXT_DATA__")]
      .map((n) => n.textContent.slice(0, 20000));

    return {
      title: document.title,
      h1: text("h1"),
      h2_first: text("h2"),
      datawrapperCharts,
      chartImages,
      blocks: blocks.slice(0, 80),  // cap
      scripts: scripts.slice(0, 5),
    };
  });

  // Also try to fetch each Datawrapper chart's CSV — they may be enabled
  const csvResults = [];
  for (const chartUrl of extracted.datawrapperCharts) {
    const m = chartUrl.match(/datawrapper\.dwcdn\.net\/([a-zA-Z0-9]+)\/(\d+)/);
    if (!m) continue;
    const [, chartId, version] = m;
    const csvUrl = `https://datawrapper.dwcdn.net/${chartId}/${version}/dataset.csv`;
    try {
      const r = await page.evaluate(async (u) => {
        const resp = await fetch(u);
        if (!resp.ok) return { ok: false, status: resp.status };
        const text = await resp.text();
        return { ok: true, status: resp.status, text, len: text.length };
      }, csvUrl);
      csvResults.push({ chartId, version, csvUrl, ...r });
    } catch (e) {
      csvResults.push({ chartId, version, csvUrl, ok: false, error: String(e.message || e) });
    }
  }

  return { slug, url, scraped_at: new Date().toISOString(), ...extracted, csvResults };
}

const browser = await launchChrome({ headless: true });
try {
  const page = await browser.newPage();
  for (const slug of SLUGS) {
    try {
      const data = await extractState(page, slug);
      const outPath = path.join(OUT_DIR, `${slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      const dwCount = data.datawrapperCharts.length;
      const csvOk = data.csvResults.filter((c) => c.ok).length;
      console.error(`[equable] ${slug}: wrote ${outPath} (charts=${dwCount}, csv_ok=${csvOk}/${data.csvResults.length})`);
      console.log(JSON.stringify({ slug, ok: true, outPath, datawrapperCharts: dwCount, csv_ok: csvOk }));
    } catch (e) {
      console.error(`[equable] ${slug}: ERROR ${e.message || e}`);
      console.log(JSON.stringify({ slug, ok: false, error: String(e.message || e) }));
    }
  }
  await page.close();
} finally {
  await browser.close();
}
