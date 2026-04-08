const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function extractMessageText(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

export async function generateWithOpenRouter({ apiKey, model, prompt, fetchImpl, siteUrl, siteName }) {
  const response = await fetchImpl(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
      ...(siteName ? { "X-OpenRouter-Title": siteName } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.2,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || "OpenRouter 调用失败");
  }

  return extractMessageText(payload);
}
