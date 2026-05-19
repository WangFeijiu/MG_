# MasterGo DSL2React 工具链

> 设计稿到生产级 React 代码的自动化管线 — 高还原度 HTML + 组件识别 + 可视化验证

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🎯 核心价值

将 MasterGo 设计稿自动转换为**可维护的 React 组件代码**，而非简单的像素还原：

- ✅ **三层组件识别**：原子 UI（button/card/grid）+ 布局组件（section/accordion）+ 业务语义（可选）
- ✅ **三种渲染模式**：Pixel（严格还原）/ Semantic（语义化）/ Grid（结构优先）
- ✅ **四层差异检测**：DOM 几何 → 颜色感知 → 文本内容 → 截图兜底
- ✅ **React 组件输出**：Tailwind CSS + 组件库映射（`<Button>` / `<Card>` / `<Grid>`）
- ✅ **可视化验证**：实时截图对比 + 差异热力图 + 修复建议

## 📋 完整管线

```
MasterGo 设计稿
  ↓ [MCP 协议获取]
原始 DSL (MasterGo 格式)
  ↓ [转换器]
机器 DSL (统一中间表示)
  ↓ [三层组件识别]
组件识别结果 (button/card/grid/section...)
  ↓ [HTML 生成器 + 动画策略]
预览 HTML (带 data-dsl-id + CSS 优化)
  ↓ [四层差异检测]
差异报告 (layout/color/text/screenshot)
  ↓ [LLM 修正 + 自动降级]
收敛 HTML (13/13 通过)
  ↓ [React 组件渲染器]
React TSX + Tailwind (App.tsx + sections/*.tsx)
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# MasterGo MCP 配置
MG_MCP_TOKEN=your_mastergo_token
MG_FILE_ID=190096496279041
MG_LAYER_ID=11:1602

# LLM API 配置（可选，用于语义分析和修正）
LLM_API_KEY=your_glm_api_key
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4-flash
```

### 3. 运行管线

#### 完整流程（从 MasterGo 获取 DSL）

```bash
npm run dev
```

#### 仅重建（从本地 DSL 重新生成 HTML）

```bash
npm run dev -- --rebuild
```

#### 自动化测试（v12-v14 完整验证）

```bash
npm run test:automated
```

输出：
- `output/machine-dsl.json` — 机器 DSL
- `output/preview.html` — 预览 HTML
- `output/react/` — React 组件代码
- `output/test-results/` — 差异报告

#### 可视化验证（实时截图对比）

```bash
npm run visualize
```

打开浏览器访问 `http://localhost:3456`，查看：
- 设计稿 vs HTML 截图对比
- 差异热力图
- Section 级别的视觉还原度

## 📁 项目结构

```
.
├── src/
│   ├── types/                    # TypeScript 类型定义
│   │   ├── machine-dsl.ts        # 机器 DSL 核心类型
│   │   ├── diff-report.ts        # 差异报告类型
│   │   └── patch.ts              # Patch 系统类型
│   ├── converters/               # 转换器
│   │   ├── mastergo-to-machine.ts  # MasterGo DSL → 机器 DSL
│   │   └── original-dsl-extractor.ts  # 原始 DSL 数据提取
│   ├── generators/               # 生成器
│   │   ├── component-recognizer.ts    # 三层组件识别器
│   │   ├── component-mapper.ts        # 组件库映射
│   │   ├── html-preview.ts            # HTML 生成器
│   │   ├── react-component-renderer.ts  # React TSX 渲染器
│   │   ├── tailwind-utils.ts          # Tailwind 工具函数
│   │   ├── section-splitter.ts        # Section 拆分器
│   │   ├── programmatic-grid-renderer.ts   # Grid 模式渲染器
│   │   ├── programmatic-pixel-renderer.ts  # Pixel 模式渲染器
│   │   └── llm-section-html-generator.ts   # LLM 语义渲染器
│   ├── optimizers/               # 优化器
│   │   ├── multi-layer-diff-detector.ts   # 四层差异检测器
│   │   ├── animation-policy.ts            # 动画策略注入器
│   │   ├── css-class-extractor.ts         # CSS 类提取器
│   │   ├── dom-flattener.ts               # DOM 扁平化器
│   │   ├── llm-section-fixer.ts           # LLM 修正器
│   │   └── diff-report-formatter.ts       # 差异报告格式化
│   ├── validators/               # 验证器
│   │   ├── screenshot-compare.ts  # 截图对比
│   │   └── tolerance.ts           # 容差配置
│   ├── visualizer/               # 可视化服务
│   │   ├── server.ts              # WebSocket 服务器
│   │   ├── orchestrator.ts        # 管线编排器
│   │   └── screenshot.ts          # 截图工具
│   ├── llm/                      # LLM 客户端
│   │   └── llm-client.ts          # 统一 LLM 接口
│   ├── cli/                      # CLI 工具
│   │   ├── automated-test.ts      # 自动化测试入口
│   │   └── generate-react.ts      # React 代码生成入口
│   └── index.ts                  # 主入口
├── output/                       # 输出目录（自动生成）
│   ├── machine-dsl.json          # 机器 DSL
│   ├── preview.html              # 预览 HTML
│   ├── react/                    # React 组件输出
│   │   ├── App.tsx
│   │   └── sections/*.tsx
│   ├── test-results/             # 测试报告
│   │   └── diff-report.html
│   └── visualizer/               # 可视化产物
│       ├── sections/*.png
│       ├── baselines/*.png
│       └── diffs/*.png
└── README.md
```

