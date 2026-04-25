# DSL2React 系统架构设计

**项目：** DSL2React  
**版本：** 2.0（简化版）  
**日期：** 2026-04-25  
**架构师：** System Architect  
**项目级别：** Level 2（中型项目，5-15 个故事）

---

## 1. 执行摘要

DSL2React 是一个将 MasterGo DSL 转换为 React 代码的自动化生成系统。本架构采用**纯内存 + 五层管道模式**，通过"先结构化，再分块；先抽 token，再生成；先局部生成，再全局组装；先截图对比，再局部修正"的工程方法，解决了长设计稿生成质量差的问题。

**核心特性：**
- 智能 Section 识别和分块处理
- 全局 Design Tokens 提取和应用
- LLM 并行生成（无缓存，每次重新生成）
- 自动化截图对比和差异修正
- 增量更新（通过补丁方式）
- 会话内数据保持，可随时重置

**设计原则：**
- 极简部署：零数据库依赖
- 会话驱动：数据仅在会话期间有效
- 增量优先：只重新生成变更部分
- 可重置：随时清空重新开始

---

## 2. 架构驱动因素

### 2.1 性能要求
**需求：** LLM 调用延迟和生成速度需要优化  
**架构解决方案：**
- 并行处理无依赖的 Section
- 内存存储，零 I/O 延迟
- 批量 API 调用
- 异步任务队列

**验证方式：** 监控生成时间，目标：单个 Section < 10s，完整页面 < 2min

### 2.2 增量更新
**需求：** 通过补丁方式修改 DSL，只重新生成变更部分  
**架构解决方案：**
- 内存中维护 Section 依赖图
- 识别受影响的 Section
- 只重新生成必要的部分
- 保持未变更 Section 的代码

**验证方式：** 补丁更新时间 < 全量生成时间的 30%

### 2.3 质量保证
**需求：** 生成结果的视觉准确性  
**架构解决方案：**
- 截图对比机制（Puppeteer + Pixelmatch）
- 智能容差算法
- 自动修正循环（最多 3 次）
- 差异热力图可视化

**验证方式：** 差异百分比 < 5% 视为通过

### 2.4 简化部署
**需求：** 本地部署，零配置  
**架构解决方案：**
- 无数据库依赖
- 纯内存存储
- 临时文件自动清理
- 单进程运行

**验证方式：** 安装后一条命令启动

---

## 3. 高层架构

### 3.1 架构模式

**选择：** 纯内存 + 模块化单体 + 管道模式

**理由：**
- 本地部署，单用户场景
- 不需要持久化历史数据
- 会话内保持状态即可
- 极简部署和运维

**权衡：**
- ✓ 优势：部署极简、零配置、快速启动
- ✗ 劣势：进程重启数据丢失（但符合需求）

### 3.2 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                              │
│                    (React + TypeScript)                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                      API Gateway                             │
│                   (Express + REST)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼───────┐ ┌─────▼──────┐ ┌──────▼───────┐
│  解析层        │ │  分析层     │ │  生成层       │
│ DSL Parser    │ │ Analyzer   │ │ LLM Gen      │
└───────┬───────┘ └─────┬──────┘ └──────┬───────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼───────┐ ┌─────▼──────┐ ┌──────▼───────┐
│  组装层        │ │  验证层     │ │  内存存储     │
│ Assembler     │ │ Validator  │ │ Memory Store │
└───────────────┘ └────────────┘ └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
┌────────────────────────┴──────────────────────────────────���─┐
│                      临时文件层                               │
│              (截图、大文件，进程退出自动清理)                    │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                      外部服务                                 │
│              Claude API / OpenAI API                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 数据流

**完整生成流程：**

