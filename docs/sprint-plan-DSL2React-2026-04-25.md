# Sprint 计划：DSL2React

**日期：** 2026-04-25  
**Scrum Master：** Scrum Master  
**项目级别：** Level 2  
**总故事数：** 14  
**总点数：** 58 点  
**计划 Sprint 数：** 4  
**团队容量：** 15 点/Sprint

---

## 执行摘要

DSL2React 项目将分 4 个 Sprint 完成核心功能开发。采用五层管道架构（解析 → 分析 → 生成 → 组装 → 验证），实现 MasterGo DSL 到 React 代码的自动化转换，支持增量更新和质量验证。

**关键指标：**
- 总故事数：14
- 总点数：58 点
- Sprint 数：4
- 团队容量：15 点/Sprint
- 目标完成：4 周后

---

## 故事清单

### STORY-000: 项目初始化和开发环境

**优先级：** Must Have  
**点数：** 2

**用户故事：**
作为开发者
我想要搭建项目基础架构
以便开始功能开发

**验收标准：**
- [ ] 初始化 Node.js + TypeScript 项目
- [ ] 配置 ESLint + Prettier
- [ ] 配置 Vitest 测试框架
- [ ] 创建基础目录结构（server/, client/, shared/）
- [ ] 配置环境变量管理（.env）
- [ ] README 包含启动说明

**技术说明：**
- 使用 pnpm 作为包管理器
- TypeScript 5+
- 配置 tsconfig.json

**依赖：** 无

---

### STORY-001: 实现 DSL 解析器

**优先级：** Must Have  
**点数：** 5

**用户故事：**
作为系统
我想要解析 MasterGo DSL
以便构建抽象语法树

**验收标准：**
- [ ] 实现 DSL 词法分析器
- [ ] 实现 DSL 语法分析器
- [ ] 构建 AST 数据结构
- [ ] 实现 AST 遍历接口
- [ ] 单元测试覆盖率 > 80%
- [ ] 支持错误处理和位置信息

**技术说明：**
- 使用递归下降解析或 PEG.js
- 定义 DSLAST 接口
- 实现 IDSLParser 接口

**依赖：** STORY-000

---

### STORY-002: 实现 Design Tokens 提取器

**优先级：** Must Have  
**点数：** 3

**用户故事：**
作为系统
我想要从 DSL 中提取设计令牌
以便保证全局样式一致性

**验收标准：**
- [ ] 遍历 AST 提取颜色、字体、间距等样式值
- [ ] 实现相似值聚类算法
- [ ] 生成 CSS 变量定义
- [ ] 构建 Token 索引
- [ ] 单元测试覆盖率 > 80%

**技术说明：**
- 实现 ITokenExtractor 接口
- 定义 DesignTokens 数据结构
- 颜色聚类使用色差算法

**依赖：** STORY-001

---

### STORY-003: 实现 Section 识别算法

**优先级：** Must Have  
**点数：** 5

**用户故事：**
作为系统
我想要智能识别页面 Section
以便将长页面拆分为可管理的单元

**验收标准：**
- [ ] 基于布局层级识别 Section
- [ ] 基于间距识别 Section 边界
- [ ] 基于语义标签识别 Section
- [ ] 计算 Section 复杂度评分
- [ ] 生成 section-manifest.json
- [ ] 单元测试覆盖率 > 80%

**技术说明：**
- 实现 ISectionAnalyzer 接口
- 复杂度评分算法：节点数 30% + 嵌套深度 20% + 样式多样性 20% + 交互元素 30%

**依赖：** STORY-001

---

### STORY-004: 实现依赖图管理

**优先级：** Must Have  
**点数：** 3

**用户故事：**
作为系统
我想要构建 Section 依赖图
以便支持增量更新

**验收标准：**
- [ ] 构建 Section 依赖图数据结构
- [ ] 实现拓扑排序算法
- [ ] 实现受影响 Section 识别算法
- [ ] 单元测试覆盖率 > 80%

