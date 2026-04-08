const CATEGORY_LABELS = {
  all: "全部",
  central_bank: "央行",
  regulator: "监管机构",
  research_institution: "研究机构",
};

const STORAGE_KEYS = {
  hiddenBuiltIns: "dcw.hiddenBuiltIns",
  customSources: "dcw.customSources",
};
const ARTICLE_NOISE_SELECTORS = [
  "header",
  "footer",
  "nav",
  "aside",
  "[role='navigation']",
  "[data-testid='top-bar']",
  "[data-testid='menu-items']",
  "[data-testid='product-dropdown']",
  "[data-testid='desktop-banner']",
  "[data-testid='infinite-tickers']",
  "[data-testid='rate-ticker']",
  "[data-testid='social-x']",
  "[data-testid='social-telegram']",
  "[data-testid='social-facebook']",
  "[data-testid='social-youtube']",
  "[data-testid='footer-social-link']",
  "[data-testid='footer-navigation']",
  "[data-testid='block-with-tags']",
  "[data-testid='latest-disclaimer']",
  "[class*='ticker']",
  "[class*='social']",
  "[class*='share']",
  "[class*='newsletter']",
  "[class*='breadcrumb']",
  "[class*='footer']",
  "[class*='header']",
  "[class*='podcast']",
  "[class*='ad-slot']",
];
const ARTICLE_NOISE_PATTERNS = [
  /^\s*coin prices\s*$/i,
  /^\s*crypto prices\s*$/i,
  /^\s*latest prices\s*$/i,
  /^\s*related\s*:/i,
  /^\s*follow us\s*$/i,
  /^\s*subscribe\s*$/i,
  /^\s*listen\s*$/i,
  /^\s*read more\s*:/i,
  /cointelegraph in your social feed/i,
  /committed to independent,\s*transparent journalism/i,
  /editorial policy/i,
];
const ARTICLE_TERMINAL_SECTION_PATTERNS = [
  /^\s*more for you\s*$/i,
  /^\s*recommended(?: for you)?\s*$/i,
  /^\s*recommended articles\s*$/i,
  /^\s*related articles\s*$/i,
  /^\s*related (?:stories|articles|news|reading)\s*$/i,
  /^\s*you may also like\s*$/i,
  /^\s*most read\s*$/i,
  /^\s*editor'?s picks?\s*$/i,
  /^\s*latest stories\s*$/i,
  /^\s*subscribe to daily newsletter\s*$/i,
  /^\s*magazine\s*:/i,
];
const ARTICLE_PRE_BODY_SUMMARY_PATTERNS = [
  /^\s*what to know\s*:?\s*$/i,
  /^\s*why it matters\s*:?\s*$/i,
  /^\s*in brief\s*:?\s*$/i,
  /^\s*key points?\s*:?\s*$/i,
  /^\s*key takeaways?\s*:?\s*$/i,
];
const ARTICLE_NOISE_ATTR_KEYWORDS = [
  "social",
  "share",
  "ticker",
  "price",
  "newsletter",
  "breadcrumb",
  "podcast",
  "follow",
  "footer",
  "header",
  "menu",
  "nav",
  "ad-slot",
];
const ARTICLE_PRICE_ONLY_PATTERN = /^[+\-−]?(?:[$€£¥]|US\$)?\s?\d[\d,]*(?:\.\d+)?(?:\s?[kmbt])?(?:%| percent)?$/i;
const ARTICLE_SYMBOL_ONLY_PATTERN = /^[A-Z0-9_]{1,16}(?:\/[A-Z0-9_]{1,16})?$/;
const ARTICLE_SYMBOL_PRICE_PATTERN = /^[A-Z0-9]{2,8}(?:\/[A-Z0-9]{2,8})?\s+[+\-−]?(?:[$€£¥]|US\$)\s?\d/i;
const ARTICLE_TAG_LINE_PATTERN = /^(?:#[-\w]+(?:\s+|$)){1,12}$/;
const DEDUPE_TRACKING_QUERY_PREFIXES = ["utm_"];
const DEDUPE_TRACKING_QUERY_KEYS = new Set(["ref", "refs", "source", "campaign", "cmpid", "cmp", "output", "rss"]);

const appRoot = document.getElementById("app");
const workerBaseUrl = appRoot?.dataset.workerBaseUrl || "";

const state = {
  payload: null,
  payloadError: "",
  activeCategory: "all",
  activeInstitution: "all",
  detailArticleId: null,
  reportArticleId: null,
  reportMode: "markdown",
  hiddenBuiltIns: new Set(loadJson(STORAGE_KEYS.hiddenBuiltIns, [])),
  customSources: loadJson(STORAGE_KEYS.customSources, []),
  preparedArticles: new Map(),
};

document.addEventListener("DOMContentLoaded", () => {
  bindStaticActions();
  loadPayload();
});

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEYS.hiddenBuiltIns, JSON.stringify([...state.hiddenBuiltIns]));
  localStorage.setItem(STORAGE_KEYS.customSources, JSON.stringify(state.customSources));
}