```
1. 用户上传 DSL
   ↓
2. [内存] 存储 DSL 文档
   ↓
3. [解析层] 解析 DSL → AST
   ↓
4. [分析层] 提取 Design Tokens + 识别 Section → Manifest
   ↓
5. [内存] 存储 Tokens 和 Sections
   ↓
6. [生成层] 并行生成各 Section → HTML/JSX 片段
   ↓
7. [内存] 存储生成的代码
   ↓
8. [组装层] 拼接 Section + 应用 Tokens → 完整代码
   ↓
9. [验证层] 截图对比 → 差异检测
   ↓
10. 如果差异 > 阈值 → 修正 → 回到步骤 6（最多 3 次）
   ↓
11. 输出最终代码
```

**增量更新流程：**

```
1. 用户应用补丁（Patch）
   ↓
2. [分析层] 识别变更的 Section
   ↓
3. [内存] 查询依赖图，找出受影响的 Sections
   ↓
4. [生成层] 只重新生成受影响的 Sections
   ↓
5. [内存] 更新对应的代码
   ↓
6. [组装层] 重新组装 → 完整代码
   ↓
7. 输出更新后的代码
```

---

## 4. 技术栈

### 4.1 后端技术

**框架：** Node.js 20+ + TypeScript 5+ + Express 4+

**理由：**
- 与前端技术栈统一
- 内存管理灵活
- 异步处理能力强
- 轻量级，适合本地部署

### 4.2 前端技术

**框架：** React 18+ + TypeScript 5+ + Vite 5+

**理由：**
- 项目目标就是生成 React 代码
- TypeScript 提供类型安全
- Vite 快速的开发体验

### 4.3 数据存储

**方案：** 纯内存 + 临时文件

**内存存储：**
```typescript
class InMemoryStore {
  // DSL 文档
  private dslDocuments = new Map<string, DSLDocument>()
  
  // Section 信息
  private sections = new Map<string, Section>()
  
  // 生成的代码
  private generatedCode = new Map<string, string>()
  
  // Design Tokens
  private designTokens: DesignTokens | null = null
  
  // 依赖图
  private dependencyGraph: DependencyGraph | null = null
  
  // 重置所有数据
  reset() {
    this.dslDocuments.clear()
    this.sections.clear()
    this.generatedCode.clear()
    this.designTokens = null
    this.dependencyGraph = null
  }
}
```

**临时文件：**
- 截图文件（PNG）
- 差异热力图
- 进程退出时自动清理

**理由：**
- 零配置，无需安装数据库
- 性能最优（内存访问）
- 符合会话驱动的使用模式
- 支持随时重置

### 4.4 LLM 集成

**主要：** Anthropic Claude API (Sonnet 4.6)

**理由：**
- 代码生成质量高
- 支持长上下文（200K tokens）
- 响应速度快

**备选：** OpenAI GPT-4

### 4.5 截图对比

**工具：** Puppeteer 21+ + Pixelmatch 5+

### 4.6 开发工具

- **包管理：** pnpm 8+
- **代码质量：** ESLint + Prettier
- **测试框架：** Vitest（单元测试）+ Playwright（E2E）
- **构建工具：** Vite（前端）+ tsc（后端）

---

## 5. 系统组件详细设计

### 5.1 Memory Store（内存存储）

**职责：**
- 存储会话期间的所有数据
- 提供快速的读写接口
- 支持重置操作

**接口定义：**
```typescript
interface IMemoryStore {
  // DSL 管理
  saveDSL(id: string, dsl: DSLDocument): void
  getDSL(id: string): DSLDocument | null
  
  // Section 管理
  saveSections(sections: Section[]): void
  getSection(id: string): Section | null
  getAllSections(): Section[]
  
  // 代码管理
  saveCode(sectionId: string, code: string): void
  getCode(sectionId: string): string | null
  
  // Tokens 管理
  saveTokens(tokens: DesignTokens): void
  getTokens(): DesignTokens | null
  
  // 依赖图管理
  saveDependencyGraph(graph: DependencyGraph): void
  getDependencyGraph(): DependencyGraph | null
  
  // 重置
  reset(): void
}
```

---

### 5.2 DSL Parser（DSL 解析器）

