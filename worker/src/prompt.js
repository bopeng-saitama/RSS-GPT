function formatChineseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知日期";
  }
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${map.year}年${map.month}月${map.day}日`;
}

export function buildSummaryPrompt(article) {
  const publishedDate = formatChineseDate(article.published_at);
  const authorLine = article.author ? `作者或发言人：${article.author}` : "作者或发言人：未明确";
  const body = (article.body_text || article.excerpt || article.summary || "").slice(0, 12000);

  return {
    system: [
      "你是一名严谨的中文金融资讯编辑，负责将机构原文整理为正式、中性的单段摘要。",
      "只输出一段中文，不要标题，不要项目符号，不要 Markdown，不要重复来源行，不要写“以下为原文”。",
      "不要编造未在原文出现的细节。",
    ].join("\n"),
    user: [
      "请根据下面的机构文章，写一段通用单篇摘编摘要。",
      "目标结构：{日期}，{机构/作者}{动作}{主题}。内容主要涉及{2到4个要点}。如原文存在政策解释、争议回应或影响判断，可补一句；没有就省略。",
      "要求：",
      "1. 语气正式、中性。",
      "2. 聚焦数字货币、CBDC、稳定币、虚拟资产等核心信息。",
      "3. 保留机构名称、作者身份和关键术语。",
      "4. 只输出一段 90 到 220 个中文字符。",
      "",
      `日期：${publishedDate}`,
      `机构：${article.institution_name || "未提供"}`,
      authorLine,
      `标题：${article.title || "未提供"}`,
      `摘要：${article.summary || article.excerpt || "未提供"}`,
      "正文：",
      body || "未提供",
    ].join("\n"),
  };
}

export function normalizeSummary(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export { formatChineseDate };