async function loadPayload() {
  try {
    const response = await fetch("data/site.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`站点数据加载失败：${response.status}`);
    }
    state.payload = await response.json();
    state.payloadError = "";
  } catch (error) {
    state.payloadError = error.message || "站点数据加载失败";
  }
  render();
}

function bindStaticActions() {
  document.getElementById("openSettingsButton")?.addEventListener("click", () => {
    document.getElementById("sourceSettingsPanel").hidden = false;
  });
  document.getElementById("closeSettingsButton")?.addEventListener("click", () => {
    document.getElementById("sourceSettingsPanel").hidden = true;
  });
  document.getElementById("closeDetailButton")?.addEventListener("click", closeDetail);
  document.getElementById("closeReportButton")?.addEventListener("click", closeReport);
  document.getElementById("reportModeMarkdown")?.addEventListener("click", () => setReportMode("markdown"));
  document.getElementById("reportModeHtml")?.addEventListener("click", () => setReportMode("html"));
  document.getElementById("copyReportButton")?.addEventListener("click", copyReport);
  document.getElementById("downloadMarkdownButton")?.addEventListener("click", () => downloadReport("markdown"));
  document.getElementById("downloadHtmlButton")?.addEventListener("click", () => downloadReport("html"));
  document.getElementById("customSourceForm")?.addEventListener("submit", onCustomSourceSubmit);
}

function render() {
  if (!state.payload) {
    renderNewsList();
    return;
  }
  renderBuildMeta();
  renderCategoryFilters();
  renderInstitutionFilters();
  renderNewsList();
  renderBuiltInSources();
  renderCustomSources();
  renderDetailDrawer();
  renderReportModal();
}

function renderBuildMeta() {
  const el = document.getElementById("buildMeta");
  if (!el || !state.payload) return;
  el.textContent = `更新于 ${formatDateTime(state.payload.generated_at)}`;
}

function getBuiltInSources() {
  return (state.payload?.sources || []).filter((source) => !state.hiddenBuiltIns.has(source.id));
}

function findCustomSource(sourceId) {
  return state.customSources.find((source) => source.id === sourceId);
}

function getCustomSourceArticles() {
  return state.customSources
    .filter((source) => source.enabled !== false)
    .flatMap((source) => (source.articles || []).map((article) => ({
      ...article,
      source_id: source.id,
      source_category: source.category,
      institution_name: source.institution_name,
      is_custom: true,
    })));
}

function getVisibleArticles() {
  const enabledBuiltInIds = new Set(getBuiltInSources().map((source) => source.id));
  const builtInArticles = (state.payload?.articles || []).filter((article) => enabledBuiltInIds.has(article.source_id));
  const merged = [...builtInArticles, ...getCustomSourceArticles()];

  const filtered = merged
    .filter((article) => state.activeCategory === "all" || article.source_category === state.activeCategory)
    .filter((article) => state.activeInstitution === "all" || article.source_id === state.activeInstitution)
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));

  return dedupeArticles(filtered);
}

function renderCategoryFilters() {
  const categories = ["all", "central_bank", "regulator", "research_institution"];
  const html = categories.map((category) => {
    const label = CATEGORY_LABELS[category];
    const active = category === state.activeCategory ? " is-active" : "";
    return `<button class="chip${active}" type="button" data-category="${category}">${label}</button>`;
  }).join("");
  const el = document.getElementById("categoryFilters");
  el.innerHTML = html;
  el.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      state.activeInstitution = "all";
      render();
    });
  });
}

