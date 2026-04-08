import { buildSummaryPrompt, normalizeSummary } from "./prompt.js";
import { buildHtmlReport, buildMarkdownReport } from "./template.js";
import { generateWithOpenRouter } from "./providers/openrouter.js";
import { generateWithSiliconFlow } from "./providers/siliconflow.js";

function jsonResponse(body, init = {}, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function withCors(response, corsHeaders) {
  if (!Object.keys(corsHeaders).length) {
    return response;
  }
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveCorsHeaders(request, env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || "";
  const requestOrigin = request.headers.get("Origin") || "";

  if (!allowedOrigin) {
    return {};
  }
  if (allowedOrigin === "*" && requestOrigin) {
    return {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    };
  }
  if (!requestOrigin) {
    return {};
  }
  if (requestOrigin !== allowedOrigin) {
    throw new Error("origin_not_allowed");
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function validateArticle(article) {
  if (!article || typeof article !== "object") {
    throw new Error("缺少文章数据");
  }
  if (!article.title || !article.institution_name || !article.published_at) {
    throw new Error("文章字段不完整");
  }
}

async function generateSummary(article, env, fetchImpl) {
  const provider = String(env.ACTIVE_PROVIDER || "").toLowerCase();
  const model = env.ACTIVE_MODEL;
  if (!model) {
    throw new Error("未配置 ACTIVE_MODEL");
  }

  const prompt = buildSummaryPrompt(article);

  if (provider === "openrouter") {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error("未配置 OPENROUTER_API_KEY");
    }
    return generateWithOpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
      model,
      prompt,
      fetchImpl,
      siteUrl: env.OPENROUTER_SITE_URL,
      siteName: env.OPENROUTER_SITE_NAME,
    });
  }

  if (provider === "siliconflow") {
    if (!env.SILICONFLOW_API_KEY) {
      throw new Error("未配置 SILICONFLOW_API_KEY");
    }
    return generateWithSiliconFlow({
      apiKey: env.SILICONFLOW_API_KEY,
      model,
      prompt,
      fetchImpl,
    });
  }

  throw new Error("ACTIVE_PROVIDER 只支持 openrouter 或 siliconflow");
}

export async function handleReportRequest(request, env, { fetchImpl }) {
  const payload = await request.json();
  const article = payload?.article;
  validateArticle(article);

  const summary = normalizeSummary(await generateSummary(article, env, fetchImpl));
  if (!summary) {
    throw new Error("模型未返回摘要内容");
  }

  return jsonResponse({
    markdown: buildMarkdownReport(article, summary),
    html: buildHtmlReport(article, summary),
  });
}

export async function handleCustomSourceRequest(request, env, { fetchImpl, now }) {
  return jsonResponse({ error: "自定义来源预览已停用" }, { status: 403 });
}

export async function handleRequest(request, env, options = {}) {
  let corsHeaders = {};
  try {
    corsHeaders = resolveCorsHeaders(request, env);
  } catch (error) {
    return jsonResponse({ error: "不允许的来源域名" }, { status: 403 }, {});
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
      },
    });
  }

  const url = new URL(request.url);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());

  try {
    if (request.method === "POST" && url.pathname === "/api/report") {
      return withCors(await handleReportRequest(request, env, { fetchImpl }), corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/api/custom-source") {
      return withCors(await handleCustomSourceRequest(request, env, { fetchImpl, now }), corsHeaders);
    }
    return jsonResponse({ error: "Not Found" }, { status: 404 }, corsHeaders);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "服务异常" },
      { status: 400 },
      corsHeaders,
    );
  }
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