**技术说明：**
- 定义 DependencyGraph 接口
- 使用 BFS 算法识别受影响的 Section

**依赖：** STORY-003

---

### STORY-005: 实现内存存储

**优先级：** Must Have  
**点数：** 2

**用户故事：**
作为系统
我想要在内存中存储会话数据
以便快速访问和支持重置

**验收标准：**
- [ ] 实现 InMemoryStore 类
- [ ] 支持 DSL、Section、代码、Tokens 存储
- [ ] 实现 reset() 方法
- [ ] 单元测试覆盖率 > 80%

**技术说明：**
- 使用 Map 数据结构
- 实现 IMemoryStore 接口

**依赖：** STORY-000

---

### STORY-006: 实现 LLM 生成器

**优先级：** Must Have  
**点数：** 5

**用户故事：**
作为系统
我想要调用 LLM API 生成代码
以便将 Section 转换为 React 代码

**验收标准：**
- [ ] 集成 Claude API
- [ ] 构建 Section 专用 prompt
- [ ] 实现重试机制（最多 3 次）
- [ ] 实现超时控制
- [ ] 支持并行生成
- [ ] 单元测试（Mock LLM）

**技术说明：**
- 实现 ILLMGenerator 接口
- 使用 @anthropic-ai/sdk
- 动态调整 temperature 和 max_tokens

**依赖：** STORY-003, STORY-002

---

### STORY-007: 实现代码组装器

**优先级：** Must Have  
**点数：** 3

**用户故事：**
作为系统
我想要拼接 Section 代码
以便生成完整的 React 组件

**验收标准：**
- [ ] 按依赖顺序拼接 Section
- [ ] 应用 Design Tokens（CSS 变量）
- [ ] 统一 CSS 命名规范
- [ ] 生成完整的 React 组件
- [ ] 单元测试覆盖率 > 80%

**技术说明：**
- 实现 ICodeAssembler 接口
- 使用模板引擎或字符串拼接

**依赖：** STORY-006, STORY-002

---

### STORY-008: 实现截图对比功能

**优先级：** Must Have  
**点数：** 5

**用户故事：**
作为系统
我想要对比生成代码和设计稿
以便验证视觉准确性

**验收标准：**
- [ ] 集成 Puppeteer 渲染代码
- [ ] 集成 Pixelmatch 对比截图
- [ ] 生成差异热力图
- [ ] 计算差异百分比
- [ ] 识别问题区域坐标
- [ ] 单元测试（Mock 浏览器）

**技术说明：**
- 实现 IVisualValidator 接口
- 使用 Puppeteer 无头浏览器
- 使用 Pixelmatch 像素对比

**依赖：** STORY-007

---

### STORY-009: 实现智能容差算法

**优先级：** Should Have  
**点数：** 3

**用户故事：**
作为系统
我想要根据 Section 类型动态调整容差
以便减少误报

**验收标准：**
- [ ] 实现 Section 类型识别（文本/图片/布局）
- [ ] 为不同类型设置不同容差
- [ ] 文本：低容差，图片：高容差，布局：中容差
- [ ] 单元测试覆盖率 > 80%

**技术说明：**
- 扩展 IVisualValidator 接口
- 容差配置可调

**依赖：** STORY-008

---

### STORY-010: 实现自动修正引擎

**优先级：** Must Have  
**点数：** 5

**用户故事：**
作为系统
我想要基于差异自动修正代码
以便提高生成质量

**验收标准：**
- [ ] 分析差异区域
- [ ] 构建修正 prompt
- [ ] 调用 LLM 局部修正
- [ ] 实现修正收敛检测（最多 3 次）
- [ ] 记录修正历史
- [ ] 单元测试（Mock LLM）

**技术说明：**
- 实现 ICorrectionEngine 接口
- 检测差异值是否下降

**依赖：** STORY-008, STORY-006

---

### STORY-011: 实现增量更新 API

**优先级：** Must Have  
**点数：** 5

**用户故事：**
作为用户
我想要通过补丁方式更新 DSL
以便只重新生成变更部分