**职责：**
- 词法分析和语法分析
- 构建抽象语法树（AST）
- 验证 DSL 语法正确性

**接口定义：**
```typescript
interface IDSLParser {
  parse(dsl: string): Promise<DSLAST>
  validate(dsl: string): ValidationResult
}
```

---

### 5.3 Design Token Extractor（设计令牌提取器）

**职责：**
- 遍历 AST 提取样式值
- 聚类相似值
- 生成 CSS 变量定义

**接口定义：**
```typescript
interface ITokenExtractor {
  extract(ast: DSLAST): DesignTokens
  generateCSSVariables(tokens: DesignTokens): string
}
```

---

### 5.4 Section Analyzer（Section 分析器）

**职责：**
- 识别页面 Section
- 计算复杂度评分
- 构建依赖图

**接口定义：**
```typescript
interface ISectionAnalyzer {
  analyze(ast: DSLAST): SectionManifest
  buildDependencyGraph(sections: Section[]): DependencyGraph
  identifyAffectedSections(
    changedSectionIds: string[], 
    graph: DependencyGraph
  ): Set<string>
}
```

**依赖图算法：**
```typescript
// 找出所有受影响的 Section
function getAffectedSections(
  changedIds: string[], 
  graph: DependencyGraph
): Set<string> {
  const affected = new Set<string>(changedIds)
  const queue = [...changedIds]
  
  while (queue.length > 0) {
    const current = queue.shift()!
    const dependents = graph.edges.get(current) || new Set()
    
    for (const dependent of dependents) {
      if (!affected.has(dependent)) {
        affected.add(dependent)
        queue.push(dependent)
      }
    }
  }
  
  return affected
}
```

---

### 5.5 LLM Generator（LLM 生成器）

**职责：**
- 构建 Section 专用 prompt
- 调用 LLM API（支持重试）
- 管理并行生成任务

**接口定义：**
```typescript
interface ILLMGenerator {
  generate(
    section: Section, 
    tokens: DesignTokens
  ): Promise<string>
  
  generateBatch(
    sections: Section[], 
    tokens: DesignTokens
  ): Promise<Map<string, string>>
}
```

**注意：** 不实现缓存，每次都重新生成

---

### 5.6 Code Assembler（代码组装器）

**职责：**
- 按依赖顺序拼接 Section
- 应用 Design Tokens
- 生成完整的 React 组件

**接口定义：**
```typescript
interface ICodeAssembler {
  assemble(
    sectionCodes: Map<string, string>,
    manifest: SectionManifest,
    tokens: DesignTokens
  ): string
}
```

---

### 5.7 Visual Validator（视觉验证器）

**职责：**
- 渲染生成的代码
- 与设计稿截图对比
- 生成差异热力图

**接口定义：**
```typescript
interface IVisualValidator {
  validate(
    code: string, 
    designScreenshot: Buffer
  ): Promise<ValidationResult>
}
```

---

### 5.8 Correction Engine（修正引擎）

**职责：**
- 分析差异区域
- 调用 LLM 局部修正
- 检测修正收敛

**接口定义：**
```typescript
interface ICorrectionEngine {
  correct(
    code: string, 
    diff: ValidationResult
  ): Promise<string>
  
  checkConvergence(
    history: CorrectionHistory
  ): boolean
}
```

---

## 6. API 设计

### 6.1 核心端点

**上传 DSL**
```
POST /api/v1/dsl
{
  "name": "landing-page",
  "content": "..."
}

Response: 201
{
  "id": "dsl_123",
  "name": "landing-page"
}
```

**创建生成任务**
```
POST /api/v1/generate
{
  "dslId": "dsl_123",
  "options": {
    "outputFormat": "jsx",
    "enableValidation": true
  }
}

Response: 202
{
  "jobId": "job_456",
  "status": "pending"
}
```

**应用补丁（增量更新）**
```
POST /api/v1/patch
{
  "dslId": "dsl_123",
  "patch": {
    "type": "modify",
    "sectionId": "section_2",
    "changes": {...}
  }
}

Response: 202
{
  "jobId": "job_789",
  "affectedSections": ["section_2", "section_3"]
}
```

