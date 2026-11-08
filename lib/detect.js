// Question splitting analysis: turns OCR lines + row ink profile into crop segments.
// Pure functions, no I/O, so it can be unit-tested with the OCR JSON output.
//
// Question numbers normally sit at the start of the line that begins a question's
// content ("题号在解题内容前面"), so detection combines:
//   1. a numbering pattern at the line start,
//   2. the line being a real line start (nothing to its left on the same row),
//   3. the number being followed by content (same line, or the next line),
//   4. a paragraph gap above the line when the page has one,
//   5. a strictly increasing number sequence.

const DOT_STYLE = /^(\d{1,3})\s*[.．。、,，:：;；)）\]】](?![\d])/;
const PAREN_STYLE = /^[（(]\s*(\d{1,3})\s*[)）]/;
const DI_STYLE = /^第\s*(\d{1,3})\s*[题小]/;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const SECTION_STYLE = /^[一二三四五六七八九十百]{1,3}[、.．]/;
const OPTION_STYLE = /^[A-Ha-h][.．、)）]/;
const SOLUTION_WORDS = /^(证明|解|答|求|计算|已知|求证|讨论|判断|选择|填空|化简|分解|若|设)/;

// OCR often confuses 1 with l/I/| and 0 with O/o, so normalize plausible digits.
const OCR_DIGIT_FIX = { l: "1", I: "1", "|": "1", "!": "1", i: "1", O: "0", o: "0", D: "0", Q: "0" };

export function stripSpaces(text) {
  return String(text || "").replace(/\s+/g, "");
}

