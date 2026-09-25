# PDF 旋转页显示为未旋转页框

**影响面**：PDF 阅读器与翻译分屏中带 `/Rotate 90` / `/Rotate 270` 的页面。

## 现象

某些论文 PDF 的页面字典带有旋转元数据。示例：
`papers/10_3389_fpls_2025_1611992/10_3389_fpls_2025_1611992.pdf`
共 10 页，其中第 4、5 页为 `/Rotate 90`。系统 `pdfinfo -f 1 -l 10 -box`
能正确读出这两页旋转，但应用内显示时页面仍占用竖向 A4 页框，横向表格没有按横向页框呈现。

## 原因

EmbedPDF scroll plugin 的页面 layout 同时提供：

- `width` / `height`：原始页面尺寸。
- `rotatedWidth` / `rotatedHeight`：考虑页面旋转后的显示尺寸。

Scroller 外层 page slot 已经使用 `rotatedWidth` / `rotatedHeight`，但 Agentero 自定义的
`PdfPageLayers` 内层 page shell 仍只接收 `width` / `height`。结果是外层槽位按横向尺寸布局，
内层纸面和 raster/overlay 按竖向尺寸绘制，旋转页看起来没有转正。

## 修复

- `src/components/viewer/pdf/pdf-viewer.tsx`：`renderPage` 改为接收 `PageLayout`，传给
  `PdfPageLayers` 的尺寸优先使用 `rotatedWidth` / `rotatedHeight`。
- `src/components/viewer/pdf/pdf-translation-viewer-inner.tsx`：翻译分屏同样使用旋转后的显示尺寸。

页面内容仍由 EmbedPDF/PDFium 按自身 rotation 管线渲染；这次修复只统一内外 page shell 的显示尺寸，
避免把旋转后的 raster 塞进未旋转页框。

## 验证

```bash
pdfinfo -f 1 -l 10 -box /Users/philfan/l/test/papers/10_3389_fpls_2025_1611992/10_3389_fpls_2025_1611992.pdf
pnpm exec biome check src/components/viewer/pdf/pdf-viewer.tsx src/components/viewer/pdf/pdf-translation-viewer-inner.tsx
pnpm exec vitest run --passWithNoTests test/pdf-viewport-scroll.test.ts test/pdf-pending-page.test.ts
```

Roadmap 与 TODO 已检查：这是已实现 PDF 阅读能力的显示缺陷修复，不新增未完成产品项。
