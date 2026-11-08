// Vision-assisted question boundary detection.
// Uses the host's configured multimodal model through ctx.llm + ctx.attachments.
// Only called when the caller explicitly enables the AI mode.

const VISION_PROMPT = [
  "你是一个试卷/笔记切图助手。图片是一页题目或解题笔记（可能是手写）。",
  "请找出这一页中所有『题目』的起始位置：题号（例如 1.、2、3、第1题、(1)、（1）、①）一般写在每道题解题内容的最前面。",
  "只统计顶层题目；题目内部的小问编号（如大题下的小问 (1)(2)）不要单独统计。",
  "对每道题，返回它的题号文字，以及题号所在文字行『顶部』在整张图片中的纵向位置百分比（0-100，保留 1 位小数）。",
  '严格只输出 JSON，不要输出其它文字：{"questions":[{"label":"1","y":12.3}]}',
  '如果图片中没有题号，输出 {"questions":[]}。',
].join("\n");

export function buildVisionPrompt(extraHint) {
  const hint = String(extraHint ?? "").trim();
  return hint ? `${VISION_PROMPT}\n补充说明：${hint}` : VISION_PROMPT;
}

function providerId(route) {
  return typeof route === "string" ? route : route?.id ?? route?.provider ?? null;
}

/**
 * Discover provider/model pairs that accept image input.
 * @param {object} ctx cordis context
 * @returns {Promise<Array<{provider: string, model: string, name?: string}>>}
 */
export async function listVisionModels(ctx) {
  const llm = ctx.get("llm");
  if (!llm) return [];
  const providers = typeof llm.listProviders === "function" ? llm.listProviders() : [];
  const found = [];
  for (const route of providers) {
    const provider = providerId(route);
    if (!provider) continue;
    let models = [];
    try {
      models = (await llm.listModels(provider)) ?? [];
    } catch {
      models = [];
    }
    for (const model of models) {
      const modalities = Array.isArray(model?.inputModalities) ? model.inputModalities : null;
      if (modalities && modalities.includes("image")) {
        found.push({ provider, model: model.id, name: model.name ?? model.id });
      }
    }
  }
  return found;
}

/** Pick a vision-capable target, preferring explicit preference then known-good ids. */
export async function resolveVisionTarget(ctx, preferred) {
  if (preferred?.provider && preferred?.model) {
    try {
      const info = await ctx.get("llm")?.resolveModelInfo?.(preferred.provider, preferred.model);
      const modalities = info?.inputModalities;
      if (!modalities || modalities.includes("image")) return { provider: preferred.provider, model: preferred.model };
    } catch {
      // fall through to discovery
    }
  }
  const models = await listVisionModels(ctx);
  const preferredIds = ["deepseek-flash"];
  for (const id of preferredIds) {
    const hit = models.find((entry) => entry.model === id);
    if (hit) return hit;
  }
  return models[0] ?? null;
}

/** Ask the model for question start positions. Returns the raw assistant text. */
export async function requestQuestionPositions(ctx, { imageBase64, mediaType, prompt, target, signal, log = () => {} }) {
  const llm = ctx.get("llm");
  const attachments = ctx.get("attachments");
  if (!llm) throw new Error("宿主未提供 LLM 服务，无法使用 AI 识别。");
  if (!attachments) throw new Error("宿主未提供附件服务，无法把图片发送给模型。");
  const resolved = target ?? (await resolveVisionTarget(ctx));
  if (!resolved) throw new Error("没有找到支持图片输入的模型，请先在 DSH 设置中配置多模态模型。");

  const admitted = await attachments.admitPromptContent([
    { type: "text", text: prompt ?? VISION_PROMPT },
    { type: "image", data: imageBase64, mediaType: mediaType || "image/jpeg", name: "page-image" },
  ]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  let text = "";
  try {
    const stream = llm.stream({
      provider: resolved.provider,
      model: resolved.model,
      messages: [{ role: "user", content: admitted }],

      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
    for await (const chunk of stream) {
      if (chunk && (chunk.type === "text-delta" || chunk.type === "text") && typeof chunk.text === "string") {
        text += chunk.text;
      } else if (chunk && chunk.type === "finish" && chunk.kind === "error") {
        throw new Error(chunk.failure?.message ?? "模型调用失败");
      }
    }
  } finally {
    clearTimeout(timer);
  }
  log(`vision call via ${resolved.provider}/${resolved.model}: ${text.length} chars :: ${text.slice(0, 400)}`);
  return { text, provider: resolved.provider, model: resolved.model };
}

/** Extract the first JSON object from a model reply and normalize the question list. */
export function parseVisionQuestions(text) {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : null;
  if (!list) return null;
  const questions = [];
  for (const entry of list) {
    const y = Number(entry?.y ?? entry?.position ?? entry?.percent);
    if (!Number.isFinite(y)) continue;
    if (y < 0 || y > 100) continue;
    questions.push({ label: String(entry?.label ?? entry?.number ?? "").trim(), y });
  }
  questions.sort((a, b) => a.y - b.y);
  // Drop near-duplicates (model sometimes repeats the same row).
  const deduped = [];
  for (const entry of questions) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.y - entry.y) < 1) continue;
    deduped.push(entry);
  }
  return deduped;
}
