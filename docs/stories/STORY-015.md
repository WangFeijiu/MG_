# STORY-015: 优化 DSL 到 HTML 的生成流程

**Epic:** EPIC-002 HTML 生成与编辑
**Priority:** Must Have
**Story Points:** 5
**Status:** Not Started
**Assigned To:** Unassigned
**Created:** 2026-04-26
**Sprint:** Sprint 1（当前分支 feat/optimize-dslToHtml）

---

## User Story

作为前端开发者
我想要优化 DSL 到 HTML 的生成流程，支持 Section 分块生成和 Design Token 提取
以便生成的 HTML 更准确、更易维护、文件更小

---

## Description

### Background

当前 `html-preview.ts` 的生成器存在以下问题：

1. **整页生成**：整个页面作为一个巨大的 HTML 文件输出（26K+ tokens），没有 Section 分块
2. **CSS 全部内联**：每个节点都重复完整的内联样式（如 `font-family:'Poppins', sans-serif` 出现数十次），没有样式提取和去重
3. **布局处理粗糙**：部分 flex 布局和 absolute 布局的转换不够精确，复杂嵌套场景下布局错乱
4. **无 Design Token 概念**：没有颜色、字体、间距等全局样式变量的提取，无法保证跨 Section 的一致性

这些问题导致：
- 生成的 HTML 文件过大，加载缓慢
- 浏览器插件编辑时性能差（节点太多）
- 后续生成 React 代码时缺乏结构化信息

### Scope

**In scope:**
- 重构 `html-preview.ts`，引入 Section 分块生成机制
- 实现 Design Token 提取器（从 Machine DSL 中提取颜色、字体、间距等）
- 将内联 CSS 改为 CSS 类 + CSS 变量（`:root` 变量定义）
- 优化 flex/absolute 布局的 CSS 生成逻辑
- 优化图片节点的渲染（正确处理 border-radius + overflow + object-fit）
- 保持 `data-dsl-id` 等属性用于插件编辑兼容性

**Out of scope:**
- LLM 参与的代码生成（属于 STORY-006）
- 截图对比和自动修正（属于 STORY-008/010）
- React 代码生成（属于 STORY-007）
- 浏览器插件功能改动（属于 STORY-006）

### User Flow

1. 用户运行 `npm run dev`（或 `--rebuild`）
2. 系统解析 DSL → Machine DSL
3. **新增**：从 Machine DSL 中提取 Design Tokens → 生成 CSS 变量定义
4. **新增**：识别 Section 边界 → 按分块策略拆分节点
5. 系统按 Section 生成 HTML（每个 Section 有独立 CSS 类）
6. 输出的 HTML 包含 `:root` CSS 变量 + 去重后的 CSS 类
7. 用户在浏览器中打开 HTML，用插件编辑

---

## Acceptance Criteria

- [ ] Design Token 提取：从 Machine DSL 中提取颜色、字体、间距为 CSS 变量
- [ ] CSS 变量输出：生成的 HTML `<style>` 中包含 `:root` 变量定义（如 `--color-primary: #1a1a2e; --font-body: 'Poppins'; --spacing-md: 24px;`）
- [ ] CSS 类去重：相同样式的节点共享 CSS 类名（如 `.dsl-text-body`），不再每个节点全部内联
- [ ] Section 分块：基于布局层级和间距自动识别 Section，输出带 `data-section-id` 的容器
- [ ] Flex 布局优化：flex 容器正确渲染 `flex-direction`、`gap`、`align-items`、`justify-content`，子节点不设 `position/left/top`
- [ ] Absolute 布局优化：非 flex 子节点正确使用 `position:relative` + `left/top`，但不影响文字节点
- [ ] 图片渲染优化：图片节点使用 `<img>` 标签 + `object-fit`，父容器负责 `border-radius` + `overflow:hidden`
- [ ] 文件大小优化：优化后的 HTML 文件大小比优化前减少 30% 以上
- [ ] 插件兼容：所有节点仍保留 `data-dsl-id`、`data-dsl-type`、`data-dsl-name` 属性
- [ ] 单元测试：核心函数（Token 提取、CSS 生成、Section 识别）测试覆盖率 > 80%

---

## Technical Notes

### 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/generators/html-preview.ts` | 重构 | 核心生成器，拆分为多个函数 |
| `src/converters/mastergo-to-machine.ts` | 可能微调 | 确保 Machine DSL 类型完整 |
| `src/types/machine-dsl.ts` | 可能微调 | 新增 Section 相关类型 |
| `src/index.ts` | 微调 | 集成新的生成流程 |

### 新增模块

| 文件 | 说明 |
|------|------|
| `src/generators/token-extractor.ts` | Design Token 提取器 |
| `src/generators/css-optimizer.ts` | CSS 类去重和变量生成 |
| `src/generators/section-splitter.ts` | Section 识别和分块 |

### Design Token 提取算法