**重置会话**
```
POST /api/v1/reset

Response: 204
```

---

## 7. 非功能性需求覆盖

### NFR-001: 性能
**需求：** 单个 Section < 10s，完整页面 < 2min

**解决方案：**
- 并行生成
- 内存存储（零 I/O）
- 批量 API 调用

### NFR-002: 增量更新
**需求：** 补丁更新 < 全量生成的 30%

**解决方案：**
- 依赖图管理
- 只重新生成受影响的 Section
- 内存中保持未变更的代码

### NFR-003: 准确性
**需求：** 差异 < 5%

**解决方案：**
- 截图对比
- 智能容差
- 最多 3 次修正

### NFR-004: 简化部署
**需求：** 零配置启动

**解决方案：**
- 无数据库依赖
- 纯内存存储
- 一条命令启动

---

## 8. 部署架构

### 8.1 本地部署

**环境要求：**
- Node.js 20+
- Chrome/Chromium（Puppeteer）

**部署步骤：**
```bash
# 1. 安装依赖
pnpm install

# 2. 配置 API Key
echo "CLAUDE_API_KEY=your_key" > .env

# 3. 启动
pnpm start

# 就这么简单！
```

**目录结构：**
```
dsl2react/
├── server/          # 后端代码
│   ├── parser/      # DSL 解析
│   ├── analyzer/    # Section 分析
│   ├── generator/   # LLM 生成
│   ├── assembler/   # 代码组装
│   ├── validator/   # 验证
│   ├── store/       # 内存存储
│   └── api/         # API 路由
├── client/          # 前端代码
├── shared/          # 共享类型
└── temp/            # 临时文件（自动清理）
```

---

## 9. 测试策略

### 9.1 单元测试
- 覆盖率目标：> 80%
- 测试框架：Vitest
- 重点：解析器、分析器、生成器

### 9.2 集成测试
- API 端到端测试
- LLM 集成测试（Mock）

### 9.3 E2E 测试
- 完整生成流程
- 增量更新流程
- 视觉回归测试

---

## 10. 实施路线图

### 阶段 1：核心架构（2-3 周）
- 实现内存存储
- 实现 DSL 解析器
- 实现 Design Tokens 提取
- 实现 Section 识别

### 阶段 2：生成优化（2-3 周）
- 实现 LLM 生成器
- 实现并行生成
- 实现代码组装器
- 实现依赖图管理

### 阶段 3：质量保障（1-2 周）
- 实现截图对比
- 实现智能容差
- 实现自动修正

### 阶段 4：增量更新（1-2 周）
- 实现补丁解析
- 实现受影响 Section 识别
- 实现增量生成
- 性能测试

---

## 11. 风险和缓解

### 风险 1：内存溢出
**影响：** 中  
**缓解：** 流式处理、限制最大 Section 数量、内存监控

### 风险 2：进程崩溃数据丢失
**影响：** 低（符合设计）  
**缓解：** 提示用户定期导出代码

### 风险 3：LLM API 不稳定
**影响：** 高  
**缓解：** 重试机制、备选 API

---

## 12. 总结

DSL2React v2.0 采用**纯内存 + 五层管道架构**，完全移除了数据库和缓存依赖，实现了极简部署。通过内存中的依赖图管理，支持高效的增量更新。架构设计充分考虑了会话驱动的使用模式，满足"不保留历史、支持增量更新、可随时重置"的需求。

**核心优势：**
- 零配置：无需数据库，一条命令启动
- 高性能：纯内存存储，零 I/O 延迟
- 增量更新：只重新生成变更部分
- 易维护：清晰的分层架构

**下一步：**
- 进行 Sprint 规划
- 开始核心架构实现

---

*文档版本：2.0（简化版）*  
*最后更新：2026-04-25*  
*架构师：System Architect*
