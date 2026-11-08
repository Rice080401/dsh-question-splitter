/**
 * dsh-question-splitter — host half.
 *
 * Serves a small JSON API used by the browser half:
 *   POST /dsh-question-splitter/api  { method, args }
 *
 * Pipeline for one image (see lib/pipeline.js):
 *   Windows.Media.Ocr (PowerShell) -> question detection -> GDI+ cropping
 *   -> files under <Desktop>\题目分割\<job>\.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processImage, runPowerShellFile } from "./lib/pipeline.js";

const PLUGIN_ID = "dsh-question-splitter";
const API_PREFIX = "/dsh-question-splitter/api";
const OUTPUT_ROOT_NAME = "题目分割";
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

export const name = PLUGIN_ID;
export const inject = ["webServer"];

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(pluginDir, "scripts");
const dataDir = path.join(pluginDir, ".data");
const tmpDir = path.join(dataDir, "tmp");
const thumbDirRoot = path.join(dataDir, "thumbs");
const logDir = path.join(dataDir, "logs");
const logFile = path.join(logDir, "plugin.log");

let logger = null;
let desktopDirCache = null;
let languagesCache = null;
const jobs = new Map();
let splitChain = Promise.resolve();

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    logger?.info?.(line);
  } catch {}
  fs.mkdir(logDir, { recursive: true })
    .then(() => fs.appendFile(logFile, text, "utf8"))
    .catch(() => {});
}

async function ensureDirs() {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(thumbDirRoot, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });
}

/** Drop stale scratch files and week-old preview thumbnails on startup. */
async function cleanupData() {
  try {
    for (const name of await fs.readdir(tmpDir).catch(() => [])) {
      await fs.rm(path.join(tmpDir, name), { recursive: true, force: true }).catch(() => {});
    }
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const name of await fs.readdir(thumbDirRoot).catch(() => [])) {
      const target = path.join(thumbDirRoot, name);
      const stat = await fs.stat(target).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  } catch {}
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function resolveDesktopDir() {
  if (desktopDirCache) return desktopDirCache;
  const candidates = [];
  try {
    const result = await runPowerShellFile(scriptsDir, "desktop-path.ps1", [], { timeoutMs: 20_000 });
    const value = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    if (value) candidates.push(value.replace(/^"|"$/g, ""));
  } catch {}
  candidates.push(path.join(os.homedir(), "Desktop"));
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      desktopDirCache = candidate;
      return candidate;
    }
  }
  desktopDirCache = candidates[candidates.length - 1];
  return desktopDirCache;
}