```
输入: MachineDSL
输出: DesignTokens { colors, fonts, spacings, borderRadius }

算法:
1. 遍历所有 DSLNode
2. 收集 style.color → colors Map（按频次排序）
3. 收集 style.fontFamily + fontWeight → fonts Map
4. 收集 style.padding/gap/margin → spacings Map
5. 收集 style.borderRadius → radii Map
6. 对相似值聚类（颜色相近合并，间距相近合并）
7. 生成 CSS 变量名映射表
```

### CSS 生成策略

**Before（当前）:**
```html
<div class="dsl-node dsl-text" data-dsl-id="abc" style="color:#1a1a2e;font-size:14px;font-family:'Poppins',sans-serif;line-height:20px;">Hello</div>
<div class="dsl-node dsl-text" data-dsl-id="def" style="color:#1a1a2e;font-size:14px;font-family:'Poppins',sans-serif;line-height:20px;">World</div>
```

**After（优化后）:**
```html
<style>
:root { --color-text-primary: #1a1a2e; --font-body: 'Poppins', sans-serif; }
.dsl-text-body { color: var(--color-text-primary); font-size: 14px; font-family: var(--font-body); line-height: 20px; }
</style>
<div class="dsl-node dsl-text dsl-text-body" data-dsl-id="abc">Hello</div>
<div class="dsl-node dsl-text dsl-text-body" data-dsl-id="def">World</div>
```

### Section 识别算法

```
输入: MachineDSL
输出: Section[] { id, name, nodeIds, complexity }

算法:
1. 从根节点的直接子节点开始
2. 如果子节点是 FRAME 类型且有明确宽度 → 识别为 Section
3. 基于 Y 坐标间距（gap > 阈值）识别 Section 边界
4. 嵌套 FRAME → 识别为 Section 内的子区域
5. 计算 Section 复杂度评分 = 节点数 * 0.3 + 嵌套深度 * 0.2 + 样式多样性 * 0.2 + 交互元素 * 0.3
```

### 边界情况

- 没有子节点的空 Section → 跳过
- 深度嵌套的 flex 容器（3 层以上） → 需要正确处理 inherit
- 图片加载失败的 fallback（保留现有的 onerror 处理）
- 文字节点包含特殊字符（HTML 转义）

---

## Dependencies

**Prerequisite Stories:**
- STORY-000: 项目初始化（已完成 - 项目已有基础结构）
- STORY-001: DSL 解析器（部分完成 - `mastergo-to-machine.ts` 已有基础转换）

**Blocked Stories:**
- STORY-006: 浏览器插件编辑（依赖本 Story 的 HTML 结构和 CSS 变量）
- STORY-007: React 代码生成（依赖 Design Token 和 Section 结构）

**External Dependencies:**
- 现有 `machine-dsl.json` 作为测试输入
- 浏览器插件需要适配新的 CSS 类结构

---

## Definition of Done

- [ ] 代码实现并提交到 `feat/optimize-dslToHtml` 分支
- [ ] 新增模块：token-extractor.ts、css-optimizer.ts、section-splitter.ts
- [ ] 重构 html-preview.ts，拆分为清晰的函数职责
- [ ] 单元测试编写并通过（覆盖率 >= 80%）
  - [ ] Token 提取测试（颜色、字体、间距）
  - [ ] CSS 类去重测试
  - [ ] Section 识别测试（各种布局场景）
  - [ ] HTML 生成快照测试
- [ ] 使用现有 `machine-dsl.json` 生成 HTML，视觉对比无明显退化
- [ ] 生成的 HTML 文件大小比优化前减少 30%+
- [ ] 所有节点保留 data-dsl-id 等插件编辑属性
- [ ] 代码审查完成

---

## Story Points Breakdown

- **Token Extractor 实现：** 2 points
- **CSS Optimizer 实现：** 1 point
- **Section Splitter 实现：** 1 point
- **HTML Generator 重构：** 1 point
- **Total：** 5 points

**Rationale:** Token 提取需要聚类算法和 CSS 变量映射，是最复杂的部分。Section 识别基于布局层级，复杂度适中。CSS 去重是相对直接的字符串处理。重构 HTML Generator 需要小心保持兼容性。

---

## Additional Notes

### 对比现有输出

优化前后的关键指标对比目标：

| 指标 | 优化前 | 优化后目标 |
|------|--------|-----------|
| HTML 文件大小 | ~26K tokens | <18K tokens (-30%) |
| CSS 重复度 | 每节点全量内联 | 共享类 + CSS 变量 |
| Section 结构 | 无 | 自动识别 + data-section-id |
| Design Tokens | 无 | CSS 变量定义 |

### 与现有代码的关系

本 Story 在现有 `html-preview.ts` 基础上重构，不会破坏：
- `mastergo-to-machine.ts` 的转换逻辑
- `src/index.ts` 的主流程
- 浏览器插件的基本功能（data-dsl-id 属性保留）

---

## Progress Tracking

**Status History:**
- 2026-04-26: Created by Scrum Master

**Actual Effort:** TBD (will be filled during/after implementation)

---

**This story was created using BMAD Method v6 - Phase 4 (Implementation Planning)**