**验收标准：**
- [ ] 实现补丁解析
- [ ] 识别变更的 Section
- [ ] 查询依赖图找出受影响的 Sections
- [ ] 只重新生成受影响的 Sections
- [ ] 重新组装代码
- [ ] API 端点：POST /api/v1/patch

**技术说明：**
- 使用依赖图算法
- 保持未变更 Section 的代码

**依赖：** STORY-004, STORY-006, STORY-007

---

### STORY-012: 实现核心 API 端点

**优先级：** Must Have  
**点数：** 3

**用户故事：**
作为用户
我想要通过 API 使用系统
以便集成到工作流中

**验收标准：**
- [ ] POST /api/v1/dsl - 上传 DSL
- [ ] POST /api/v1/generate - 创建生成任务
- [ ] GET /api/v1/generate/:jobId - 查询状态
- [ ] GET /api/v1/generate/:jobId/result - 获取结果
- [ ] POST /api/v1/reset - 重置会话
- [ ] WebSocket 实时进度推送
- [ ] API 文档

**技术说明：**
- 使用 Express 框架
- WebSocket 使用 ws 库

**依赖：** STORY-005, STORY-006, STORY-007

---

### STORY-013: 实现前端界面

**优先级：** Should Have  
**点数：** 8

**用户故事：**
作为用户
我想要通过 Web 界面使用系统
以便可视化操作

**验收标准：**
- [ ] DSL 上传界面
- [ ] 生成进度显示
- [ ] 代码预览和下载
- [ ] 截图对比可视化
- [ ] 差异热力图展示
- [ ] 响应式设计

**技术说明：**
- React 18 + TypeScript
- Vite 构建
- 使用 Ant Design 或 Material UI

**依赖：** STORY-012

---

### STORY-014: 性能测试和优化

**优先级：** Should Have  
**点数：** 3

**用户故事：**
作为开发者
我想要验证系统性能
以便满足性能目标

**验收标准：**
- [ ] 单个 Section 生成时间 < 10s
- [ ] 完整页面生成时间 < 2min
- [ ] 100+ Section 的设计稿内存使用 < 2GB
- [ ] 增量更新时间 < 全量生成的 30%
- [ ] 性能测试报告

**技术说明：**
- 使用 Vitest 性能测试
- 监控内存使用

**依赖：** STORY-011

---

## Sprint 分配

### Sprint 1（第 1 周）- 15/15 点

**目标：** 完成核心架构和基础组件

**故事：**
- STORY-000: 项目初始化（2 点）- Must Have
- STORY-001: DSL 解析器（5 点）- Must Have
- STORY-002: Design Tokens 提取器（3 点）- Must Have
- STORY-003: Section 识别算法（5 点）- Must Have

**总计：** 15 点 / 15 容量（100% 利用率）

**风险：**
- Section 识别算法可能比预期复杂

**里程碑：**
- 能够解析 DSL 并识别 Section

---

### Sprint 2（第 2 周）- 13/15 点

**目标：** 完成生成和组装功能

**故事：**
- STORY-004: 依赖图管理（3 点）- Must Have
- STORY-005: 内存存储（2 点）- Must Have
- STORY-006: LLM 生成器（5 点）- Must Have
- STORY-007: 代码组装器（3 点）- Must Have

**总计：** 13 点 / 15 容量（87% 利用率）

**风险：**
- LLM API 集成可能遇到问题

**里程碑：**
- 能够生成完整的 React 代码

---

### Sprint 3（第 3 周）- 16/15 点

**目标：** 完成质量验证和修正

**故事：**
- STORY-008: 截图对比功能（5 点）- Must Have
- STORY-009: 智能容差算法（3 点）- Should Have
- STORY-010: 自动修正引擎（5 点）- Must Have
- STORY-012: 核心 API 端点（3 点）- Must Have

**总计：** 16 点 / 15 容量（107% 利用率，略超）

**风险：**
- Puppeteer 配置可能耗时
- 容量略超，可能需要调整

**里程碑：**
- 完整的生成 + 验证 + 修正流程