function renderInstitutionFilters() {
  const sources = [
    { id: "all", institution_name: "全部机构", category: "all" },
    ...getBuiltInSources(),
    ...state.customSources.filter((source) => source.enabled !== false),
  ].filter((source) => state.activeCategory === "all" || source.category === state.activeCategory || source.id === "all");

  const html = sources.map((source) => {
    const active = source.id === state.activeInstitution ? " is-active" : "";
    return `<button class="chip${active}" type="button" data-institution="${source.id}">${source.institution_name}</button>`;
  }).join("");

  const el = document.getElementById("institutionFilters");
  el.innerHTML = html;
  el.querySelectorAll("[data-institution]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeInstitution = button.dataset.institution;
      render();
    });
  });
}

function renderNewsList() {
  const el = document.getElementById("newsList");
  if (state.payloadError) {
    el.innerHTML = `<div class="empty-state">${escapeHtml(state.payloadError)}</div>`;
    return;
  }

  const articles = getVisibleArticles();
  if (!articles.length) {
    el.innerHTML = `<div class="empty-state">当前筛选条件下没有符合要求的最近三天新闻。</div>`;
    return;
  }

  el.innerHTML = articles.map((article) => `
    <article class="news-row">
      <div class="news-row-top">
        <div>
          <div class="news-meta">
            <span class="news-badge">${CATEGORY_LABELS[article.source_category] || article.source_category}</span>
            <span>${article.institution_name}</span>
            <span>${formatTime(article.published_at)}</span>
          </div>
          <h3>${escapeHtml(article.title)}</h3>
        </div>
      </div>
      <p>${escapeHtml(getPreparedArticle(article).excerpt || "")}</p>
      <div class="news-actions">
        <button class="ghost-button" type="button" data-open-detail="${article.id}">查看详情</button>
        <button class="primary-button" type="button" data-open-report="${article.id}">生成报告</button>
        <a class="ghost-button link-button" href="${article.url}" target="_blank" rel="noopener noreferrer">原文链接</a>
      </div>
    </article>
  `).join("");

  el.querySelectorAll("[data-open-detail]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.openDetail));
  });
  el.querySelectorAll("[data-open-report]").forEach((button) => {
    button.addEventListener("click", () => openReport(button.dataset.openReport));
  });
}

function findArticle(articleId) {
  return getVisibleArticles().find((article) => article.id === articleId)
    || (state.payload?.articles || []).find((article) => article.id === articleId)
    || getCustomSourceArticles().find((article) => article.id === articleId);
}

function openDetail(articleId) {
  state.detailArticleId = articleId;
  renderDetailDrawer();
}

function closeDetail() {
  state.detailArticleId = null;
  renderDetailDrawer();
}

function renderDetailDrawer() {
  const drawer = document.getElementById("detailDrawer");
  const article = state.detailArticleId ? findArticle(state.detailArticleId) : null;
  drawer.hidden = !article;
  if (!article) return;
  const preparedArticle = getPreparedArticle(article);

  document.getElementById("detailTitle").textContent = article.title;
  document.getElementById("detailExcerpt").textContent = preparedArticle.excerpt || "";
  document.getElementById("detailMeta").innerHTML = `
    <span class="news-badge">${CATEGORY_LABELS[article.source_category] || article.source_category}</span>
    <span>${article.institution_name}</span>
    <span>${formatTime(article.published_at)}</span>
    ${article.author ? `<span>${escapeHtml(article.author)}</span>` : ""}
  `;
  document.getElementById("detailBody").innerHTML = preparedArticle.body_html || `<p>${escapeHtml(preparedArticle.excerpt || "")}</p>`;
  document.getElementById("detailSourceLink").href = article.url;
  document.getElementById("detailGenerateButton").onclick = () => openReport(article.id);
}