## 🔧 核心功能

### 1. 三层组件识别

**Layer 1: 原子 UI 组件**
- `button` — 小型圆角容器 + 文本子节点
- `image` — 图片节点（默认不动画）
- `text` — 文本节点
- `icon` — 图标节点（默认不动画）
- `link` — 可点击小元素

**Layer 2: 布局组件**
- `card` — 中型圆角容器 + 多子节点
- `grid` — 网格布局容器
- `card-list` — 卡片列表容器
- `stack` — 垂直/水平堆叠
- `accordion` — 手风琴容器
- `section` — 页面区块（默认不动画）

**Layer 3: 业务语义（可选）**
- `hero` / `navbar` / `FAQ` / `CTA` / `footer`

识别依据：
- 视觉属性：`borderRadius`, `size`, `background`
- 结构属性：`children pattern`, `layout.display`

### 2. 三种渲染模式

| 模式 | 适用场景 | 容差配置 |
|------|---------|---------|
| **Pixel** | 严格像素还原（hero/banner） | layout ≤4px, color ΔE≤4, screenshot ≥92% |
| **Semantic** | 语义化布局（card/grid） | layout ≤12px, color ΔE≤6, screenshot ≥85% |
| **Grid** | 结构优先（list/table） | layout ≤24px, color ΔE≤7, screenshot ≥80% |

自动分类器根据 Section 特征选择最佳模式。

### 3. 四层差异检测

**Layer 1: DOM 几何**
- Pixel/Semantic: 位置偏移、尺寸差异
- Grid: 结构评分（子节点数量、顺序）

**Layer 2: 区域颜色**
- 感知色差（CIELAB ΔE）
- 块级颜色对比（16×16 block）

**Layer 3: 文本内容**
- 文本内容匹配
- 字号、字重、颜色

**Layer 4: 截图兜底**
- Pixelmatch 像素对比
- 差异热力图生成

### 4. 动画策略

**白名单机制**（避免"廉价感"）：
- ✅ 启用动画：`button`, `card`, `grid`, `accordion`, `link`
- ❌ 禁用动画：`image`, `icon`, `section`, `text`

动画类型：
- `fade-in` — 淡入（section 根）
- `slide-up` — 上滑（card）
- `scale-in` — 缩放（button）
- `pulse` — 脉冲（icon，默认关闭）

### 5. React 组件输出

**组件库映射**：

```tsx
// Before (HTML 还原)
<div class="node-10001"><p>Get Started</p></div>

// After (React 组件)
<Button variant="primary" size="lg">Get Started</Button>
```

**Tailwind 工具类生成**：

```tsx
// 从 DSL 视觉属性自动生成
<div className="flex items-center gap-4 p-6 rounded-xl bg-white shadow-lg">
  <ResponsiveImage src="..." className="w-1/2 object-cover" />
  <div className="flex flex-col gap-2">
    <h1 className="text-4xl font-bold text-gray-900">Title</h1>
    <p className="text-lg text-gray-600">Description</p>
  </div>
</div>
```

**输出结构**：

```
output/react/
├── App.tsx                    # 主应用入口
└── sections/
    ├── HeroSection.tsx        # Hero 区块
    ├── FeaturesSection.tsx    # Features 区块
    └── CTASection.tsx         # CTA 区块
```

## 📊 质量指标

### v12 管线（可维护优先）

- ✅ **13/13 首轮通过**（pixel=0, semantic/grid 自动降级）
- ✅ **65% 可维护性**（CSS 提取 + DOM 扁平化）
- ✅ **分模式 Diff**（pixel/semantic/grid 不同容差）

### v13 管线（组件识别）

- ✅ **13/13 通过**（92.2% 视觉还原）
- ✅ **19% 有效组件覆盖**（43 个 meaningful components）
- ✅ **~10% 动画覆盖**（白名单机制，避免廉价感）
- ✅ **双指标 Coverage**：
  - `nodeRecognitionCoverage`: 任何被识别的节点 / 总数（含 image/icon/text）
  - `meaningfulComponentCoverage`: button/card/grid/accordion/link / 总 container 数

### v14 管线（React 组件输出）

- ✅ **13 个 Section TSX 文件**
- ✅ **43 个组件映射**（Button/Card/Grid/Accordion/Link/CardList）
- ✅ **Tailwind 工具类覆盖**（layout/color/typography/spacing）

## 🎨 可视化验证

启动可视化服务：

```bash
npm run visualize
```

打开浏览器访问 `http://localhost:3456`，功能包括：

