# Skill: MasterGo DSL Pipeline

## Description

从 MasterGo 设计稿拉取 DSL，转换为标准化机器 DSL，生成可编辑的预览 HTML，通过浏览器插件可视化微调样式后回写 patch，最终输出 React / HTML 代码。核心原则：**HTML 仅是预览和编辑层，机器 DSL 才是唯一真相源。**

## Architecture

```
MasterGo Design
      |  (1) MCP fetch
      v
original-dsl.json        -- 原始 MasterGo DSL
      |  (2) convertMasterGoToMachine()
      v
machine-dsl.json         -- 机器 DSL (source of truth)
      |  (3) generatePreviewHTML()
      v
preview.html             -- 带 data-dsl-id 的可编辑预览页
      |  (4) Chrome Extension 可视化编辑
      v
patches.json             -- 语义化 Patch 文档
      |  (5) applyPatches()
      v
final-machine-dsl.json   -- 回写后的机器 DSL
      |  (6) generateReactCode() / generatePreviewHTML()
      v
*.tsx / preview-final.html
```

## Inputs

### Environment Variables (.env)

| Key | Required | Description |
|-----|----------|-------------|
| `MG_MCP_TOKEN` | Yes | MasterGo API 认证 Token |
| `MG_FILE_ID` | No | MasterGo 文件 ID (default: 190096496279041) |
| `MG_LAYER_ID` | No | MasterGo 图层/节点 ID (default: 11:1602) |

### Source Files

| File | Role |
|------|------|
| `src/types/machine-dsl.ts` | 核心类型：MachineDSL, DSLNode, BorderRadius, Spacing 等 |
| `src/types/patch.ts` | Patch 类型：PatchDocument, UpdateStylePatch, UpdateLayoutPatch, UpdateContentPatch |
| `src/converters/mastergo-to-machine.ts` | MasterGo DSL → Machine DSL 转换器 |
| `src/generators/html-preview.ts` | Machine DSL → 预览 HTML（带 data-dsl-id） |
| `src/generators/react-code.ts` | Machine DSL → React TSX 组件 |
| `src/utils/patch.ts` | deepMerge + applyPatches 工具函数 |
| `src/index.ts` | 主入口，6 步 Pipeline 编排 |

## Outputs

| File | Description |
|------|-------------|
| `output/original-dsl.json` | MasterGo 原始 DSL |
| `output/machine-dsl.json` | 转换后的机器 DSL |
| `output/preview.html` | 可编辑预览 HTML |
| `output/patches.json` | 浏览器插件导出的 patch |
| `output/final-machine-dsl.json` | 应用 patch 后的机器 DSL |
| `output/*.tsx` | 生成的 React 组件 |
| `output/preview-final.html` | 包含 patch 的最终预览 |

## Data Model

### DSLNode

```typescript
{
  id: string;                    // 节点 ID（对应 MasterGo 节点）
  type: "page" | "container" | "text" | "image" | "button" | "icon";
  name?: string;
  parentId: string | null;
  children: string[];

  layout: {
    mode?: "absolute" | "flex";
    direction?: "row" | "column";
    justify?: string;            // flex-start | center | flex-end | space-between
    align?: string;              // stretch | center | flex-start | flex-end
    wrap?: string;               // wrap | nowrap
    gap?: number;
    x?: number;                  // 绝对定位坐标
    y?: number;
    width?: number | string;
    height?: number | string;
    flexShrink?: number;
  };

  style: {
    background?: string;
    backgroundImage?: string;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;         // 400 | 500 | 600 | 700
    lineHeight?: number;
    textAlign?: string;          // left | center | right
    borderRadius?: { linked: boolean; topLeft; topRight; bottomRight; bottomLeft };
    overflow?: "visible" | "hidden";
    padding?: { top; right; bottom; left };
    margin?: { top; right; bottom; left };
    objectFit?: "fill" | "contain" | "cover";
    boxShadow?: string;
    border?: string;
  };

  content?: {
    text?: string;
    src?: string;                // 图片 URL
  };

  meta?: {
    sourceNodeId?: string;
    componentHint?: string;
  };
}
```

### Patch

```typescript
{
  version: 1,
  patches: [
    {
      id: "patch_<timestamp>_<random>",
      targetNodeId: "11:1644",
      op: "update_style" | "update_layout" | "update_content",
      payload: { /* Partial<style|layout|content> */ }
    }
  ]
}
```

同一节点的同 op patch 会自动合并 payload。

## Steps

### 1. 获取 MasterGo DSL

```bash
npm run dev
```

- 通过 `@mastergo/magic-mcp` MCP 协议拉取设计稿 DSL
- 保存到 `output/original-dsl.json`

