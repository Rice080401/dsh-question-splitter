// Question splitting analysis: turns OCR lines + row ink profile into crop segments.
// Pure functions, no I/O, so it can be unit-tested with the OCR JSON output.

const DOT_STYLE = /^(\d{1,3})[.．。、,，:：)）](?![\d])/;
const PAREN_STYLE = /^[（(]\s*(\d{1,3})\s*[)）]/;
const SECTION_STYLE = /^[一二三四五六七八九十百]{1,3}[、.．]/;
const OPTION_STYLE = /^[A-Ha-h][.．、)）]/;

export function stripSpaces(text) {
  return String(text || "").replace(/\s+/g, "");
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
 * @param {{lines: Array<{text:string,x:number,y:number,w:number,h:number}>, width:number, height:number, rowInk?: number[], rowInkScale?: number}} ocr
 * @param {{language?: string, allowParenNumbering?: boolean, skipHeader?: boolean}} [options]
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
  const maxRight = Math.max(...lines.map((line) => line.x + line.w));
  const leftLimit = minX + Math.max(24, width * 0.035);

  const style = options.allowParenNumbering ? PAREN_STYLE : DOT_STYLE;
  const candidateList = [];
  for (const line of lines) {
    const compact = stripSpaces(line.text);
    if (line.x > leftLimit) continue;
    let match = compact.match(DOT_STYLE);
    if (!match && options.allowParenNumbering) match = compact.match(PAREN_STYLE);
    if (!match) {
      if (SECTION_STYLE.test(compact)) candidateList.push({ line, section: true, num: null });
      continue;
    }
    const num = Number(match[1]);
    if (!Number.isFinite(num) || num < 1 || num > 99) continue;
    if (OPTION_STYLE.test(compact)) continue;
    candidateList.push({ line, num, section: false });
  }

  // Keep a strictly increasing sequence; tolerate up to 2 skipped numbers, and
  // accept a restart at 1 as a new section (common: 选择题 1..10 then 填空 1..5).
  const accepted = [];
  let lastNum = null;
  for (const candidate of candidateList) {
    if (candidate.section) continue;
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
    if (candidate.num === 1 && accepted.length >= 2) {
      accepted.push(candidate);
      lastNum = candidate.num;
    }
  }

  if (accepted.length === 0) {
    if (!options.allowParenNumbering && lines.some((line) => PAREN_STYLE.test(stripSpaces(line.text)))) {
      const retried = analyzeQuestions(ocr, { ...options, allowParenNumbering: true });
      retried.warnings.unshift("未找到「1.」式题号，已改用「（1）」式题号尝试分割。");
      return retried;
    }
    warnings.push("未识别到题号（如 1.、2.、3.），未做分割。");
    return { width, height, segments: [], warnings };
  }

  if (accepted.length === 1) {
    warnings.push("只识别到 1 个题号，图片可能只含一道题或识别质量不足。");
  }

  const segments = [];
  const padX = Math.max(12, Math.round(width * 0.012));
  const boxLeft = clamp(Math.round(minX - padX), 0, width - 8);
  const boxRight = clamp(Math.round(maxRight + padX), boxLeft + 8, width);
  const contentBoxWidth = boxRight - boxLeft;

  // Header block above the first numbered question.
  const firstTop = accepted[0].line.y;
  const headerLines = lines.filter((line) => lineBottom(line) <= firstTop - 2);
  if (!options.skipHeader && headerLines.length > 0 && headerLines[0].y + 4 < firstTop - 30) {
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

  // Drop trailing garbage segments (e.g. a lone footer line) only when empty of lines.
  const cleaned = segments.filter((segment) => segment.h >= 16 && segment.lineCount > 0);

  return { width, height, segments: cleaned, warnings, contentBox: { x: boxLeft, w: contentBoxWidth } };
}
