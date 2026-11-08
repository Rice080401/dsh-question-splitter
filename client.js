window.__ModuleLoader__.load({
  id: "dsh-question-splitter",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const react = require("react");
    const h = react.createElement;

    const PANEL_ID = "question-splitter";
    const PANEL_LABEL = "题目分割";
    const API_URL = "/dsh-question-splitter/api";
    const PLUGIN_ID = "dsh-question-splitter";

    //#region styles
    const CSS = `
.qsp-root {
  /* Colors come from the host design tokens so the panel follows the active
     DSH light/dark theme; the hard-coded values are only fallbacks. */
  --qsp-text: var(--dsw-alias-label-primary, #1f2328);
  --qsp-text-2: var(--dsw-alias-label-secondary, #5c6470);
  --qsp-text-3: var(--dsw-alias-label-caption, #8a919f);
  --qsp-border: var(--dsw-alias-border-l2, #e3e6eb);
  --qsp-border-strong: var(--dsw-alias-border-l3, #d0d5dd);
  --qsp-bg: var(--dsw-alias-bg-base, #f7f8fa);
  --qsp-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --qsp-surface-2: var(--dsw-alias-bg-layer-2, #f3f4f6);
  --qsp-hover: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --qsp-brand: var(--dsw-alias-link, #4d6bfe);
  --qsp-brand-strong: var(--dsw-alias-link, #3b56e0);
  --qsp-brand-tint: color-mix(in srgb, var(--qsp-brand) 14%, transparent);
  --qsp-ok: var(--dsw-alias-state-success-primary, #15803d);
  --qsp-warn: var(--dsw-alias-state-warn-label, #a16207);
  --qsp-danger: var(--dsw-alias-label-error, #b91c1c);
  --qsp-alert-bg: var(--dsw-alias-bg-layer-2, #f3f4f6);
  --qsp-toast-bg: var(--dsw-alias-toast-bg, rgba(30, 34, 41, 0.92));
  --qsp-toast-text: var(--dsw-alias-toast-label, #ffffff);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  color: var(--qsp-text);
  background: var(--qsp-bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
.qsp-root * { box-sizing: border-box; }
.qsp-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--qsp-border);
  background: var(--qsp-surface);
}
.qsp-header-icon { display: flex; color: var(--qsp-brand); }
.qsp-title { font-size: 15px; font-weight: 600; line-height: 1.2; }
.qsp-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--qsp-brand-strong);
  background: var(--qsp-brand-tint);
  border-radius: 999px;
  padding: 2px 8px;
}
.qsp-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--qsp-text-3);
  cursor: pointer;
}
.qsp-close:hover { background: var(--qsp-hover); color: var(--qsp-text); }
.qsp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.qsp-card {
  background: var(--qsp-surface);
  border: 1px solid var(--qsp-border);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
}
.qsp-lead { margin: 0 0 14px; color: var(--qsp-text-2); font-size: 12.5px; line-height: 1.7; }
.qsp-lead b { color: var(--qsp-text); font-weight: 600; }
.qsp-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
.qsp-field { display: flex; align-items: center; gap: 7px; }
.qsp-field-label { color: var(--qsp-text-2); font-size: 12.5px; white-space: nowrap; }
.qsp-select {
  height: 30px;
  border: 1px solid var(--qsp-border-strong);
  border-radius: 8px;
  background: var(--qsp-surface);
  color: var(--qsp-text);
  font-size: 12.5px;
  padding: 0 8px;
  outline: none;
}
.qsp-select:focus { border-color: var(--qsp-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--qsp-brand) 18%, transparent); }
.qsp-save-hint {
  margin-left: auto;
  color: var(--qsp-text-3);
  font-size: 11.5px;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qsp-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 26px 18px;
  border: 1.5px dashed var(--qsp-border-strong);
  border-radius: 12px;
  background: var(--qsp-surface-2);
  color: var(--qsp-text-2);
  cursor: pointer;
  transition: border-color .15s, background-color .15s;
  text-align: center;
}
.qsp-drop:hover, .qsp-drop.qsp-over {
  border-color: var(--qsp-brand);
  background: var(--qsp-brand-tint);
}
.qsp-drop-icon { color: var(--qsp-brand); display: flex; }
.qsp-drop-title { font-size: 13px; color: var(--qsp-text); font-weight: 500; }
.qsp-drop-sub { font-size: 11.5px; color: var(--qsp-text-3); }
.qsp-files { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.qsp-file {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--qsp-border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--qsp-surface);
}
.qsp-file-thumb {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--qsp-surface-2);
  border: 1px solid var(--qsp-border);
  flex: none;
}
.qsp-file-info { min-width: 0; flex: 1; }
.qsp-file-name {
  font-size: 12.5px;
  color: var(--qsp-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qsp-file-meta { font-size: 11.5px; color: var(--qsp-text-3); margin-top: 2px; }
.qsp-file-meta.qsp-ok { color: var(--qsp-ok); }
.qsp-file-meta.qsp-err { color: var(--qsp-danger); }
.qsp-file-remove {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--qsp-text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qsp-file-remove:hover { background: color-mix(in srgb, var(--qsp-danger) 12%, transparent); color: var(--qsp-danger); }
.qsp-file-remove:disabled { opacity: .4; cursor: not-allowed; }
.qsp-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.qsp-btn {
  height: 34px;
  padding: 0 16px;
  border-radius: 9px;
  border: 1px solid var(--qsp-border-strong);
  background: var(--qsp-surface);
  color: var(--qsp-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background-color .14s, border-color .14s;
}
.qsp-btn:hover:not(:disabled) { background: var(--qsp-hover); }
.qsp-btn:disabled { opacity: .5; cursor: not-allowed; }
.qsp-btn-primary {
  background: var(--qsp-brand);
  border-color: var(--qsp-brand);
  color: #fff;
}
.qsp-btn-primary:hover:not(:disabled) { background: var(--qsp-brand-strong); border-color: var(--qsp-brand-strong); }
.qsp-btn-ghost { border-color: transparent; color: var(--qsp-text-2); }
.qsp-btn-ghost:hover:not(:disabled) { background: var(--qsp-hover); }
.qsp-progress { display: flex; align-items: center; gap: 8px; margin-top: 12px; color: var(--qsp-text-2); font-size: 12.5px; }
.qsp-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--qsp-border-strong);
  border-top-color: var(--qsp-brand);
  animation: qsp-spin .7s linear infinite;
  flex: none;
}
@keyframes qsp-spin { to { transform: rotate(360deg); } }
.qsp-alert {
  margin-top: 12px;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.6;
  background: var(--qsp-alert-bg);
  color: var(--qsp-warn);
}
.qsp-alert-error { background: color-mix(in srgb, var(--qsp-danger) 10%, transparent); color: var(--qsp-danger); }
.qsp-results-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.qsp-results-title { font-size: 13.5px; font-weight: 600; }
.qsp-results-count { font-size: 12px; color: var(--qsp-text-3); }
.qsp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
}
.qsp-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--qsp-border);
  border-radius: 10px;
  background: var(--qsp-surface);
  cursor: pointer;
  text-align: left;
  transition: box-shadow .15s, transform .15s, border-color .15s;
}
.qsp-item:hover { border-color: var(--qsp-border-strong); transform: translateY(-1px); box-shadow: 0 3px 10px rgba(16,24,40,.08); }
.qsp-item img {
  width: 100%;
  height: 130px;
  object-fit: contain;
  background: #fff;
  border: 1px solid var(--qsp-border);
  border-radius: 6px;
}
.qsp-item-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.qsp-item-meta b { font-weight: 600; color: var(--qsp-text); }
.qsp-item-meta span { color: var(--qsp-text-3); font-size: 11.5px; margin-left: auto; }
.qsp-footer { margin-top: auto; padding-top: 4px; color: var(--qsp-text-3); font-size: 11.5px; line-height: 1.7; }
.qsp-empty { color: var(--qsp-text-3); font-size: 12.5px; padding: 8px 2px; }

`;
    const styleTagId = "@dsh-question-splitter/styles";
    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.querySelector(`style[data-plugin-css="${styleTagId}"]`)) return;
      const tag = document.createElement("style");
      tag.setAttribute("data-plugin-css", styleTagId);
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
    //#endregion

    //#region icons
    function SplitIcon(props) {
      const size = props?.size ?? 18;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        h("rect", { x: 3.5, y: 3.5, width: 17, height: 17, rx: 3 }),
        h("path", { d: "M3.5 12h17", strokeDasharray: "2.4 2.6" }),
        h("path", { d: "M8 7.6h8" }),
        h("path", { d: "M8 16.4h4.4" }),
      );
    }
    function CloseIcon() {
      return h(
        "svg",
        { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": "true" },
        h("path", { d: "M6 6l12 12M18 6L6 18" }),
      );
    }
    function UploadIcon() {
      return h(
        "svg",
        { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
        h("path", { d: "M12 16V4" }),
        h("path", { d: "M7.5 8.5L12 4l4.5 4.5" }),
        h("path", { d: "M4.5 15v3.2A1.8 1.8 0 0 0 6.3 20h11.4a1.8 1.8 0 0 0 1.8-1.8V15" }),
      );
    }
    function FolderIcon() {
      return h(
        "svg",
        { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
        h("path", { d: "M3.5 7.5A1.5 1.5 0 0 1 5 6h4l1.6 2H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V7.5z" }),
      );
    }
    function XSmallIcon() {
      return h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": "true" },
        h("path", { d: "M6 6l12 12M18 6L6 18" }),
      );
    }
    //#endregion

    //#region api
    async function callApi(method, args, timeoutMs = 300_000) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let response;
      try {
        response = await fetch(API_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method, args: args ?? {} }),
          signal: controller?.signal,
        });
      } catch (error) {
        if (timer) clearTimeout(timer);
        throw new Error(`无法连接插件服务：${error?.message ?? error}`);
      }
      if (timer) clearTimeout(timer);
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(`插件服务返回了无法解析的响应（HTTP ${response.status}）`);
      }
      if (!data || data.ok === false) throw new Error(data?.error || `插件服务错误（HTTP ${response.status}）`);
      return data;
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return "";
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function baseTitle(fileName) {
      const name = String(fileName ?? "").replace(/\.[^.]+$/, "").trim();
      return name || "题目";
    }

    let fileSeq = 0;
    function nextId() {
      fileSeq += 1;
      return `f${Date.now()}-${fileSeq}`;
    }
    //#endregion

    //#region components
    function FileRow(props) {
      const { item, index, total, disabled, onRemove } = props;
      const metaClass =
        item.status === "done" ? "qsp-file-meta qsp-ok" : item.status === "error" ? "qsp-file-meta qsp-err" : "qsp-file-meta";
      let meta = formatBytes(item.size);
      if (item.status === "processing") meta = "正在识别…";
      if (item.status === "done") meta = `已分割 ${item.count ?? 0} 张 · 第 ${index + 1}/${total} 页`;
      if (item.status === "error") meta = item.error || "识别失败";
      return h(
        "li",
        { className: "qsp-file" },
        item.previewUrl
          ? h("img", { className: "qsp-file-thumb", src: item.previewUrl, alt: "" })
          : h("div", { className: "qsp-file-thumb" }),
        h(
          "div",
          { className: "qsp-file-info" },
          h("div", { className: "qsp-file-name", title: item.name }, item.name),
          h("div", { className: metaClass }, meta),
        ),
        h(
          "button",
          {
            type: "button",
            className: "qsp-file-remove",
            title: "移除",
            disabled: disabled,
            onClick: () => onRemove(item.id),
          },
          h(XSmallIcon, null),
        ),
      );
    }

    function ResultCard(props) {
      const { item, onReveal } = props;
      return h(
        "button",
        {
          type: "button",
          className: "qsp-item",
          title: item.text ? `${item.label}\n${item.text}` : item.label,
          onClick: () => onReveal(item),
        },
        item.thumbDataUrl ? h("img", { src: item.thumbDataUrl, alt: item.label, loading: "lazy" }) : h("div", { className: "qsp-item" }),
        h(
          "div",
          { className: "qsp-item-meta" },
          h("b", null, item.label),
          item.questionNo ? h("span", { style: { color: "var(--qsp-text-3)", fontSize: "11px" } }, `题号 ${item.questionNo}`) : null,
          h("span", null, `${item.width}×${item.height}`),
        ),
      );
    }

    function Panel(props) {
      const { layout } = props;
      const [files, setFiles] = react.useState([]);
      const [running, setRunning] = react.useState(false);
      const [progress, setProgress] = react.useState(null);
      const [language, setLanguage] = react.useState("auto");
      const [format, setFormat] = react.useState("png");
      const [mode, setMode] = react.useState("auto");
      const [jobId, setJobId] = react.useState(null);
      const [jobDir, setJobDir] = react.useState(null);
      const [results, setResults] = react.useState([]);
      const [warnings, setWarnings] = react.useState([]);
      const [status, setStatus] = react.useState(null);
      const [dragOver, setDragOver] = react.useState(false);
      const [error, setError] = react.useState(null);
      const [toast, setToast] = react.useState(null);
      const inputRef = react.useRef(null);
      const rootRef = react.useRef(null);
      const filesRef = react.useRef(files);
      filesRef.current = files;

      react.useEffect(() => {
        ensureStyle();
        let cancelled = false;
        callApi("hello")
          .then((data) => {
            if (cancelled) return;
            setStatus(data);
          })
          .catch((err) => {
            if (cancelled) return;
            setError(String(err?.message ?? err));
          });
        callApi("status").then((data) => {
          if (!cancelled) setStatus(data);
        }).catch(() => {});
        return () => {
          cancelled = true;
        };
      }, []);

      react.useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => setToast(null), 2600);
        return () => clearTimeout(timer);
      }, [toast]);

      const addFiles = react.useCallback((fileList) => {
        const incoming = Array.from(fileList ?? []).filter((file) => /^image\//i.test(file.type || "") || /\.(png|jpe?g|bmp|gif|tiff?|webp)$/i.test(file.name || ""));
        if (incoming.length === 0) {
          setToast("没有检测到图片文件");
          return;
        }
        setError(null);
        setFiles((previous) => {
          const next = [...previous];
          for (const file of incoming) {
            next.push({
              id: nextId(),
              file,
              name: file.name || "粘贴的图片",
              size: file.size,
              previewUrl: URL.createObjectURL(file),
              status: "pending",
              error: null,
              count: 0,
            });
          }
          return next;
        });
      }, []);

      const removeFile = react.useCallback((id) => {
        setFiles((previous) => {
          const target = previous.find((item) => item.id === id);
          if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
          return previous.filter((item) => item.id !== id);
        });
      }, []);

      const clearAll = react.useCallback(() => {
        setFiles((previous) => {
          for (const item of previous) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          return [];
        });
        setResults([]);
        setWarnings([]);
        setJobId(null);
        setJobDir(null);
        setProgress(null);
        setError(null);
      }, []);

      const openFolder = react.useCallback(async () => {
        try {
          await callApi("openFolder", jobId ? { jobId } : {}, 20_000);
        } catch (err) {
          setToast(String(err?.message ?? err));
        }
      }, [jobId]);

      const revealItem = react.useCallback(
        async (item) => {
          try {
            await callApi("reveal", { jobId, fileName: item.fileName }, 20_000);
          } catch (err) {
            setToast(String(err?.message ?? err));
          }
        },
        [jobId],
      );

      const start = react.useCallback(async () => {
        const pending = filesRef.current.filter((item) => item.status === "pending" || item.status === "error");
        if (pending.length === 0 || running) return;
        setRunning(true);
        setError(null);
        setWarnings([]);
        const pageCount = filesRef.current.length;
        let activeJobId = jobId;
        try {
          if (!activeJobId) {
            const created = await callApi("beginJob", { title: baseTitle(filesRef.current[0]?.name) });
            activeJobId = created.jobId;
            setJobId(activeJobId);
            setJobDir(created.dir);
          }
        } catch (err) {
          setRunning(false);
          setError(`创建输出文件夹失败：${err?.message ?? err}`);
          return;
        }

        for (let index = 0; index < filesRef.current.length; index += 1) {
          const item = filesRef.current[index];
          if (item.status === "done") continue;
          setProgress({ index, total: pageCount });
          setFiles((previous) => previous.map((entry) => (entry.id === item.id ? { ...entry, status: "processing", error: null } : entry)));
          try {
            const dataUrl = await fileToDataUrl(item.file);
            const response = await callApi("split", {
              jobId: activeJobId,
              pageIndex: index + 1,
              pageCount,
              fileName: item.name,
              dataUrl,
              language,
              format,
              mode,
            });
            const items = Array.isArray(response.items) ? response.items : [];
            setResults((previous) => [...previous, ...items]);
            if (Array.isArray(response.warnings) && response.warnings.length > 0) {
              setWarnings((previous) => [...previous, ...response.warnings.map((text) => `第 ${index + 1} 页：${text}`)]);
            }
            setFiles((previous) =>
              previous.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: "done", count: items.length, error: null }
                  : entry,
              ),
            );
          } catch (err) {
            const message = String(err?.message ?? err);
            setFiles((previous) =>
              previous.map((entry) => (entry.id === item.id ? { ...entry, status: "error", error: message } : entry)),
            );
            setWarnings((previous) => [...previous, `第 ${index + 1} 页处理失败：${message}`]);
          }
        }
        setProgress(null);
        setRunning(false);
        setToast("分割完成，文件已保存");
      }, [format, jobId, language, mode, running]);

      const onDrop = react.useCallback(
        (event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer?.files);
        },
        [addFiles],
      );

      react.useEffect(() => {
        const onPaste = (event) => {
          const items = event.clipboardData?.items;
          if (!items || items.length === 0) return;
          const filesFound = [];
          for (const item of items) {
            if (item.kind === "file") {
              const file = item.getAsFile();
              if (file) filesFound.push(file);
            }
          }
          if (filesFound.length > 0) {
            event.preventDefault();
            addFiles(filesFound);
          }
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
      }, [addFiles]);

      const hasPending = files.some((item) => item.status === "pending" || item.status === "error");
      const doneCount = files.filter((item) => item.status === "done").length;
      const progressText = progress ? `正在识别第 ${progress.index + 1} / ${progress.total} 张图片…` : null;

      return h(
        "div",
        { className: "qsp-root", ref: rootRef },
        h(
          "div",
          { className: "qsp-header" },
          h("span", { className: "qsp-header-icon" }, h(SplitIcon, { size: 20 })),
          h("span", { className: "qsp-title" }, "题目分割器"),
          h("span", { className: "qsp-badge" }, "本地 OCR + AI 视觉"),
          h(
            "button",
            { type: "button", className: "qsp-close", title: "关闭面板", onClick: () => layout?.selectPanel?.(null) },
            h(CloseIcon, null),
          ),
        ),
        h(
          "div",
          { className: "qsp-body" },
          h(
            "section",
            { className: "qsp-card" },
            h(
              "p",
              { className: "qsp-lead" },
              "上传整页题目图片，自动识别 ",
              h("b", null, "题号（1. 2. 3.、(1)、第1题…）"),
              " 并把每一题切成独立图片，保存到桌面「",
              h("b", null, "题目分割"),
              "」文件夹。默认先用本机 OCR；若一页里识别不到题号（例如手写笔记），「自动」模式会改用 AI 视觉识别，此时该页图片会发送给你配置的模型。",
            ),
            h(
              "div",
              { className: "qsp-options" },
              h(
                "div",
                { className: "qsp-field" },
                h("span", { className: "qsp-field-label" }, "识别方式"),
                h(
                  "select",
                  {
                    className: "qsp-select",
                    value: mode,
                    onChange: (event) => setMode(event.target.value),
                    title: "本地：离线 OCR；AI：把图片发给多模态模型识别；自动：先本地，识别不到题号时用 AI",
                  },
                  h("option", { value: "auto" }, "自动（本地优先）"),
                  h("option", { value: "local" }, "本地 OCR（离线）"),
                  h("option", { value: "ai" }, "AI 视觉（上传图片）"),
                ),
              ),
              h(
                "div",
                { className: "qsp-field" },
                h("span", { className: "qsp-field-label" }, "识别语言"),
                h(
                  "select",
                  { className: "qsp-select", value: language, onChange: (event) => setLanguage(event.target.value) },
                  h("option", { value: "auto" }, "自动（中文优先）"),
                  h("option", { value: "zh-Hans-CN" }, "简体中文"),
                  h("option", { value: "en-US" }, "English"),
                ),
              ),
              h(
                "div",
                { className: "qsp-field" },
                h("span", { className: "qsp-field-label" }, "保存格式"),
                h(
                  "select",
                  { className: "qsp-select", value: format, onChange: (event) => setFormat(event.target.value) },
                  h("option", { value: "png" }, "PNG（无损）"),
                  h("option", { value: "jpg" }, "JPG（体积小）"),
                ),
              ),
              status?.outputDir
                ? h("span", { className: "qsp-save-hint", title: status.outputDir }, `保存到：${status.outputDir}`)
                : null,
            ),
            h(
              "div",
              {
                className: dragOver ? "qsp-drop qsp-over" : "qsp-drop",
                role: "button",
                tabIndex: 0,
                onClick: () => inputRef.current?.click(),
                onKeyDown: (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                },
                onDragOver: (event) => {
                  event.preventDefault();
                  setDragOver(true);
                },
                onDragLeave: () => setDragOver(false),
                onDrop,
              },
              h(
                "span",
                { className: "qsp-drop-icon" },
                h(UploadIcon, null),
              ),
              h("span", { className: "qsp-drop-title" }, "点击选择图片，或拖拽 / 粘贴到这里"),
              h("span", { className: "qsp-drop-sub" }, "支持 PNG、JPG 等格式；多张图片视为同一份试卷的不同页"),
              h("input", {
                ref: inputRef,
                type: "file",
                accept: "image/*",
                multiple: true,
                style: { display: "none" },
                onChange: (event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                },
              }),
            ),
            files.length > 0
              ? h(
                  "ul",
                  { className: "qsp-files" },
                  files.map((item, index) =>
                    h(FileRow, {
                      key: item.id,
                      item,
                      index,
                      total: files.length,
                      disabled: running,
                      onRemove: removeFile,
                    }),
                  ),
                )
              : null,
            h(
              "div",
              { className: "qsp-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "qsp-btn qsp-btn-primary",
                  disabled: running || !hasPending,
                  onClick: start,
                },
                running ? "识别中…" : "开始识别并分割",
              ),
              jobId
                ? h(
                    "button",
                    { type: "button", className: "qsp-btn", onClick: openFolder },
                    h(FolderIcon, null),
                    "打开输出文件夹",
                  )
                : null,
              files.length > 0 && !running
                ? h("button", { type: "button", className: "qsp-btn qsp-btn-ghost", onClick: clearAll }, "清空")
                : null,
              h("span", { style: { marginLeft: "auto", color: "var(--qsp-text-3)", fontSize: "11.5px" } }, doneCount > 0 ? `已完成 ${doneCount} 张` : ""),
            ),
            progressText
              ? h("div", { className: "qsp-progress" }, h("span", { className: "qsp-spinner" }), progressText)
              : null,
            error ? h("div", { className: "qsp-alert qsp-alert-error" }, error) : null,
            !error && warnings.length > 0
              ? h("div", { className: "qsp-alert" }, warnings.map((text, index) => h("div", { key: index }, text)))
              : null,
          ),
          results.length > 0
            ? h(
                "section",
                { className: "qsp-card" },
                h(
                  "div",
                  { className: "qsp-results-head" },
                  h("span", { className: "qsp-results-title" }, "分割结果"),
                  h("span", { className: "qsp-results-count" }, `${results.length} 张 · 已保存到桌面`),
                  h(
                    "button",
                    { type: "button", className: "qsp-btn qsp-btn-ghost", style: { marginLeft: "auto", height: "28px" }, onClick: openFolder },
                    h(FolderIcon, null),
                    "打开文件夹",
                  ),
                ),
                h("div", { className: "qsp-grid" }, results.map((item, index) => h(ResultCard, { key: `${item.fileName}-${index}`, item, onReveal: revealItem }))),
              )
            : null,
          h(
            "div",
            { className: "qsp-footer" },
            "提示：印刷体优先用本地 OCR；手写内容建议选择「自动」或「AI 视觉」，AI 识别出的题号准确，但切分位置为估算值，个别题可能多带或少带一行，可裁剪后重试。",
          ),
        ),
        toast
          ? h(
              "div",
              {
                style: {
                  position: "fixed",
                  left: "50%",
                  bottom: "28px",
                  transform: "translateX(-50%)",
                  background: "var(--qsp-toast-bg, rgba(30,34,41,.92))",
                  color: "var(--qsp-toast-text, #fff)",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  zIndex: 200,
                  pointerEvents: "none",
                },
              },
              toast,
            )
          : null,
      );
    }
    //#endregion

    const inject = ["slots", "layout"];

    function apply(ctx) {
      ensureStyle();
      // Fire-and-forget diagnostic: lets the host log confirm the browser half
      // actually materialized (useful after a live install / HMR recompose).
      try {
        callApi("log", { message: "client half applied" }, 15_000).catch(() => {});
      } catch {}
      let layout = null;
      try {
        layout = ctx.get("layout");
      } catch {
        layout = null;
      }
      const panelProps = { layout };

      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 6,
            label: PANEL_LABEL,
          },
          (props) => h(SplitIcon, { size: props?.size ?? 18 }),
        ),
      );

      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
          },
          () =>
            h(
              "div",
              { style: { width: "100%", height: "100%", minHeight: 0, display: "flex" } },
              h(Panel, panelProps),
            ),
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = PLUGIN_ID;
    return module.exports;
  },
});
