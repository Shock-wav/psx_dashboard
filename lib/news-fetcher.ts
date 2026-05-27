/**
 * Free RSS news fetcher for Pakistan market news.
 *
 * Sources (all free, no API key required):
 *  - Dawn Business
 *  - Geo News Business
 *  - Profit Pakistan (Pakistan Today)
 *  - The News Business
 *  - ARY News (fallback)
 *
 * Returns a plain-text block of headlines + brief descriptions
 * suitable for pasting directly into an AI prompt.
 */

const RSS_FEEDS: { name: string; url: string }[] = [
  {
    name: "Dawn Business",
    url: "https://www.dawn.com/feeds/business",
  },
  {
    name: "Geo Business",
    url: "https://www.geo.tv/rss/1/business",
  },
  {
    name: "Profit Pakistan",
    url: "https://profit.pakistantoday.com.pk/feed/",
  },
  {
    name: "The News Business",
    url: "https://www.thenews.com.pk/rss/2/business",
  },
  {
    name: "ARY News",
    url: "https://arynews.tv/feed/",
  },
];

export interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  source: string;
}

/** Fetch and parse a single RSS feed with a 6-second timeout. */
async function fetchFeed(
  url: string,
  sourceName: string,
  maxItems = 12
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PSX-Dashboard/1.0 RSS-Reader",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    return parseRSS(xml, sourceName, maxItems);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Finance-relevance filter — strips military, sports, entertainment and other
 * non-market content before it reaches the AI.  At least one keyword must appear
 * in the combined title + description text (case-insensitive).
 */
const FINANCE_KEYWORDS = [
  "stock", "market", "psx", "kse", "rupee", "pkr", "sbp", "secp",
  "bank", "banking", "finance", "financial", "economy", "economic",
  "inflation", "interest rate", "interest", "oil", "gas", "energy", "power",
  "textile", "cement", "fertilizer", "tax", "budget", "trade",
  "import", "export", "dollar", "investment", "investor", "corporate",
  "earnings", "profit", "loss", "revenue", "dividend", "turnover",
  "ipo", "shares", "equity", "bond", "treasury", "sukuk",
  "gdp", "fiscal", "monetary", "currency", "devaluation", "exchange rate",
  "petroleum", "electricity", "coal", "mining", "refinery",
  "agriculture", "wheat", "sugar", "cotton", "rice", "crop",
  "company", "companies", "industry", "industries", "sector",
  "business", "enterprise", "commercial", "bourse",
  "quarter", "annual", "result", "report", "listing", "privatisation",
  "ogdc", "ppl", "pso", "engro", "luck", "mebl", "hbl", "ubl", "mcb",
];

function isFinanceRelevant(title: string, description: string): boolean {
  const text = (title + " " + description).toLowerCase();
  return FINANCE_KEYWORDS.some((kw) => text.includes(kw));
}

/** Minimal RSS XML parser — handles both CDATA and plain text fields. */
function parseRSS(xml: string, source: string, max: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && items.length < max) {
    const block = m[1];
    const title = getTag(block, "title");
    if (!title || title.length < 4) continue;

    const description = getTag(block, "description");

    // Skip articles with no connection to finance / markets / economy
    if (!isFinanceRelevant(title, description)) continue;

    const pubDate = getTag(block, "pubDate");

    items.push({
      title: cleanText(title),
      description: cleanText(description).slice(0, 200),
      pubDate,
      source,
    });
  }

  return items;
}

function getTag(xml: string, tag: string): string {
  // Matches both <tag>text</tag> and <tag><![CDATA[text]]></tag>
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    "i"
  );
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")        // strip HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#?\w+;/g, "")        // remaining HTML entities
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch all RSS feeds in parallel, merge results, de-duplicate, and
 * return a formatted text block for AI consumption.
 *
 * Never throws — returns a fallback message on total failure.
 */
export async function fetchPakistanNews(): Promise<string> {
  const settled = await Promise.allSettled(
    RSS_FEEDS.map((f) => fetchFeed(f.url, f.name))
  );

  const all: NewsItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  if (all.length === 0) {
    return "No news available from RSS feeds right now. Analyze based on general Pakistan market context.";
  }

  // Sort newest-first where we have a parse-able date
  all.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  // De-duplicate by title (simple prefix match)
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const item of all) {
    const key = item.title.slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Format for AI prompt (cap at 40 items to stay within token budget)
  const lines = unique.slice(0, 40).map((item) => {
    let date = "";
    if (item.pubDate) {
      try {
        date = ` · ${new Date(item.pubDate).toLocaleDateString("en-PK", {
          month: "short",
          day: "numeric",
        })}`;
      } catch {
        // ignore invalid date
      }
    }
    const desc = item.description ? ` — ${item.description}` : "";
    return `[${item.source}${date}] ${item.title}${desc}`;
  });

  return lines.join("\n");
}
