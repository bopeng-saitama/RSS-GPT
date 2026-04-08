import { formatChineseDate } from "./prompt.js";

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function bodyParagraphs(article) {
  const fromHtml = stripTags(article.body_html || "");
  const body = fromHtml || article.body_text || article.excerpt || article.summary || "";
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function originalMetaLines(article) {
  const lines = [];
  if (article.author) {
    lines.push(`作者/发言人：${article.author}`);
  }
  if (article.published_at) {
    lines.push(`发布时间：${formatChineseDate(article.published_at)}`);
  }
  return lines;
}

export function buildMarkdownReport(article, summary) {
  const sourceLine = article.url
    ? `（[${article.institution_name}](${article.url})）`
    : `（${article.institution_name}）`;
  const metaLines = originalMetaLines(article);
  const paragraphs = bodyParagraphs(article);

  return [
    summary,
    "",
    sourceLine,
    "",
    "以下为原文",
    "",
    article.title || "",
    ...metaLines,
    "",
    ...paragraphs,
  ].filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
}

export function buildHtmlReport(article, summary) {
  const sourceLine = article.url
    ? `（<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.institution_name)}</a>）`
    : `（${escapeHtml(article.institution_name)}）`;
  const metaLines = originalMetaLines(article)
    .map((line) => `<p class="report-origin-meta">${escapeHtml(line)}</p>`)
    .join("");
  const paragraphs = bodyParagraphs(article)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return [
    `<article class="report-document">`,
    `<p>${escapeHtml(summary)}</p>`,
    `<p>${sourceLine}</p>`,
    `<h3>以下为原文</h3>`,
    `<h4>${escapeHtml(article.title || "")}</h4>`,
    metaLines,
    paragraphs,
    `</article>`,
  ].join("");
}