function renderBuiltInSources() {
  const el = document.getElementById("builtInSourcesList");
  el.innerHTML = (state.payload?.sources || []).map((source) => {
    const hidden = state.hiddenBuiltIns.has(source.id);
    const buttonLabel = hidden ? "启用" : "关闭";
    const buttonClass = hidden ? "ghost-button toggle-button is-off" : "ghost-button toggle-button";
    const feeds = (source.feeds || []).map((feed) => `<span class="settings-url">${escapeHtml(feed)}</span>`).join("");
    return `
      <div class="settings-row">
        <div class="settings-row-meta">
          <strong>${source.institution_name}</strong>
          <span>${CATEGORY_LABELS[source.category] || source.category}</span>
          ${feeds}
        </div>
        <button class="${buttonClass}" type="button" data-toggle-built-in="${source.id}">${buttonLabel}</button>
      </div>
    `;
  }).join("");

  el.querySelectorAll("[data-toggle-built-in]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceId = button.dataset.toggleBuiltIn;
      if (state.hiddenBuiltIns.has(sourceId)) {
        state.hiddenBuiltIns.delete(sourceId);
      } else {
        state.hiddenBuiltIns.add(sourceId);
      }
      if (state.activeInstitution === sourceId) {
        state.activeInstitution = "all";
      }
      persistState();
      render();
    });
  });
}

function renderCustomSources() {
  const el = document.getElementById("customSourcesList");
  if (!state.customSources.length) {
    el.innerHTML = `<div class="empty-state">还没有自定义来源。</div>`;
    return;
  }

  el.innerHTML = state.customSources.map((source) => {
    const enabled = source.enabled !== false;
    const countLabel = source.preview_status === "loading"
      ? "正在抓取最近三天新闻..."
      : source.preview_error
        ? `抓取失败：${source.preview_error}`
        : `最近三天新闻 ${source.articles?.length || 0} 条`;
    return `
      <div class="settings-row">
        <div class="settings-row-meta">
          <strong>${source.institution_name}</strong>
          <span>${CATEGORY_LABELS[source.category] || source.category}</span>
          <span class="settings-url">${source.url}</span>
          <span>${countLabel}</span>
        </div>
        <div class="toolbar-actions">
          <button class="ghost-button" type="button" data-refresh-custom="${source.id}">刷新</button>
          <button class="ghost-button ${enabled ? "" : "is-off"}" type="button" data-toggle-custom="${source.id}">${enabled ? "关闭" : "启用"}</button>
          <button class="ghost-button" type="button" data-delete-custom="${source.id}">删除</button>
        </div>
      </div>
    `;
  }).join("");

  el.querySelectorAll("[data-toggle-custom]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = state.customSources.find((item) => item.id === button.dataset.toggleCustom);
      if (!source) return;
      source.enabled = source.enabled === false;
      if (state.activeInstitution === source.id && source.enabled === false) {
        state.activeInstitution = "all";
      }
      persistState();
      render();
    });
  });

  el.querySelectorAll("[data-delete-custom]").forEach((button) => {
    button.addEventListener("click", () => {
      state.customSources = state.customSources.filter((item) => item.id !== button.dataset.deleteCustom);
      if (state.activeInstitution === button.dataset.deleteCustom) {
        state.activeInstitution = "all";
      }
      persistState();
      render();
    });
  });

  el.querySelectorAll("[data-refresh-custom]").forEach((button) => {
    button.addEventListener("click", () => {
      refreshCustomSource(button.dataset.refreshCustom);
    });
  });
}

function onCustomSourceSubmit(event) {
  event.preventDefault();
  const institutionName = document.getElementById("customInstitutionInput").value.trim();
  const category = document.getElementById("customCategoryInput").value;
  const url = document.getElementById("customUrlInput").value.trim();
  if (!institutionName || !category || !url) return;

  const source = {
    id: `custom-${Date.now()}`,
    institution_name: institutionName,
    category,
    url,
    enabled: true,
    articles: [],
    preview_status: "idle",
    preview_error: "",
  };
  state.customSources.unshift(source);
  persistState();
  event.target.reset();
  render();
  refreshCustomSource(source.id);
}