---

### Sprint 4（第 4 周）- 16/15 点

**目标：** 完成增量更新和前端界面

**故事：**
- STORY-011: 增量更新 API（5 点）- Must Have
- STORY-013: 前端界面（8 点）- Should Have
- STORY-014: 性能测试和优化（3 点）- Should Have

**总计：** 16 点 / 15 容量（107% 利用率，略超）

**风险：**
- 前端开发可能耗时较长
- 可以考虑将前端界面延后

**里程碑：**
- 完整可用的系统

---

## Epic 可追溯性

| Epic | 故事 | 总点数 | Sprint |
|------|------|--------|--------|
| 核心架构 | STORY-000, 001, 002, 003, 004, 005 | 20 点 | Sprint 1-2 |
| 代码生成 | STORY-006, 007 | 8 点 | Sprint 2 |
| 质量验证 | STORY-008, 009, 010 | 13 点 | Sprint 3 |
| API 和集成 | STORY-011, 012 | 8 点 | Sprint 3-4 |
| 用户界面 | STORY-013 | 8 点 | Sprint 4 |
| 性能优化 | STORY-014 | 3 点 | Sprint 4 |

---

## 功能需求覆盖

基于架构文档的核心特性：

| 功能需求 | 故事 | Sprint |
|---------|------|--------|
| DSL 解析 | STORY-001 | 1 |
| Design Tokens 提取 | STORY-002 | 1 |
| Section 识别 | STORY-003 | 1 |
| 依赖图管理 | STORY-004 | 2 |
| LLM 生成 | STORY-006 | 2 |
| 代码组装 | STORY-007 | 2 |
| 截图对比 | STORY-008 | 3 |
| 自动修正 | STORY-010 | 3 |
| 增量更新 | STORY-011 | 4 |
| API 接口 | STORY-012 | 3 |
| Web 界面 | STORY-013 | 4 |

---

## 风险和缓解

### 高风险

**风险 1：LLM API 不稳定或超时**
- 影响：阻塞生成功能
- 缓解：实现重试机制、超时控制、备选 API（OpenAI）

**风险 2：Section 识别准确性不足**
- 影响：生成质量差
- 缓解：提供可视化调试工具、支持人工调整

### 中风险

**风险 3：Puppeteer 配置复杂**
- 影响：延迟截图对比功能
- 缓解：提前研究配置、准备 Docker 镜像

**风险 4：Sprint 3-4 容量略超**
- 影响：可能无法按时完成
- 缓解：优先完成 Must Have 故事，Should Have 可延后

### 低风险

**风险 5：前端开发耗时**
- 影响：Sprint 4 可能延期
- 缓解：前端是 Should Have，可以延后或简化

---

## 依赖关系

**外部依赖：**
- Claude API 访问权限
- Node.js 20+ 环境
- Chrome/Chromium（Puppeteer）

**技术依赖：**
- STORY-001 是基础，阻塞 002, 003
- STORY-006 依赖 002, 003
- STORY-008 依赖 007
- STORY-011 依赖 004, 006, 007

---

## 完成定义（Definition of Done）

故事被认为完成需要满足：

- [ ] 代码实现并提交到 Git
- [ ] 单元测试编写并通过（覆盖率 ≥ 80%）
- [ ] 集成测试通过
- [ ] 代码审查完成
- [ ] 文档更新（API 文档、README）
- [ ] 本地测试通过
- [ ] 验收标准全部满足

---

## 下一步

**立即开始：** Sprint 1

运行以下命令开始实施：
- `/dev-story STORY-000` - 开始项目初始化
- `/dev-story STORY-001` - 开始 DSL 解析器开发

**Sprint 节奏：**
- Sprint 长度：1 周
- Sprint 计划：每周一
- Sprint 回顾：每周五
- 每日站会：可选（单人团队）

---

**本计划使用 BMAD Method v6 - Phase 4（实施规划）创建**

*预计完成时间：4 周*  
*总工作量：58 点 ≈ 116 小时*
