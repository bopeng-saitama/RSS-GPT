# 数币观察

这是一个面向公开访问的静态站点，用来展示各大央行、监管机构和研究机构在北京时间最近三天发布的数字货币相关新闻。抓取和筛选在 Python 构建阶段完成，页面发布到 `docs/`；单篇报告生成和自定义 RSS 预览通过 Cloudflare Worker 代理完成，从而避免在前端暴露真实模型密钥。

## 当前能力

- 从 `sources.yaml` 中定义的内置机构 RSS 抓取新闻
- 只保留 `Asia/Shanghai` 最近三天内容
- 使用“宽进严出”的关键词流程：先用候选词扩充命中，再用强相关词或多重信号做最终筛选
- 为公开页面生成摘要摘录和清洗后的正文
- 输出静态页面壳和 `docs/data/site.json`
- 支持单篇新闻固定模板报告生成
- 支持用户在浏览器本地添加自定义 RSS，并通过 Worker 预览最近三天命中的新闻

## 目录结构

- `dcw/`：Python 构建流程
- `sources.yaml`：内置来源清单
- `docs/`：GitHub Pages 静态产物和前端资源
- `worker/`：Cloudflare Worker 报告代理和自定义 RSS 预览接口

## 本地构建

```bash
pip install -r requirements.txt
python main.py
```

构建会写出：

- `docs/data/site.json`
- `docs/index.html`

如果本地无法访问外部 RSS，构建也会完成，只是文章列表为空。

## 配置内置来源

内置来源统一写在 `sources.yaml`。每个来源至少需要：

- `id`
- `category`
- `institution_name`
- `feeds`
- `strong_keywords`
- `medium_keywords`（可选，但建议配置，用于候选阶段）

示例：

```yaml
sources:
  - id: ecb
    category: central_bank
    institution_name: 欧洲中央银行（ECB）
    feeds:
      - https://www.ecb.europa.eu/rss/press.html
    strong_keywords:
      - digital euro
      - cbdc
    medium_keywords:
      - tokenisation
      - cross-border payments
```

## Cloudflare Worker 配置

公开页面不会直接连接模型服务，真实密钥只放在 Worker 中。

### 非敏感变量

`worker/wrangler.toml` 中保留这些变量：

- `ACTIVE_PROVIDER`：`openrouter` 或 `siliconflow`
- `ACTIVE_MODEL`：Worker 使用的模型名
- `ALLOWED_ORIGIN`：允许调用的站点域名
- `OPENROUTER_SITE_URL`
- `OPENROUTER_SITE_NAME`

### Secrets

只设置你实际使用的那一个：

```bash
cd worker
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SILICONFLOW_API_KEY
```

### 部署

```bash
cd worker
wrangler deploy
```

部署后，在仓库变量里添加：

- `REPORT_WORKER_URL`：Worker 的基础地址

GitHub Actions 构建时会把这个地址写入静态页面壳。

## GitHub Actions

`.github/workflows/cron-job.yml` 已改为：

- 每 2 小时执行一次，也支持手动触发
- 使用仓库自带 `GITHUB_TOKEN`
- 先跑测试，再构建页面
- 只提交 `docs/index.html` 和 `docs/data/site.json`
- 如果生成结果没有变化，就跳过 commit

不再需要个人 PAT，也不再依赖 OpenAI。

## 测试

Python：

```bash
pytest tests -q
```

Worker：

```bash
node --test worker/test/report.test.js worker/test/custom-source.test.js
```
