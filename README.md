# 题目分割器 · dsh-question-splitter

[![platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)](https://www.microsoft.com/windows)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-Desktop-4d6bfe)](https://github.com/deepseek-ai)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> 上传整页题目图片，自动识别**题号（1. 2. 3.、(1)、第1题…）**，把每一题切成独立图片并保存到桌面。
> 默认使用 Windows 自带的本地 OCR（离线，不上传图片）；一页里识别不到题号时（例如手写笔记），
> 「自动」模式会改用已配置的多模态模型做 AI 视觉识别。

DeepSeek Harness（DSH）Desktop 插件：在左侧导航栏提供一个「题目分割」入口，打开后是一个独立主面板。

![界面（深色主题）](docs/screenshot-dark.png)

## 功能

- **题号识别**：支持 `1.` / `2．` / `3、` / `1)` / `（1）` / `(1)` / `第1题` / `①` 等写法；
  结合「题号在解题内容前面」的版式特征判断行首题号、题号后是否有正文、段落空隙、左边界与递增序列，
  对印刷体更稳，也尽量避开选项行和题干中的数字。
- **按题切图**：在「上一题最后一行文字」与「下一题题号」之间找**墨迹最少的一行**切开，避免切穿文字；
  最后一题按墨迹分布确定内容底部，而不是图片底部。
- **AI 视觉兜底（新增）**：本地 OCR 识别不到题号时，把该页图片交给 DSH 已配置的多模态模型，
  由模型读出题号数量与编号，再结合墨迹吸附定位切线。适合手写数学笔记。
- **卷头单独保存**：第一题之前若有标题 / 班级 / 得分等内容，保存为 `00_卷头.png`。
- **多页批量**：一次可上传多张图片，输出文件名带 `P1_` / `P2_` 前缀。
- **格式可选**：PNG（无损）/ JPG（体积小）。
- **手机照片友好**：读取并应用 EXIF 方向，横拍照片自动摆正后再识别、切图。
- **结果预览**：面板内展示每张切图的缩略图、题号与尺寸；点击卡片可在资源管理器中定位文件。

![分割效果（示例）](docs/sample-question-1.png)

## 识别方式

面板里的「识别方式」有三档：

| 选项 | 行为 | 图片是否上传 |
| --- | --- | --- |
| **自动（默认）** | 先用本地 OCR；一页里识别不到题号时才调用 AI 视觉 | 仅失败页会上传 |
| **本地 OCR（离线）** | 只用 Windows 自带 OCR，不联网 | 不上传 |
| **AI 视觉（上传图片）** | 每页都用多模态模型识别题号 | 会上传 |

AI 模式使用 DSH 当前配置里第一个支持图片输入的模型（默认 `deepseek-account/deepseek-flash`），
每页会调用两次并取平均以降低坐标波动。AI 识别出的**题号编号可靠**，但**切分位置为模型估算值**，
可能多带或少带一行，可裁剪后重试。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 / 11（本地识别依赖 `Windows.Media.Ocr` 与 PowerShell 5.1） |
| 宿主 | 已安装 DeepSeek Harness Desktop（实测 `0.2.1-rc.5`） |
| OCR 语言包 | 建议安装 Windows 的「中文(简体)」OCR 语言包；也可在面板中切换 English |
| AI 视觉模式 | DSH 中配置了支持图片输入的模型（默认的 `deepseek-flash` 支持） |
| Node.js | 仅开发时需要（≥ 20） |

## 安装

### 方式 A：插件管理器（推荐，需要本机安装 Git）

1. 侧栏打开 **插件** → **添加插件**；
2. 填入 Git 地址 `https://github.com/Rice080401/dsh-question-splitter`；
3. 安装完成后点击 **立即启用**；
4. 左侧导航栏出现「题目分割」图标即安装成功。

> 插件管理器与 `pnpm` 会调用本机 `git` 拉取仓库，因此需要 Git 已加入 `PATH`。

### 方式 B：免 Git 安装（Release ZIP）

1. 从 [Releases](https://github.com/Rice080401/dsh-question-splitter/releases/latest) 下载
   [`dsh-question-splitter-v1.1.0.zip`](https://github.com/Rice080401/dsh-question-splitter/releases/download/v1.1.0/dsh-question-splitter-v1.1.0.zip)；
2. 解压到 `%USERPROFILE%\.dsh\plugins\dsh-question-splitter`；
3. 在 **插件 → 添加插件** 中选择这个本地目录安装并启用；或命令行：

```powershell
dsh plugin --profile desktop add "link:$env:USERPROFILE\.dsh\plugins\dsh-question-splitter"
```

### 方式 C：命令行（GitHub 源）

```powershell
dsh plugin --profile desktop add github:Rice080401/dsh-question-splitter
```

然后在 **插件** 页面启用 `dsh-question-splitter`，或手动把包名加入
`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 列表。

### 方式 D：本地开发（link）

```powershell
git clone https://github.com/Rice080401/dsh-question-splitter "$env:USERPROFILE\.dsh\plugins\dsh-question-splitter"
dsh plugin --profile desktop add "link:$env:USERPROFILE\.dsh\plugins\dsh-question-splitter"
```

再把 `dsh-question-splitter` 加入 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`。
启用 HMR 的 profile 会在保存后自动重载，无需重启应用。

## 使用

1. 左侧导航栏点击 **题目分割**；
2. 点击选择图片，或把图片拖拽 / `Ctrl+V` 粘贴到面板；
3. 选择识别方式、识别语言与保存格式；
4. 点击 **开始识别并分割**；
5. 完成后点击 **打开输出文件夹** 查看结果。

输出目录：

```
桌面\题目分割\<试卷名>-<时间戳>\
├── 00_卷头.png          # 有卷头时生成
├── 第01题.png
├── 第02题.png
├── …
└── manifest.json        # 每页识别文本、尺寸、文件清单
```

多页时文件名为 `P1_第01题.png`、`P2_第01题.png` …

## 工作原理

**本地模式**

```
图片 ──> GDI+ 解码（应用 EXIF 方向）
      ──> WinRT OCR（SoftwareBitmap.CreateCopyFromBuffer + OcrEngine）
      ──> 文字行 + 行墨迹分布
      ──> 题号检测（lib/detect.js：模式 + 结构评分 + 递增序列）
      ──> 墨迹空白行切线 ──> GDI+ 裁剪 + 缩略图
      ──> 写入桌面 + manifest.json
```

**AI 模式（本地识别不到题号时）**

```
图片 ──> 缩放到长边 1600px（scripts/resize.ps1）
      ──> 多模态模型两次识别题号与纵向位置（ctx.llm + ctx.attachments）
      ──> 平均位置 + 位置偏差校正 + 墨迹行吸附
      ──> 裁切并保存（保留少量重叠，避免切掉内容）
```

- 本地 OCR（`scripts/ocr.ps1`）：PowerShell 5.1 调 WinRT，先经 GDI+ 解码并处理 EXIF 方向，
  再通过 `SoftwareBitmap.CreateCopyFromBuffer` 交给 `OcrEngine.RecognizeAsync`，避免 WinRT 文件代理的路径权限限制；
  同时输出每一行的文字框与逐行墨迹计数。
- 题号检测（`lib/detect.js`）：识别多种题号写法，按「行首 + 题号后有正文 + 上方有段落空隙 + 左边界 + 字号接近正文」
  打分，用递增序列（容忍少量漏识别、支持大题重新从 1 编号）确定最终题号，再按墨迹空白行切分。
- AI 辅助（`lib/vision.js`）：调用宿主 `ctx.llm.stream` 与 `ctx.attachments.admitPromptContent`，
  提示词要求模型只输出 `{"questions":[{"label":"1","y":12.3}]}`；两次调用取平均并吸附到墨迹较少的行。

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半侧：注册 `/dsh-question-splitter/api`，管理输出目录、任务、AI 识别与打开文件夹 |
| `client.js` | 浏览器半侧：`sidebar.panellist` 图标 + `main` 主面板 UI |
| `lib/pipeline.js` | 单页流水线：OCR → 题号检测 →（必要时 AI 识别）→ 裁剪 → 预览 |
| `lib/detect.js` | 题号识别、切线算法与 AI 结果吸附（纯函数） |
| `lib/vision.js` | AI 视觉识别：模型发现、图片附件、提示词与结果解析 |
| `scripts/ocr.ps1` | PowerShell：GDI+ 解码 + WinRT OCR + 行墨迹分布 |
| `scripts/split.ps1` | PowerShell：按坐标裁剪、保存图片、生成缩略图 |
| `scripts/resize.ps1` | PowerShell：把图片缩放到长边 ≤1600px（AI 识别用） |
| `scripts/languages.ps1` | 列出已安装的 OCR 语言 |
| `scripts/desktop-path.ps1` | 读取当前用户桌面路径 |
| `cordis.patch.yml` | 插件 bundle 的 patch：向 profile 插入一行 |

## 版本历史

### v1.1.0

- 新增「AI 视觉」识别与「自动」回退：手写页面也能识别出题号数量与编号。
- 本地题号检测增强：支持 `（1）`、`1)`、`第1题`、`①`、全角数字与常见 OCR 数字混淆；
  加入「题号后是否有正文 / 上方段落空隙 / 左边界 / 字号」等结构判定与多写法择优选序列。
- 新增「识别方式」选择（自动 / 本地 OCR / AI 视觉）与上传提示。
- AI 识别自动缩图、两次采样取平均并吸附墨迹行，减少切线偏差。

### v1.0.0

- 首个版本：本地 OCR 题号识别、按题切图、卷头保存、多页批量、PNG/JPG 输出、桌面保存。

## 开发与调试

- 语法检查：`node --check index.js` 等（CI 在 push 时执行，见 `.github/workflows/ci.yml`）。
- 运行日志：`~/.dsh/plugins/dsh-question-splitter/.data/logs/plugin.log`。
- 修改源码后：`client.js` 变更会热更新到已打开的页面；`index.js`（宿主半侧）在下次 profile 重组或应用重启后生效。
- 算法自测：`lib/detect.js` 与 `lib/pipeline.js` 不依赖 Cordis，可直接用 Node 脚本加载，
  输入 `scripts/ocr.ps1` 产生的 JSON 即可复现题号检测与切线结果。

## 已知限制

- 本地 OCR 面向**印刷体**；手写内容请使用「自动」或「AI 视觉」。
- AI 视觉的切分位置是模型估算值，可能有 ±1–3% 页高的偏差（会保留少量重叠）；题号数量与编号通常准确。
- 本地模式面向**单栏**试卷排版；双栏排版会被当作整行处理。
- 题号需要是行首的编号形式；识别质量取决于图片清晰度与光照。
- 仅支持 Windows（本地识别依赖 `Windows.Media.Ocr`）。
- 依赖宿主的标准面板插槽（`sidebar.panellist` + `main`），需要 DSH 0.1.5+ 的标准入口。

## 卸载

从 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 与 `dependencies` 中移除
`dsh-question-splitter`，重启应用即可；也可在 **插件** 页面卸载。

## License

[MIT](LICENSE) © 2026 Rice
