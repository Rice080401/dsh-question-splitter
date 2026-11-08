// Image -> OCR -> question detection -> cropped files.
// Kept separate from the Cordis plumbing so the exact same code path can be
// exercised by a plain Node script during development.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { analyzeQuestions } from "./detect.js";

export const POWERSHELL =
  process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";

export function runProcess(command, args, options = {}) {
  const { timeoutMs = 180_000, cwd } = options;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error(`命令超时（${Math.round(timeoutMs / 1000)} 秒）：${path.basename(command)}`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export function runPowerShellFile(scriptsDir, scriptName, args, options = {}) {
  return runProcess(
    POWERSHELL,
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, scriptName), ...args],
    options,
  );
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value), "utf8");
}

export function extForFormat(format) {
  return format === "jpg" ? "jpg" : "png";
}

/**
 * Full pipeline for a single page image.
 *
 * @param {object} options
 * @param {Buffer} options.imageBuffer raw image bytes
 * @param {string} options.ext source extension (png/jpg/...)
 * @param {string} options.fileName original file name, used in the manifest
 * @param {number} options.pageIndex 1-based page number
 * @param {number} options.pageCount total pages in this batch
 * @param {string} options.language OCR language tag, or "auto"
 * @param {string} options.format output format: png | jpg
 * @param {number} options.quality JPG quality
 * @param {string} options.jobDir output directory for cropped images
 * @param {string} options.workDir scratch directory for this page
 * @param {string} options.thumbDir directory for preview thumbnails
 * @param {string} options.scriptsDir directory holding ocr.ps1 / split.ps1
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ok:boolean, empty:boolean, width:number, height:number, language:string|null, items:Array, warnings:string[], elapsedMs:number}>}
 */
export async function processImage(options) {
  const {
    imageBuffer,
    ext,
    fileName,
    pageIndex,
    pageCount,
    language,
    format,
    quality,
    jobDir,
    workDir,
    thumbDir,
    scriptsDir,
    log = () => {},
  } = options;

  const started = Date.now();
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(thumbDir, { recursive: true });
  await fs.mkdir(jobDir, { recursive: true });

  const imagePath = path.join(workDir, `source.${ext}`);
  await fs.writeFile(imagePath, imageBuffer);

  const ocrOut = path.join(workDir, "ocr.json");
  const languageAttempts = !language || language === "auto" ? ["zh-Hans-CN", "en-US"] : [language];
  let ocr = null;
  let lastError = null;
  for (const attempt of languageAttempts) {
    await fs.rm(ocrOut, { force: true });
    const result = await runPowerShellFile(scriptsDir, "ocr.ps1", ["-Path", imagePath, "-OutFile", ocrOut, "-Lang", attempt], {
      timeoutMs: 180_000,
    });
    if (!existsSync(ocrOut)) {
      lastError = new Error(`OCR 未产生结果：${result.stderr.trim() || `exit ${result.code}`}`);
      continue;
    }
    const parsed = await readJson(ocrOut);
    if (parsed.ok) {
      ocr = parsed;
      break;
    }
    lastError = new Error(parsed.error || "OCR 识别失败");
  }
  if (!ocr) throw lastError ?? new Error("OCR 识别失败");
  if (ocr.width === 0 || ocr.height === 0) throw new Error("无法读取图片尺寸，请确认文件是有效图片。");

  const analysis = analyzeQuestions(ocr, {});
  const warnings = [...analysis.warnings];

  if (analysis.segments.length === 0) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    return {
      ok: true,
      empty: true,
      width: analysis.width,
      height: analysis.height,
      language: ocr.lang ?? null,
      items: [],
      warnings: warnings.length ? warnings : ["未识别到题号，未生成分割图片。"],
      elapsedMs: Date.now() - started,
    };
  }

  const outputFormat = extForFormat(format);
  let questionOrdinal = 0;
  const segments = analysis.segments.map((segment, segmentIndex) => {
    const isHeader = segment.kind === "header";
    if (!isHeader) questionOrdinal += 1;
    const ordinal = String(questionOrdinal).padStart(2, "0");
    const pagePrefix = pageCount > 1 ? `P${pageIndex}_` : "";
    const baseName = isHeader ? `${pagePrefix}00_卷头` : `${pagePrefix}第${ordinal}题`;
    return {
      index: segmentIndex,
      label: isHeader ? "卷头" : `第${questionOrdinal}题`,
      questionNo: segment.questionNo ?? null,
      isHeader,
      x: segment.x,
      y: segment.y,
      w: segment.w,
      h: segment.h,
      text: segment.text ?? "",
      fileName: `${baseName}.${outputFormat}`,
      thumbName: `${String(segmentIndex + 1).padStart(2, "0")}.jpg`,
    };
  });

  const specFile = path.join(workDir, "split-spec.json");
  const splitOut = path.join(workDir, "split-result.json");
  await writeJson(specFile, {
    image: imagePath,
    outDir: jobDir,
    thumbDir,
    format: outputFormat,
    quality,
    thumbWidth: 520,
    segments: segments.map((segment) => ({
      index: segment.index,
      label: segment.label,
      questionNo: segment.questionNo,
      x: segment.x,
      y: segment.y,
      w: segment.w,
      h: segment.h,
      fileName: segment.fileName,
      thumbName: segment.thumbName,
    })),
  });

  const splitProcess = await runPowerShellFile(scriptsDir, "split.ps1", ["-SpecFile", specFile, "-OutFile", splitOut], {
    timeoutMs: 180_000,
  });
  if (!existsSync(splitOut)) {
    throw new Error(`裁剪失败：${splitProcess.stderr.trim() || `exit ${splitProcess.code}`}`);
  }
  const splitResult = await readJson(splitOut);
  if (!splitResult.ok) throw new Error(splitResult.error || "裁剪失败");

  const items = [];
  for (const item of splitResult.items ?? []) {
    const segment = segments.find((candidate) => candidate.index === item.index) ?? {};
    let thumbDataUrl = null;
    try {
      if (item.thumb && existsSync(item.thumb)) {
        const thumbBuffer = await fs.readFile(item.thumb);
        thumbDataUrl = `data:image/jpeg;base64,${thumbBuffer.toString("base64")}`;
      }
    } catch {}
    items.push({
      label: item.label,
      questionNo: item.questionNo ?? null,
      isHeader: Boolean(segment.isHeader),
      fileName: item.fileName,
      width: item.width,
      height: item.height,
      text: segment.text ?? "",
      thumbDataUrl,
    });
  }

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  log(
    `page ${pageIndex} (${fileName}): ${items.length} segment(s) from ${analysis.width}x${analysis.height} in ${
      Date.now() - started
    }ms -> ${jobDir}`,
  );

  return {
    ok: true,
    empty: false,
    width: analysis.width,
    height: analysis.height,
    language: ocr.lang ?? null,
    items,
    warnings,
    elapsedMs: Date.now() - started,
  };
}