async function refreshCustomSource(sourceId) {
  const source = findCustomSource(sourceId);
  if (!source) return;

  if (!workerBaseUrl) {
    source.preview_status = "error";
    source.preview_error = "未配置预览服务地址";
    persistState();
    render();
    return;
  }

  source.preview_status = "loading";
  source.preview_error = "";
  persistState();
  render();

  try {
    const response = await fetch(`${workerBaseUrl.replace(/\/$/, "")}/api/custom-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: {
          id: source.id,
          institution_name: source.institution_name,
          category: source.category,
          url: source.url,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "自定义 RSS 抓取失败");
    }
    source.articles = payload.articles || [];
    source.preview_status = "ready";
    source.preview_error = "";
  } catch (error) {
    source.articles = [];
    source.preview_status = "error";
    source.preview_error = error.message || "自定义 RSS 抓取失败";
  }

  persistState();
  render();
}

async function openReport(articleId) {
  state.reportArticleId = articleId;
  const article = findArticle(articleId);
  if (!article) return;
  const preparedArticle = getPreparedArticle(article);

  const modal = document.getElementById("reportModal");
  modal.hidden = false;
  document.getElementById("reportMeta").innerHTML = `
    <span>${article.institution_name}</span>
    <span>${formatTime(article.published_at)}</span>
  `;
  setReportOutput("报告生成中...");

  if (!workerBaseUrl) {
    setReportOutput("未配置报告服务地址。");
    return;
  }

  try {
    const response = await fetch(`${workerBaseUrl.replace(/\/$/, "")}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article: preparedArticle }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "生成失败");
    }
    state.reportMarkdown = payload.markdown || "";
    state.reportHtml = payload.html || "";
    updateReportOutput();
  } catch (error) {
    state.reportMarkdown = "";
    state.reportHtml = "";
    setReportOutput(error.message || "生成失败");
  }
}

function closeReport() {
  state.reportArticleId = null;
  document.getElementById("reportModal").hidden = true;
}

function renderReportModal() {
  if (!state.reportArticleId) return;
  updateReportOutput();
}

function setReportMode(mode) {
  state.reportMode = mode;
  document.getElementById("reportModeMarkdown").classList.toggle("is-active", mode === "markdown");
  document.getElementById("reportModeHtml").classList.toggle("is-active", mode === "html");
  updateReportOutput();
}

function updateReportOutput() {
  const output = document.getElementById("reportOutput");
  if (state.reportMode === "html" && state.reportHtml) {
    output.innerHTML = state.reportHtml;
    return;
  }
  output.textContent = state.reportMarkdown || "暂无报告内容。";
}

function setReportOutput(text) {
  const output = document.getElementById("reportOutput");
  output.textContent = text;
}