### 2. 转换为机器 DSL

- `convertMasterGoToMachine()` 递归遍历 MasterGo 节点树
- 解析 `layoutStyle` 提取 flex/absolute 布局信息
- 从共享 `styles` 字典解析 fill/stroke/font 等
- LAYER 节点带 HTTP fill URL 时映射为 `image` 类型
- TEXT 节点映射为 `text` 类型
- 保存到 `output/machine-dsl.json`

### 3. 生成预览 HTML

- `generatePreviewHTML()` 将每个 DSLNode 渲染为 HTML 元素
- 每个 DOM 节点挂载 `data-dsl-id` / `data-dsl-type` / `data-dsl-name`
- flex 容器输出 `display:flex; flex-direction; justify-content; align-items; gap`
- flex 子节点**不设置** position/left/top（由 flex 布局自动定位）
- 图片使用 `<img>` + object-fit:cover + 包裹 div 的 backgroundImage
- 保存到 `output/preview.html`

### 4. 浏览器插件可视化编辑

- Chrome Extension 注入 `content.js` + `content.css`
- **右键菜单**在 `[data-dsl-id]` 元素上弹出编辑面板
- 可折叠分区：Radius / Move / Padding / Size&Gap / Typography / Overflow
- 修改实时反映到 DOM，并累积为 pending patches
- "Save Patch" 写入 chrome.storage，"Export JSON" 下载 patches.json

#### 插件功能清单

| 功能 | 操作 | Patch Op |
|------|------|----------|
| 圆角 | 滑块 + 预设 (0/4/8/16/Full) | update_style |
| 移动 | 方向键 (上下左右) + 步长 + All children | update_layout |
| 内边距 | T/R/B/L 单独 / Link 统一 / Reset | update_style |
| 尺寸 | W × H | update_layout |
| 间距 | Gap | update_layout |
| 字号 | fontSize | update_style |
| 字重 | 400/500/600/700 | update_style |
| 颜色 | 原生取色器 | update_style |
| 裁剪 | overflow visible/hidden | update_style |
| 图片适配 | object-fit cover/contain/fill | update_style |

### 5. 应用 Patch

- 将插件导出的 `patches.json` 放到 `output/` 目录
- 重新运行 `npm run dev`
- `applyPatches()` 对机器 DSL 执行 deepMerge
- 保存到 `output/final-machine-dsl.json`

### 6. 生成最终代码

- `generateReactCode()` 输出 `.tsx` React 函数组件
- `generatePreviewHTML()` 输出 `preview-final.html`

## Rules

### 转换规则

- 必须保留 borderRadius、overflow、objectFit、padding
- 不允许简化或合并节点结构
- flex 子节点不得添加 position:relative / left / top
- LAYER 节点含 HTTP fill URL 必须渲染为 `<img>`
- TEXT 节点必须保持原文本内容
- 图片默认使用 object-fit: cover
- padding 从 flexContainerInfo 解析，非空时必须保留

### Patch 规则

- 同一节点 + 同 op 的 patch 合并 payload，不重复创建
- patch 通过 `deepMerge` 回写，不会覆盖未修改的属性
- HTML 只是编辑层，最终代码始终从机器 DSL 生成

## Tools

| 工具 | 用途 |
|------|------|
| `npm run dev` | 执行完整 Pipeline |
| `npm run build` | TypeScript 编译 |
| Chrome Extension | 加载 `extension/` 目录，可视化编辑 preview.html |

## Examples

### Input

```
.env:  MG_MCP_TOKEN=mg_xxx  MG_FILE_ID=190096496279041  MG_LAYER_ID=11:1644
```

### Commands

```bash
# 第一次：生成预览
npm run dev

# 在浏览器中用插件编辑 preview.html，导出 patches.json 到 output/

# 第二次：应用 patch + 生成最终代码
npm run dev
```

### Output

```
output/
  original-dsl.json       -- MasterGo 原始 DSL
  machine-dsl.json        -- 机器 DSL
  preview.html            -- 可编辑预览
  patches.json            -- 插件导出的修改
  final-machine-dsl.json  -- 回写后的 DSL
  容器 1163.tsx           -- React 组件
  preview-final.html      -- 最终预览
```

## Extension Usage

1. Chrome 打开 `chrome://extensions/`，启用开发者模式
2. 加载 `extension/` 目录
3. 在浏览器中打开 `output/preview.html`
4. 右键点击任意元素打开编辑面板
5. 调整属性（实时预览），点击 "Save Patch" 保存
6. 点击 "Export JSON" 下载 patch 文件
7. 将下载的文件重命名为 `patches.json` 放到 `output/` 目录
8. 重新执行 `npm run dev` 生成最终代码
