# STORY-016: Final HTML / Machine DSL → React 代码生成

**Epic:** EPIC-003 React 代码生成与增量更新
**Priority:** Must Have
**Story Points:** 5
**Status:** Not Started
**Assigned To:** Unassigned
**Created:** 2026-04-26
**Sprint:** Sprint 2

---

## User Story

作为前端开发者
我想要将编辑后的 Final HTML / Machine DSL 转换为可用的 React 组件代码
以便直接在设计稿还原的基础上进行二次开发

---

## Description

### Background

当前 `react-code.ts` 已有基础实现，能从 Machine DSL 生成 React JSX。但存在以下问题：

1. **未集成 Design Tokens**：生成的代码没有使用 STORY-015 提取的 CSS 变量，样式仍是内联的
2. **未集成 Section 结构**：没有按 Section 拆分组件，整个页面是一个大组件
3. **主流程中已注释掉**：`src/index.ts` 中 React 生成步骤被注释（第 181-186 行）
4. **不支持多种样式模式完整流程**：虽然代码支持 inline/tailwind/scss/css 模式，但只测试过 inline

### Scope

**In scope:**
- 集成 Design Tokens 到 React 生成（输出 CSS 变量文件）
- 按 Section 拆分为独立 React 组件（每个 Section 一个组件）
- 恢复 `src/index.ts` 中的 React 生成步骤
- 支持 plain-css 模式（输出 App.css + 组件文件）
- 生成可直接导入使用的主组件

**Out of scope:**
- LLM 参与的代码生成（属于 STORY-006）
- 增量更新功能（属于 STORY-011 / FR-010）
- Tailwind / SCSS 模式（后续优化）

### User Flow

1. 用户完成 HTML 编辑并保存 Patch
2. 系统应用 Patch，生成 Final Machine DSL
3. 系统从 Final DSL 中提取 Design Tokens
4. 系统按 Section 拆分，为每个 Section 生成独立 React 组件
5. 系统生成 CSS 文件（包含 :root 变量 + 各组件样式）
6. 系统生成主组件（导入并组装各 Section 组件）
7. 输出到 `output/` 目录：
   - `App.tsx` — 主组件
   - `App.css` — 全局样式
   - `sections/` — 各 Section 组件文件

---

## Acceptance Criteria

- [ ] 生成的 React 代码包含 Design Token CSS 变量（与 STORY-015 提取的一致）
- [ ] 每个 Section 生成独立的 React 函数组件（如 `HeroSection.tsx`、`FeaturesSection.tsx`）
- [ ] 主组件 `App.tsx` 导入并按顺序组装所有 Section 组件
- [ ] CSS 输出包含 `:root` 变量定义和各组件的 CSS 类
- [ ] 生成的 JSX 使用 CSS 类名（非全量内联样式）
- [ ] 图片节点使用 `<img>` 标签 + `objectFit`
- [ ] 文本节点正确渲染（含字体、颜色、行高等样式）
- [ ] Flex 布局正确转为 JSX（flex、gap、align-items、justify-content）
- [ ] 生成的代码 TypeScript 编译无错误
- [ ] `src/index.ts` 的 React 生成步骤恢复可用
- [ ] 单元测试：核心函数（组件生成、JSX 生成、CSS 生成）覆盖率 > 80%

---

## Technical Notes

### 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/generators/react-code.ts` | 重构 | 集成 Tokens + Section 组件拆分 |
| `src/index.ts` | 修改 | 恢复 React 生成步骤 |
| `src/types/machine-dsl.ts` | 可能微调 | 新增 Section 相关类型 |

### 输出目录结构

```
output/
├── preview.html              # 可编辑预览（STORY-015）
├── preview-final.html        # 编辑后预览（STORY-015）
├── machine-dsl.json          # Machine DSL
├── react/                    # 新增：React 代码输出
│   ├── App.tsx               # 主组件（组装所有 Section）
│   ├── App.css               # 全局样式（:root 变量 + 组件类）
│   └── sections/             # Section 组件
│       ├── SectionHero.tsx
│       ├── SectionFeatures.tsx
│       └── SectionFooter.tsx
```

### 组件生成策略

```
输入: MachineDSL + DesignTokens + Section[]

对于每个 Section:
  1. 生成组件名 (Section name → PascalCase + "Section" 后缀)
  2. 遍历 Section 内节点生成 JSX
  3. CSS 声明转为 className 引用
  4. 颜色/字体/间距引用 CSS 变量
  5. 输出 Section 组件文件

主组件 App.tsx:
  1. import 所有 Section 组件
  2. import App.css
  3. 按顺序渲染 <SectionX /> <SectionY /> ...

App.css:
  1. :root { --color-1: ...; --font-1: ...; }
  2. .section-hero { ... }
  3. .section-features { ... }
```

### JSX 生成规则

- `container` → `<div>`
- `text` → `<p>`（有 className）
- `image` → `<div>` 包裹 `<img>`
- `button` → `<button>`
- CSS 类名从 `html-preview.ts` 的 classMap 获取
- 不再生成 `style={{ }}` 内联对象（除图片 img 的 objectFit）

---

## Dependencies

**Prerequisite Stories:**
- STORY-015: DSL→HTML 优化（已完成 — 提供 Design Tokens + Sections）

**Blocked Stories:**
- STORY-011: 增量更新 API（React 生成是增量更新的下游消费者）

**External Dependencies:**
- Design Tokens 和 Section 结构来自 STORY-015 的输出

---

## Definition of Done

- [ ] 代码实现并提交到 feature 分支
- [ ] 重构 react-code.ts，集成 Tokens 和 Section 拆分
- [ ] 恢复 src/index.ts 的 React 生成步骤
- [ ] 输出 App.tsx + App.css + sections/ 目录
- [ ] 单元测试编写并通过（覆盖率 >= 80%）
- [ ] 生成的 TypeScript 代码编译无错误
- [ ] 使用 machine-dsl.json 测试生成，检查输出质量
- [ ] 代码审查完成

---

## Story Points Breakdown

- **React 组件拆分（按 Section）:** 2 points
- **JSX 生成 + CSS 类集成:** 2 points
- **主流程集成 + 测试:** 1 point
- **Total:** 5 points

**Rationale:** 组件拆分需要将现有的单体生成逻辑改为按 Section 分组。JSX 生成需要与 STORY-015 的 CSS 类体系对接。主流程集成相对简单（取消注释 + 调整输出路径）。

---

## Additional Notes

### 与现有 react-code.ts 的关系

现有代码（~670 行）已经实现了完整的 JSX 生成逻辑（包括 inline/tailwind/scss/css 模式、组件匹配等）。本 Story 在此基础上：

1. **复用** JSX 生成核心逻辑（`renderNodeToJSX`）
2. **新增** Section 组件拆分层
3. **改造** CSS 输出使用 Design Token 变量
4. **简化** 默认使用 plain-css 模式

### 与 STORY-007 的关系

原 Sprint 计划中的 STORY-007（代码组装器）与本 Story 合并。因为 Section 拆分 + Token 集成 + 组件组装是一个连贯的工作流，拆开反而增加复杂度。

---

## Progress Tracking

**Status History:**
- 2026-04-26: Created by Scrum Master

**Actual Effort:** TBD (will be filled during/after implementation)

---

**This story was created using BMAD Method v6 - Phase 4 (Implementation Planning)**