async function copyReport() {
  const text = state.reportMode === "html" ? state.reportHtml : state.reportMarkdown;
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

function downloadReport(type) {
  const content = type === "html" ? state.reportHtml : state.reportMarkdown;
  if (!content) return;
  const blob = new Blob([content], { type: type === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `report.${type === "html" ? "html" : "md"}`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = articleDedupeKey(article);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeArticleUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      const lowered = key.toLowerCase();
      if (DEDUPE_TRACKING_QUERY_PREFIXES.some((prefix) => lowered.startsWith(prefix)) || DEDUPE_TRACKING_QUERY_KEYS.has(lowered)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || parsed.pathname;
    return parsed.toString();
  } catch (error) {
    return String(url).trim();
  }
}

function articleDedupeKey(article) {
  const normalizedUrl = normalizeArticleUrl(article.url || article.canonical_url || "");
  if (normalizedUrl) {
    return `${article.source_id || ""}|${normalizedUrl}`;
  }
  return `${article.source_id || ""}|${String(article.title || "").trim().toLowerCase()}|${String(article.published_at || "")}`;
}

function getPreparedArticle(article) {
  if (!article) return null;
  const cached = state.preparedArticles.get(article.id);
  if (cached) return cached;

  const prepared = {
    ...article,
    canonical_url: normalizeArticleUrl(article.url || article.canonical_url || ""),
  };

  const body = distillArticleHtml(article.body_html || "");
  prepared.body_html = body.html || textToParagraphs(body.text || article.body_text || article.summary || article.excerpt || "");
  prepared.body_text = body.text || normalizeWhitespace(article.body_text || article.summary || article.excerpt || "");
  prepared.excerpt = buildExcerpt(article.excerpt, prepared.body_text);
  state.preparedArticles.set(article.id, prepared);
  return prepared;
}

function distillArticleHtml(rawHtml) {
  if (!rawHtml) {
    return { html: "", text: "" };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");
  const root = doc.body;
  if (!root) {
    return { html: "", text: "" };
  }

  ARTICLE_NOISE_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => node.remove());
  });
  root.querySelectorAll("h1").forEach((node) => node.remove());

  const blocks = [];
  let bodyStarted = false;

  for (const node of root.querySelectorAll("p, h2, h3, h4, blockquote, ul, ol, pre")) {
    if (["p", "h2", "h3", "h4", "blockquote", "ul", "ol", "pre"].includes(node.parentElement?.tagName?.toLowerCase())) {
      continue;
    }

    const text = normalizeWhitespace(node.textContent || "");
    if (!text) continue;

    if (ARTICLE_TERMINAL_SECTION_PATTERNS.some((pattern) => pattern.test(text))) {
      break;
    }

    if (looksLikeNoiseNode(node, text) || ARTICLE_TAG_LINE_PATTERN.test(text)) {
      continue;
    }

    if (!bodyStarted) {
      if (ARTICLE_PRE_BODY_SUMMARY_PATTERNS.some((pattern) => pattern.test(text))) {
        continue;
      }
      if (node.tagName.toLowerCase() !== "p") {
        continue;
      }
      bodyStarted = true;
    }

    const clone = node.cloneNode(true);
    stripNodeAttributes(clone);
    blocks.push({ html: clone.outerHTML, text });
  }

  return {
    html: blocks.map((block) => block.html).join("") || textToParagraphs(normalizeWhitespace(blocks.map((block) => block.text).join(" "))),
    text: normalizeWhitespace(blocks.map((block) => block.text).join(" ")),
  };
}

function looksLikeNoiseNode(node, text) {
  const attrText = [
    node.getAttribute("class"),
    node.getAttribute("id"),
    node.getAttribute("data-testid"),
    node.getAttribute("aria-label"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (ARTICLE_NOISE_ATTR_KEYWORDS.some((keyword) => attrText.includes(keyword))) {
    return true;
  }

  if (text.length < 260 && ARTICLE_NOISE_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const linksToMarketData = [...node.querySelectorAll("a")].some((link) => {
    const href = String(link.getAttribute("href") || "").toLowerCase();
    return href.includes("/price/") || href.includes("/markets/") || href.includes("/coins/");
  });

  if (ARTICLE_PRICE_ONLY_PATTERN.test(text) || ARTICLE_SYMBOL_PRICE_PATTERN.test(text)) {
    return true;
  }

  if (text.length <= 12 && ARTICLE_SYMBOL_ONLY_PATTERN.test(text) && (linksToMarketData || attrText.includes("price") || attrText.includes("ticker"))) {
    return true;
  }

  if (text.length <= 28 && linksToMarketData && (text.includes("$") || ARTICLE_SYMBOL_ONLY_PATTERN.test(text))) {
    return true;
  }

  return false;
}

function stripNodeAttributes(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const allowed = node.tagName.toLowerCase() === "a" ? new Set(["href"]) : new Set();
  [...node.attributes].forEach((attribute) => {
    if (!allowed.has(attribute.name)) {
      node.removeAttribute(attribute.name);
    }
  });
  [...node.children].forEach((child) => stripNodeAttributes(child));
}

function buildExcerpt(existingExcerpt, bodyText) {
  const cleanedExcerpt = normalizeWhitespace(existingExcerpt || "");
  if (cleanedExcerpt && !ARTICLE_NOISE_PATTERNS.some((pattern) => pattern.test(cleanedExcerpt))) {
    return cleanedExcerpt.slice(0, 180);
  }
  return normalizeWhitespace(bodyText || "").slice(0, 180);
}

function textToParagraphs(text) {
  const cleaned = normalizeWhitespace(text);
  return cleaned ? `<p>${escapeHtml(cleaned)}</p>` : "";
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
