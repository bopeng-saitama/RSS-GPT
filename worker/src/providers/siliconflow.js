const SILICONFLOW_URL = "https://api.siliconflow.com/v1/chat/completions";

function extractMessageText(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

export async function generateWithSiliconFlow({ apiKey, model, prompt, fetchImpl }) {
  const response = await fetchImpl(SILICONFLOW_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.2,
      stream: false,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || "硅基流动调用失败");
  }

  return extractMessageText(payload);
}