/** Normalize full-width digits/letters and common OCR digit confusions in leading tokens. */
export function normalizeOcrText(text) {
  let out = stripSpaces(text).replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // Only fix characters that sit inside the leading number/punctuation token.
  const head = out.slice(0, 6);
  const fixedHead = head.replace(/[lI|!iODQo]/g, (ch) => OCR_DIGIT_FIX[ch] ?? ch);
  out = fixedHead + out.slice(6);
  return out;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function lineBottom(line) {
  return line.y + (line.h || 0);
}

function sortLines(lines) {
  return [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function circledToNumber(char) {
  const index = CIRCLED.indexOf(char);
  return index >= 0 ? index + 1 : null;
}

/** Pull a question number out of one line; returns {num, style, rest} or null. */
function matchNumber(compact) {
  let match = compact.match(DOT_STYLE);
  if (match) {
    return { num: Number(match[1]), style: "dot", rest: compact.slice(match[0].length) };
  }
  match = compact.match(PAREN_STYLE);
  if (match) {
    return { num: Number(match[1]), style: "paren", rest: compact.slice(match[0].length) };
  }
  match = compact.match(DI_STYLE);
  if (match) {
    return { num: Number(match[1]), style: "di", rest: compact.slice(match[0].length) };
  }
  match = compact.match(/^第\s*(\d{1,3})\s*题/);
  if (match) {
    return { num: Number(match[1]), style: "di", rest: compact.slice(match[0].length) };
  }
  const circled = circledToNumber(compact[0]);
  if (circled !== null) {
    return { num: circled, style: "circled", rest: compact.slice(1) };
  }
  return null;
}

/**
 * Pick the flattest row (least ink) inside [top, bottom] to cut along.
 * Falls back to the next question's top when the band is too thin.
 */
function pickCutY(prevBottom, nextTop, rowInk, rowScale) {
  const top = Math.max(0, prevBottom + 2);
  const bottom = Math.max(top, nextTop - 2);
  if (!Array.isArray(rowInk) || rowInk.length === 0 || !rowScale) {
    return clamp((prevBottom + nextTop) / 2, prevBottom + 2, nextTop - 2);
  }
  const first = Math.floor(top / rowScale);
  const last = Math.ceil(bottom / rowScale);
  if (last < first) return nextTop - 2;
  const mid = (first + last) / 2;
  let bestRow = first;
  let bestInk = Infinity;
  for (let r = first; r <= last; r += 1) {
    const ink = rowInk[r] ?? Infinity;
    if (ink < bestInk || (ink === bestInk && Math.abs(r - mid) < Math.abs(bestRow - mid))) {
      bestInk = ink;
      bestRow = r;
    }
  }
  const cut = bestRow * rowScale + rowScale / 2;
  return clamp(cut, prevBottom + 2, nextTop - 2);
}

/**
 * Find the last inked row at or below `fromY`; used to trim the final crop
 * instead of trusting OCR to have covered the very last printed line.
 */
function findContentBottom(fromY, imgH, rowInk, rowScale) {
  if (!Array.isArray(rowInk) || rowInk.length === 0 || !rowScale) return imgH;
  const start = clamp(Math.floor((fromY - 2) / rowScale), 0, rowInk.length - 1);
  let row = rowInk.length - 1;
  for (; row > start; row -= 1) {
    if ((rowInk[row] ?? 0) > 0) break;
  }
  return Math.min(imgH, Math.max(fromY, row * rowScale + 2 * rowScale));
}

/**
 * Score how much a candidate looks like a question start.
 * @returns {number} additive score, higher is more likely
 */
function scoreCandidate(candidate, context) {
  const { line, rest } = candidate;
  let score = 10;
  if (candidate.style === "dot") score += 3;
  if (candidate.style === "di") score += 3;
  if (candidate.style === "circled") score += 2;
  if (candidate.style === "paren") score -= 1;

  // The number must be at the visual start of a line: no other text block to its left.
  const leftNeighbour = context.lines.some(
    (other) =>
      other !== line &&
      other.x + other.w <= line.x + 2 &&
      other.y < lineBottom(line) &&
      lineBottom(other) > line.y,
  );
  if (leftNeighbour) score -= 8;

  // Content after the number on the same line, or on the following line.
  const hasRest = stripSpaces(rest).length > 0;
  if (hasRest) score += 4;
  else {
    const next = context.lines.find(
      (other) => other !== line && other.y > line.y && other.y - lineBottom(line) < line.h * 2.4,
    );
    if (next && next.x < line.x + line.w + line.h * 2) score += 1;
    else score -= 3;
  }

  // Solution verbs right after the number are a strong signal ("题号在解题内容前面").
  const restCompact = normalizeOcrText(rest);
  if (SOLUTION_WORDS.test(restCompact)) score += 2;

  // Paragraph gap above the number line.
  const previous = context.lines.filter((other) => other !== line && lineBottom(other) <= line.y + 1).pop();
  if (previous) {
    const gap = line.y - lineBottom(previous);
    if (gap >= Math.max(6, line.h * 0.5)) score += 2;
    else if (gap <= 2) score -= 1;
  } else {
    score += 1; // first text on the page
  }

  // Font height close to body text.
  const ratio = line.h / (context.medianHeight || line.h);
  if (ratio >= 0.7 && ratio <= 1.6) score += 1;
  else if (ratio > 2.2) score -= 2;

  // Left alignment with the main content column is expected for numbered items.
  if (line.x <= context.minX + Math.max(28, context.width * 0.05)) score += 1;
  else score -= 3;

  return score;
}

function candidateFromLine(line, context) {
  const compact = normalizeOcrText(line.text);
  const match = matchNumber(compact);
  if (!match) return null;
  if (OPTION_STYLE.test(compact)) return null;
  if (!Number.isFinite(match.num) || match.num < 1 || match.num > 99) return null;
  const candidate = { line, num: match.num, style: match.style, rest: match.rest };
  candidate.score = scoreCandidate(candidate, context);
  return candidate;
}

/** Greedily keep a strictly increasing numbering sequence, allowing small gaps. */
function selectSequence(candidates) {
  const accepted = [];
  let lastNum = null;
  for (const candidate of candidates) {
    if (lastNum === null) {
      accepted.push(candidate);
      lastNum = candidate.num;
      continue;
    }
    if (candidate.num > lastNum && candidate.num <= lastNum + 3) {
      accepted.push(candidate);
      lastNum = candidate.num;
      continue;
    }
    // A restart at 1 marks a new section (e.g. 选择 1..10 then 填空 1..5).
    if (candidate.num === 1 && accepted.length >= 2) {
      accepted.push(candidate);
      lastNum = candidate.num;
    }
  }
  return accepted;
}

function buildSegments({ accepted, lines, width, height, rowInk, rowScale, padX, skipHeader }) {
  const segments = [];
  const minX = Math.min(...lines.map((line) => line.x));
  const maxRight = Math.max(...lines.map((line) => line.x + line.w));
  const boxLeft = clamp(Math.round(minX - padX), 0, width - 8);
  const boxRight = clamp(Math.round(maxRight + padX), boxLeft + 8, width);
  const contentBoxWidth = boxRight - boxLeft;

  const firstTop = accepted[0].line.y;
  const headerLines = lines.filter((line) => lineBottom(line) <= firstTop - 2);
  if (!skipHeader && headerLines.length > 0 && headerLines[0].y + 4 < firstTop - 30) {
    const headerBottom = Math.max(...headerLines.map(lineBottom));
    const headerEnd = pickCutY(headerBottom, firstTop, rowInk, rowScale);
    const text = headerLines.map((line) => line.text).join(" ");
    if (headerEnd > headerLines[0].y + 20) {
      segments.push({
        kind: "header",
        questionNo: null,
        x: boxLeft,
        y: clamp(Math.round(headerLines[0].y - padX), 0, height - 8),
        w: contentBoxWidth,
        h: Math.max(20, Math.round(headerEnd - Math.max(0, headerLines[0].y - padX))),
        text,
        lineCount: headerLines.length,
      });
    }
  }

  for (let i = 0; i < accepted.length; i += 1) {
    const item = accepted[i];
    const startY = Math.max(0, Math.round(item.line.y - Math.max(8, item.line.h * 0.25)));
    let endY;
    if (i < accepted.length - 1) {
      const nextTop = accepted[i + 1].line.y;
      const insideBottom = Math.max(
        ...lines.filter((line) => line.y >= item.line.y && line.y < nextTop).map(lineBottom),
        lineBottom(item.line),
      );
      endY = Math.round(pickCutY(insideBottom, nextTop, rowInk, rowScale));
    } else {
      const insideBottom = Math.max(
        ...lines.filter((line) => line.y >= item.line.y).map(lineBottom),
        lineBottom(item.line),
      );
      endY = Math.round(findContentBottom(insideBottom, height, rowInk, rowScale) + Math.max(8, item.line.h * 0.3));
    }
    endY = clamp(endY, startY + 16, height);
    const segLines = lines.filter((line) => line.y + line.h > startY && line.y < endY);
    segments.push({
      kind: "question",
      questionNo: item.num,
      x: boxLeft,
      y: startY,
      w: contentBoxWidth,
      h: Math.max(16, endY - startY),
      text: segLines.map((line) => line.text).join(" "),
      lineCount: segLines.length,
    });
  }

  return segments.filter((segment) => segment.h >= 16 && segment.lineCount > 0);
}

/**
 * @param {{lines: Array<{text:string,x:number,y:number,w:number,h:number}>, width:number, height:number, rowInk?: number[], rowInkScale?: number}} ocr
 * @param {{skipHeader?: boolean}} [options]
 */
export function analyzeQuestions(ocr, options = {}) {
  const width = Number(ocr.width) || 0;
  const height = Number(ocr.height) || 0;
  // PowerShell 5.1's ConvertTo-Json renders some arrays as {"value":[...],"Count":n}.
  const rawInk = ocr.rowInk;
  const rowInk = Array.isArray(rawInk) ? rawInk : Array.isArray(rawInk?.value) ? rawInk.value : null;
  const rowScale = Number(ocr.rowInkScale) || 1;

  const rawLines = (ocr.lines || [])
    .filter((line) => line && Number.isFinite(line.y) && Number.isFinite(line.h))
    .filter((line) => stripSpaces(line.text).length > 0)
    .filter((line) => line.h >= 4)
    .map((line) => ({
      text: line.text,
      x: Number(line.x) || 0,
      y: Number(line.y) || 0,
      w: Number(line.w) || 0,
      h: Number(line.h) || 0,
    }));

  const lines = sortLines(rawLines);
  const warnings = [];

  if (lines.length === 0) {
    return { width, height, segments: [], warnings: ["未识别到任何文字，请确认图片清晰、方向正确。"] };
  }

  const minX = Math.min(...lines.map((line) => line.x));
  const context = {
    lines,
    width,
    height,
    minX,
    medianHeight: median(lines.map((line) => line.h).filter((value) => value > 0)),
  };

  // Collect candidates from every numbered style, then let the best-supported
  // style tell us which numbering the page actually uses.
  const byStyle = new Map();
  for (const line of lines) {
    const candidate = candidateFromLine(line, context);
    if (!candidate) continue;
    if (!byStyle.has(candidate.style)) byStyle.set(candidate.style, []);
    byStyle.get(candidate.style).push(candidate);
  }

  const styleEntries = [...byStyle.entries()].map(([style, candidates]) => ({
    style,
    candidates,
    sequence: selectSequence(candidates),
    score:
      candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.score), 0) +
      selectSequence(candidates).length * 8,
  }));
  styleEntries.sort((a, b) => b.sequence.length - a.sequence.length || b.score - a.score);

  const best = styleEntries.find((entry) => entry.sequence.length > 0) ?? null;
  const accepted = best?.sequence ?? [];

  if (accepted.length === 0) {
    warnings.push("未识别到题号（如 1.、2.、3.、(1)、第1题），未做分割。");
    const hasAnyNumberish = lines.some((line) => PAREN_STYLE.test(normalizeOcrText(line.text)) || DOT_STYLE.test(normalizeOcrText(line.text)));
    if (!hasAnyNumberish) warnings.push("图片可能是手写内容，可尝试在面板中把「识别方式」切换为 AI 视觉识别。");
    return { width, height, segments: [], warnings, styleEntries: styleEntries.map((entry) => ({ style: entry.style, count: entry.sequence.length })) };
  }

  if (accepted.length === 1) {
    warnings.push("只识别到 1 个题号，图片可能只含一道题或识别质量不足。");
  }

  const padX = Math.max(12, Math.round(width * 0.012));
  const segments = buildSegments({ accepted, lines, width, height, rowInk, rowScale, padX, skipHeader: options.skipHeader });

  const numbered = segments.filter((segment) => segment.kind === "question").length;
  if (numbered !== accepted.length) {
    warnings.push(`识别到 ${accepted.length} 个题号，但只生成 ${numbered} 个裁切区域，请检查图片质量。`);
  }

  return {
    width,
    height,
    segments,
    warnings,
    style: best.style,
    styleEntries: styleEntries.map((entry) => ({ style: entry.style, count: entry.sequence.length })),
    contentBox: { x: padX, w: width - padX * 2 },
  };
}

/**
 * Turn vision-model question positions (percent of height) into crop segments.
 * Positions are approximate, so each predicted start is snapped to the nearest
 * low-ink row, and a small overlap is kept so text is not lost at the cut.
 *
 * @param {{questions: Array<{label?: string, y: number}>, width: number, height: number,
 *          rowInk?: number[]|{value:number[]}, rowInkScale?: number,
 *          overlapRatio?: number, searchRatio?: number}} input
 */
export function buildVisionSegments(input) {
  const width = Number(input.width) || 0;
  const height = Number(input.height) || 0;
  const rawInk = input.rowInk;
  const rowInk = Array.isArray(rawInk) ? rawInk : Array.isArray(rawInk?.value) ? rawInk.value : null;
  const rowScale = Number(input.rowInkScale) || 1;
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const warnings = [];
  if (width <= 0 || height <= 0 || questions.length === 0) {
    return { segments: [], warnings: ["AI 视觉识别没有返回可用的题号位置。"] };
  }

  // The vision model systematically reports the number line slightly too high
  // (measured bias about +1.8% of page height), so correct it before snapping.
  const biasRatio = Number.isFinite(input.biasRatio) ? input.biasRatio : 0.008;
  const searchRatio = Number.isFinite(input.searchRatio) ? input.searchRatio : 0.02;
  const overlapRatio = Number.isFinite(input.overlapRatio) ? input.overlapRatio : 0.012;
  const overlap = Math.round(height * overlapRatio);

  const snapToLowInk = (y) => {
    if (!Array.isArray(rowInk) || rowInk.length === 0 || !rowScale) return y;
    const lo = Math.max(0, Math.floor((y - height * searchRatio) / rowScale));
    const hi = Math.min(rowInk.length - 1, Math.ceil((y + height * searchRatio) / rowScale));
    if (hi <= lo) return y;
    let bestRow = lo;
    let bestInk = Infinity;
    for (let row = lo; row <= hi; row += 1) {
      const ink = rowInk[row] ?? Infinity;
      const distance = Math.abs(row * rowScale - y);
      if (bestInk === Infinity) {
        bestInk = ink;
        bestRow = row;
        continue;
      }
      // Prefer emptier rows, then rows closer to the prediction.
      if (ink < bestInk - 1 || (Math.abs(ink - bestInk) <= 1 && distance < Math.abs(bestRow * rowScale - y))) {
        bestInk = ink;
        bestRow = row;
      }
    }
    return clamp(bestRow * rowScale, 0, height);
  };

  const starts = questions
    .map((question, index) => ({
      label: String(question?.label ?? "").trim(),
      order: index + 1,
      predicted: clamp(((Number(question?.y) || 0) * height) / 100 + height * biasRatio, 0, height),
    }))
    .sort((a, b) => a.predicted - b.predicted)
    .map((question) => ({ ...question, start: snapToLowInk(question.predicted) }));

  // Keep the sequence strictly increasing with a small minimum height.
  const minGap = Math.max(24, Math.round(height * 0.02));
  const normalized = [];
  for (const question of starts) {
    const previous = normalized[normalized.length - 1];
    let start = question.start;
    if (previous) start = Math.max(start, previous.start + minGap);
    if (start >= height - minGap) continue;
    normalized.push({ ...question, start });
  }
  if (normalized.length === 0) {
    return { segments: [], warnings: ["AI 视觉识别的题号位置无法转换为有效裁切区域。"] };
  }

  const padX = Math.max(14, Math.round(width * 0.018));
  const boxLeft = padX;
  const boxWidth = width - padX * 2;
  const segments = normalized.map((question, index) => {
    const next = normalized[index + 1];
    const start = Math.max(0, Math.round(question.start - (index === 0 ? overlap * 1.8 : overlap)));
    const end = Math.min(height, Math.round((next ? next.start : height) + overlap));
    return {
      kind: "question",
      questionNo: question.label ? Number(String(question.label).replace(/\D+/g, "")) || null : null,
      labelText: question.label || String(question.order),
      x: boxLeft,
      y: start,
      w: boxWidth,
      h: Math.max(24, end - start),
      text: "",
      lineCount: 1,
      source: "vision",
    };
  });

  const first = segments[0];
  if (first && first.y > height * 0.05) {
    warnings.push("第一题上方可能还有内容（页眉或上一题的结尾），已一并保留在第一张图中。");
  }
  return { segments, warnings };
}