1. **实时管线执行**
   - 点击 "Start Pipeline" 触发完整流程
   - 实时显示进度（DSL 加载 → Section 拆分 → 截图对比）

2. **Section 级对比**
   - 设计稿截图 vs HTML 截图
   - 差异热力图（红色 = 差异区域）
   - 差异百分比 + 容差配置

3. **差异报告**
   - Layout Issues（位置/尺寸偏移）
   - Color Issues（颜色差异 ΔE）
   - Text Issues（文本内容/样式）
   - Screenshot Issues（像素差异）

4. **导出产物**
   - `output/visualizer/sections/*.png` — Section 截图
   - `output/visualizer/baselines/*.png` — 设计稿裁剪
   - `output/visualizer/diffs/*.png` — 差异热力图

## 🔑 关键实现点

### 1. 机器 DSL 设计

统一的中间表示，包含：

```typescript
type DSLNode = {
  id: string;                    // 唯一标识
  type: "container" | "text" | "image" | "icon";
  name: string;                  // 节点名称
  children: string[];            // 子节点 ID
  layout: {
    display?: "flex" | "absolute" | "grid";
    width?: number | "auto" | "fill";
    height?: number | "auto" | "fill";
    x?: number;
    y?: number;
    flexDirection?: "row" | "column";
    justifyContent?: string;
    alignItems?: string;
    gap?: number;
    padding?: Spacing;
  };
  style?: {
    background?: string;
    borderRadius?: BorderRadius;
    fontSize?: number;
    fontWeight?: string | number;
    color?: string;
    overflow?: "visible" | "hidden";
    objectFit?: "fill" | "contain" | "cover";
  };
  content?: {
    text?: string;
    src?: string;
  };
};
```

### 2. Patch 系统

所有修改以语义化 Patch 存储，支持：

- `update_style` — 更新样式
- `update_layout` — 更新布局
- `update_content` — 更新内容

示例：

```json
{
  "id": "patch_001",
  "targetNodeId": "node_card_1",
  "op": "update_style",
  "payload": {
    "borderRadius": {
      "linked": false,
      "topLeft": 16,
      "topRight": 16,
      "bottomRight": 0,
      "bottomLeft": 0
    },
    "overflow": "hidden"
  }
}
```

### 3. 分模式容差配置

```typescript
const DIFF_PROFILES: Record<string, DiffProfile> = {
  pixel: {
    positionTolerance: 4,
    sizeTolerance: 4,
    colorDeltaE: 4,
    screenshotThreshold: 0.92,
  },
  semantic: {
    positionTolerance: 12,
    sizeTolerance: 16,
    colorDeltaE: 6,
    screenshotThreshold: 0.85,
  },
  grid: {
    positionTolerance: 24,
    sizeTolerance: 24,
    colorDeltaE: 7,
    screenshotThreshold: 0.80,
  },
};
```

## 📝 使用示例

### 示例 1: 完整流程

```bash
# 1. 从 MasterGo 获取 DSL 并生成 HTML
npm run dev

# 2. 运行自动化测试（验证视觉还原度）
npm run test:automated

# 3. 启动可视化验证
npm run visualize

# 4. 查看 React 组件输出
ls output/react/sections/
```

### 示例 2: 仅重建 HTML

```bash
# 从本地 machine-dsl.json 重新生成 HTML（不重新获取 DSL）
npm run dev -- --rebuild
```

### 示例 3: 跳过截图验证

```bash
# 跳过截图对比（加速开发）
npm run dev -- --skip-validate
```

## 🧪 测试

### 单元测试

```bash
npm run test
```

### 测试覆盖率

```bash
npm run test:coverage
```

### 自动化测试

```bash
npm run test:automated
```

输出：
- `output/test-results/diff-report.html` — 差异报告
- `output/test-results/debug-*.png` — 调试截图

## 🛠️ 开发

### 代码规范

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npx tsc --noEmit
```

### 调试

1. **查看机器 DSL**：`output/machine-dsl.json`
2. **查看预览 HTML**：`output/preview.html`
3. **查看差异报告**：`output/test-results/diff-report.html`
4. **查看 React 输出**：`output/react/`

## 📖 API 文档

### 核心 API

#### `convertMasterGoToMachine(masterGoDSL: MasterGoDSL): MachineDSL`

将 MasterGo DSL 转换为机器 DSL。

#### `generatePreviewHTML(machineDSL: MachineDSL, options?: { originalDslData?: OriginalDslData }): Promise<string>`

生成预览 HTML。

#### `recognizeComponents(nodes: DSLNode[], nodeMap: Map<string, DSLNode>): ComponentRecognition[]`

三层组件识别。

#### `renderReactComponents(dsl: MachineDSL, recognitions: ComponentRecognition[], nodeMap: Map<string, DSLNode>): ReactComponentOutput`

生成 React 组件代码。

#### `multiLayerDiffDetect(page: Page, sections: Section[], manifests: SectionManifest[], baselinePNG: PNG, options?: DiffDetectionOptions): Promise<PageDiffReport>`

四层差异检测。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT

---

**Made with ❤️ by MasterGo Team**