async function availableLanguages() {
  if (languagesCache) return languagesCache;
  let tags = [];
  try {
    const result = await runPowerShellFile(scriptsDir, "languages.ps1", [], { timeoutMs: 30_000 });
    tags = result.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {}
  languagesCache = tags;
  return tags;
}

function sanitizeName(input, fallback = "未命名") {
  let value = String(input ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  value = value.replace(/^[.\s]+|[.\s]+$/g, "");
  if (!value) value = fallback;
  if (value.length > 60) value = value.slice(0, 60);
  return value;
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
}

function newJobId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertJobId(jobId) {
  if (typeof jobId !== "string" || !/^job-[a-z0-9-]{1,60}$/u.test(jobId)) {
    throw new Error("无效的任务标识。");
  }
}

function decodeImagePayload(dataUrl, fileName) {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) throw new Error("缺少图片数据。");
  const match = /^data:([^;,]*);base64,(.*)$/su.exec(dataUrl);
  const base64 = match ? match[2] : dataUrl;
  let ext = "png";
  const nameExt = /\.(png|jpe?g|bmp|gif|tiff?|webp)$/iu.exec(String(fileName ?? ""));
  if (nameExt) {
    ext = nameExt[1].toLowerCase().replace("jpeg", "jpg");
  } else if (match) {
    const mime = match[1].toLowerCase();
    if (mime.includes("jpeg")) ext = "jpg";
    else if (mime.includes("bmp")) ext = "bmp";
    else if (mime.includes("gif")) ext = "gif";
    else if (mime.includes("tiff")) ext = "tiff";
    else if (mime.includes("webp")) ext = "webp";
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw new Error("图片数据为空。");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("图片过大（超过 40MB），请压缩后再试。");
  return { buffer, ext };
}

function enqueue(task) {
  const next = splitChain.then(task, task);
  splitChain = next.catch(() => {});
  return next;
}

async function createJob(title) {
  const desktop = await resolveDesktopDir();
  const root = path.join(desktop, OUTPUT_ROOT_NAME);
  const base = sanitizeName(title, "题目");
  let dir = path.join(root, `${base}-${timestamp()}`);
  let index = 2;
  while (existsSync(dir)) {
    dir = path.join(root, `${base}-${timestamp()}-${index}`);
    index += 1;
  }
  await fs.mkdir(dir, { recursive: true });
  const job = { id: newJobId(), dir, title: base, createdAt: new Date().toISOString(), pages: [] };
  jobs.set(job.id, job);
  if (jobs.size > 40) {
    const oldest = [...jobs.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    if (oldest) jobs.delete(oldest.id);
  }
  log(`job created ${job.id} -> ${dir}`);
  return job;
}

async function splitOnePage(args) {
  const jobId = args?.jobId;
  assertJobId(jobId);
  const job = jobs.get(jobId);
  if (!job) throw new Error("任务已失效，请重新开始。");

  const pageIndex = Number.isFinite(Number(args.pageIndex)) ? Math.max(1, Number(args.pageIndex)) : 1;
  const pageCount = Number.isFinite(Number(args.pageCount)) ? Math.max(1, Number(args.pageCount)) : 1;
  const language = typeof args.language === "string" && args.language.trim() ? args.language.trim() : "auto";
  const format = args.format === "jpg" ? "jpg" : "png";
  const quality = Number.isFinite(Number(args.quality)) ? Math.min(100, Math.max(40, Number(args.quality))) : 92;
  const fileName = sanitizeName(args.fileName, `第${pageIndex}页`);

  await ensureDirs();
  const { buffer, ext } = decodeImagePayload(args.dataUrl, args.fileName);
  const pageKey = `p${String(pageIndex).padStart(2, "0")}`;
  const workDir = path.join(tmpDir, jobId, pageKey);
  const thumbDir = path.join(thumbDirRoot, jobId, pageKey);

  const result = await processImage({
    imageBuffer: buffer,
    ext,
    fileName,
    pageIndex,
    pageCount,
    language,
    format,
    quality,
    jobDir: job.dir,
    workDir,
    thumbDir,
    scriptsDir,
    log,
  });

  job.pages = job.pages.filter((page) => page.pageIndex !== pageIndex);
  job.pages.push({
    pageIndex,
    fileName,
    imageWidth: result.width,
    imageHeight: result.height,
    language: result.language,
    empty: result.empty,
    warnings: result.warnings,
    items: result.items.map((item) => ({
      label: item.label,
      questionNo: item.questionNo,
      fileName: item.fileName,
      width: item.width,
      height: item.height,
      text: item.text,
    })),
  });
  await writeJson(path.join(job.dir, "manifest.json"), {
    title: job.title,
    createdAt: job.createdAt,
    generator: PLUGIN_ID,
    pages: [...job.pages].sort((a, b) => a.pageIndex - b.pageIndex),
  });

  return {
    ...result,
    jobDir: job.dir,
  };
}

async function revealFile(args) {
  const jobId = args?.jobId;
  assertJobId(jobId);
  const job = jobs.get(jobId);
  if (!job) throw new Error("任务已失效，请重新开始。");
  const fileName = path.basename(String(args?.fileName ?? ""));
  if (!fileName) throw new Error("缺少文件名。");
  const filePath = path.join(job.dir, fileName);
  if (!existsSync(filePath)) throw new Error("文件不存在，可能已被移动或删除。");
  const child = spawn("explorer.exe", ["/select,", filePath], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return { ok: true, file: filePath };
}

async function openFolder(args) {
  let dir = null;
  if (args?.jobId) {
    assertJobId(args.jobId);
    dir = jobs.get(args.jobId)?.dir ?? null;
  }
  if (!dir && typeof args?.dir === "string") dir = args.dir;
  if (!dir) {
    const desktop = await resolveDesktopDir();
    dir = path.join(desktop, OUTPUT_ROOT_NAME);
    await fs.mkdir(dir, { recursive: true });
  }
  if (!existsSync(dir)) throw new Error("输出文件夹不存在。");
  const child = spawn("explorer.exe", [dir], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return { ok: true, dir };
}

async function dispatch(method, args) {
  switch (method) {
    case "hello": {
      log("client half connected");
      const desktop = await resolveDesktopDir();
      return { ok: true, plugin: PLUGIN_ID, version: "1.0.0", desktop, outputDir: path.join(desktop, OUTPUT_ROOT_NAME) };
    }
    case "status": {
      const desktop = await resolveDesktopDir();
      return {
        ok: true,
        desktop,
        outputDir: path.join(desktop, OUTPUT_ROOT_NAME),
        languages: await availableLanguages(),
      };
    }
    case "beginJob": {
      const job = await createJob(args?.title ?? "题目");
      return { ok: true, jobId: job.id, dir: job.dir };
    }
    case "split":
      return await enqueue(() => splitOnePage(args));
    case "openFolder":
      return await openFolder(args);
    case "reveal":
      return await revealFile(args);
    case "log":
      log(`[client] ${String(args?.message ?? "").slice(0, 2000)}`);
      return { ok: true };
    default:
      throw new Error(`未知方法：${String(method)}`);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求体过大。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("请求体不是合法 JSON。"));
      }
    });
    req.on("error", reject);
  });
}

export function apply(ctx) {
  try {
    logger = ctx.logger?.("question-splitter") ?? null;
  } catch {
    logger = null;
  }
  ensureDirs()
    .then(cleanupData)
    .catch(() => {});
  log(`plugin applied; scripts=${scriptsDir}`);

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
          const respond = (status, payload) => {
            res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(payload));
          };
          if (req.method !== "POST") {
            respond(405, { ok: false, error: "method not allowed" });
            return;
          }
          try {
            const payload = await readJsonBody(req);
            const result = await dispatch(payload.method, payload.args ?? {});
            respond(200, result);
          } catch (error) {
            log(`ERROR ${String(error?.stack ?? error?.message ?? error)}`);
            respond(200, { ok: false, error: String(error?.message ?? error) });
          }
        },
      }),
    "dsh-question-splitter: api routes",
  );
}
