// SPIKE: the Hitchly core (redirect, create, expiry, max visits, bot-aware O(1) counters, QR) as a Cloudflare Worker + D1.
// Purpose: find out whether the product can run on a free, persistent edge platform and what it would cost. Not production code:
// no tags/passwords/UI, minimal validation. See docs/STACK-REVIEW.md.
import { encode, toSvg } from "../../hitchly/ui/lib/qr.js"; // the SAME file the browser UI uses: no second QR implementation

const SLUG = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED = new Set(["api", "health", "metrics", "ui", "static"]);
const BOT = /bot\b|bot\/|crawl|spider|slurp|scrape|fetch|preview|monitor|uptime|facebookexternalhit|whatsapp|slack|discord|telegram|linkedin|curl\/|wget|python-|go-http-client|java\/|headless|puppeteer|playwright/i;
const isBot = ua => !ua || !ua.trim() || BOT.test(ua);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS links (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, url TEXT NOT NULL, created_at INTEGER NOT NULL,
     expires_at INTEGER, max_visits INTEGER, clicks INTEGER NOT NULL DEFAULT 0, bot_clicks INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id INTEGER NOT NULL, ts INTEGER NOT NULL, referrer TEXT, user_agent TEXT, is_bot INTEGER NOT NULL DEFAULT 0)`,
];

function validUrl(u) {
  try { const x = new URL(u); return ["http:", "https:"].includes(x.protocol) && u.length <= 2048; } catch { return false; }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname, now = Math.floor(Date.now() / 1000);
    if (path === "/health") return json({ status: "ok", runtime: "workers" });

    if (path.startsWith("/api/")) {
      if (req.headers.get("authorization") !== `Bearer ${env.TOKEN}`) return json({ error: "missing or invalid token" }, 401, { "www-authenticate": "Bearer" });
      if (path === "/api/links" && req.method === "POST") {
        const b = await req.json().catch(() => null);
        if (!b || !validUrl(b.url)) return json({ error: "url must be a valid http(s) URL" }, 400);
        const slug = b.slug ?? Array.from(crypto.getRandomValues(new Uint8Array(7)), x => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[x % 62]).join("");
        if (!SLUG.test(slug) || RESERVED.has(slug.toLowerCase())) return json({ error: "invalid slug" }, 400);
        try {
          await env.DB.prepare("INSERT INTO links (slug, url, created_at, expires_at, max_visits) VALUES (?, ?, ?, ?, ?)")
            .bind(slug, b.url, now, b.ttl_seconds ? now + b.ttl_seconds : null, b.max_visits ?? null).run();
        } catch (e) { return json({ error: "slug already in use" }, 409); }
        return json({ slug, short_url: `${url.origin}/${slug}`, url: b.url }, 201);
      }
      const m = path.match(/^\/api\/links\/([A-Za-z0-9_-]+)(\/qr\.svg)?$/);
      if (m && req.method === "GET") {
        const link = await env.DB.prepare("SELECT slug, url, created_at, expires_at, max_visits, clicks, bot_clicks FROM links WHERE slug = ?").bind(m[1]).first();
        if (!link) return json({ error: "not found" }, 404);
        if (m[2]) return new Response(toSvg(encode(`${url.origin}/${link.slug}`)), { headers: { "content-type": "image/svg+xml" } });
        return json(link);
      }
      return json({ error: "not found" }, 404);
    }

    const slug = path.slice(1);
    if (!SLUG.test(slug)) return json({ error: "not found" }, 404);
    const link = await env.DB.prepare("SELECT id, url, expires_at, max_visits, clicks FROM links WHERE slug = ?").bind(slug).first();
    if (!link) return json({ error: "not found" }, 404);
    if ((link.expires_at && now >= link.expires_at) || (link.max_visits && link.clicks >= link.max_visits)) return new Response("This link is no longer available.\n", { status: 410 });

    const bot = req.method === "HEAD" || isBot(req.headers.get("user-agent"));
    // Count + record without making the visitor wait. The conditional UPDATE is the atomic cap check, exactly as in the Python version.
    ctx.waitUntil((async () => {
      const bump = bot
        ? env.DB.prepare("UPDATE links SET bot_clicks = bot_clicks + 1 WHERE id = ?").bind(link.id)
        : env.DB.prepare("UPDATE links SET clicks = clicks + 1 WHERE id = ? AND (max_visits IS NULL OR clicks < max_visits)").bind(link.id);
      const ins = env.DB.prepare("INSERT INTO clicks (link_id, ts, referrer, user_agent, is_bot) VALUES (?, ?, ?, ?, ?)")
        .bind(link.id, now, (req.headers.get("referer") || "").slice(0, 512) || null, (req.headers.get("user-agent") || "").slice(0, 256) || null, bot ? 1 : 0);
      await env.DB.batch([bump, ins]);
    })());
    return new Response(null, { status: 302, headers: { location: link.url, "cache-control": "no-store" } });
  },
};
