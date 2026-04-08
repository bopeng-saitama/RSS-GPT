const DEFAULT_CUSTOM_STRONG_KEYWORDS = [
  "cbdc",
  "central bank digital currency",
  "digital currency",
  "digital euro",
  "e-cny",
  "stablecoin",
  "virtual asset",
  "virtual currency",
  "crypto-asset",
  "cryptocurrency",
  "tokenisation",
  "tokenization",
];
const RECENT_DAY_WINDOW = 3;

function hashId(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function cleanCdata(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function extractTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return cleanCdata(match?.[1] || "");
}

function extractAtomLink(block) {
  const hrefMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch) return hrefMatch[1];
  return extractTag(block, "link");
}

function parseFeedEntries(xmlText) {
  if (/<feed[\s>]/i.test(xmlText)) {
    return [...xmlText.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => {
      const block = match[0];
      const authorBlock = block.match(/<author\b[\s\S]*?<\/author>/i)?.[0] || "";
      return {
        title: extractTag(block, "title"),
        link: extractAtomLink(block),
        published: extractTag(block, "published") || extractTag(block, "updated"),
        summary: extractTag(block, "summary"),
        content: extractTag(block, "content"),
        author: extractTag(authorBlock, "name") || extractTag(block, "author"),
      };
    });
  }

  return [...xmlText.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const block = match[0];
    return {
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      published: extractTag(block, "pubDate"),
      summary: extractTag(block, "description"),
      content: extractTag(block, "content:encoded") || extractTag(block, "encoded"),
      author: extractTag(block, "dc:creator") || extractTag(block, "author"),
    };
  });
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function excerpt(text, limit = 180) {
  return text.slice(0, limit).trim();
}

function currentShanghaiDay(now) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function toShanghaiIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "T")
    .concat("+08:00");
}

function isRecentShanghaiDay(value, day, days = RECENT_DAY_WINDOW) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const target = new Date(`${day}T00:00:00+08:00`);
  const deltaMs = target.getTime() - new Date(`${currentShanghaiDay(date)}T00:00:00+08:00`).getTime();
  const deltaDays = Math.round(deltaMs / 86400000);
  return deltaDays >= 0 && deltaDays < days;
}

function matchesStrongKeywords(title, summary) {
  const combined = `${title} ${summary}`.toLowerCase();
  return DEFAULT_CUSTOM_STRONG_KEYWORDS.some((keyword) => combined.includes(keyword));
}

export async function fetchCustomSourcePreview(source, fetchImpl, now = new Date()) {
  if (!source?.url || !/^https:\/\//i.test(source.url)) {
    throw new Error("自定义 RSS 只支持 HTTPS 地址");
  }

  const response = await fetchImpl(source.url, {
    method: "GET",
    headers: {
      Accept: "application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "DigitalCurrencyWatch/1.0 (+https://example.invalid)",
    },
  });

  if (!response.ok) {
    throw new Error(`RSS 获取失败：${response.status}`);
  }

  const xmlText = (await response.text()).slice(0, 1_000_000);
  const day = currentShanghaiDay(now);

  return parseFeedEntries(xmlText)
    .filter((entry) => entry.published && isRecentShanghaiDay(entry.published, day))
    .filter((entry) => matchesStrongKeywords(entry.title || "", stripHtml(entry.summary || "")))
    .map((entry) => {
      const bodyText = stripHtml(entry.content || entry.summary || "");
      const publishedAt = toShanghaiIso(entry.published);
      return {
        id: `${source.id || "custom"}-${hashId(`${entry.link}|${entry.title}|${publishedAt}`)}`,
        source_id: source.id || "custom",
        source_category: source.category,
        institution_name: source.institution_name,
        title: entry.title,
        summary: stripHtml(entry.summary || ""),
        excerpt: excerpt(stripHtml(entry.summary || entry.content || "")),
        body_html: entry.content || entry.summary || "",
        body_text: bodyText,
        url: entry.link,
        published_at: publishedAt,
        author: entry.author || "",
      };
    })
    .sort((left, right) => String(right.published_at).localeCompare(String(left.published_at)));
}
