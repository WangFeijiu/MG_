# 快速开始指南

## 5分钟上手自动优化系统

### 第一步：准备环境

确保已安装依赖：

```bash
npm install
```

### 第二步：准备设计稿

将你的设计稿截图放到 `output` 目录，命名为 `design-baseline.png`：

```bash
# 示例：从MasterGo导出设计稿
# 1. 在MasterGo中选中整个页面
# 2. 右键 → 导出 → PNG
# 3. 保存为 design-baseline.png
# 4. 移动到 output 目录

cp ~/Downloads/design.png output/design-baseline.png
```

**重要提示**：
- 设计稿宽度应与DSL中的页面宽度一致（通常是1440px）
- 确保截图包含完整的页面内容
- 使用高质量的PNG格式

### 第三步：运行自动优化

```bash
npm run dev:auto:rebuild
```

这个命令会：
1. 读取现有的DSL文件
2. 生成初始HTML
3. 启动自动优化流程
4. 保存优化后的结果

### 第四步：查看结果

在浏览器中打开：

```bash
# Windows
start output/preview-optimized.html

# Mac
open output/preview-optimized.html

# Linux
xdg-open output/preview-optimized.html
```

## 输出文件说明

优化完成后，你会在 `output` 目录看到以下文件：

```
output/
├── design-baseline.png          # 设计稿（你提供的）
├── machine-dsl.json             # 原始机器DSL
├── optimized-machine-dsl.json   # 优化后的DSL
├── preview.html                 # 初始HTML（会被更新）
└── preview-optimized.html       # 优化后的HTML
```

## 理解优化结果

### 控制台输出

```
[AutoOptimizer] Section 1/13: Navbar
  [Iteration 1/10]
    Diff: 5.23%
    应用修复: 调整布局方向为 row
  [Iteration 2/10]
    Diff: 1.87%
  ✓ 已收敛 (diff: 1.87%)
```

**解读**：
- `Diff: 5.23%` - 当前差异百分比（越小越好）
- `应用修复` - 系统自动应用的修复策略
- `✓ 已收敛` - 差异低于阈值（2%），优化成功

### 结果汇总

```
============================================================
总计: 11/12 个 Section 已收敛
平均迭代次数: 2.3
============================================================
```

**解读**：
- `11/12` - 11个Section成功收敛，1个未收敛
- `平均迭代次数: 2.3` - 平均每个Section需要2.3次迭代

## 常见问题

### Q1: 某些Section一直无法收敛怎么办？

**A**: 可能的原因和解决方案：

1. **颜色差异大**
   - 当前版本颜色修复较简单
   - 建议手动调整DSL中的颜色值

2. **复杂布局**
   - 增加最大迭代次数
   - 或手动调整布局结构

3. **设计稿质量问题**
   - 检查设计稿是否清晰
   - 确保尺寸匹配

### Q2: 如何调整优化参数？

**A**: 编辑 `src/cli/auto-optimize.ts`：

```typescript
const optimizer = new AutoOptimizer({
  maxIterations: 15,           // 增加到15次
  targetDiffThreshold: 0.01,   // 降低到1%（更严格）
  outputDir: "output",
});
```

### Q3: 优化速度慢怎么办？

**A**: 优化速度取决于：
- Section数量
- 页面复杂度
- 迭代次数

**优化建议**：
- 减少 `maxIterations`
- 提高 `targetDiffThreshold`（放宽收敛条件）
- 使用更快的机器

### Q4: 如何只优化特定的Section？

**A**: 修改 `src/cli/auto-optimize.ts`：

```typescript
// 只优化前3个Section
const sectionsToOptimize = sections.slice(0, 3);
const results = await optimizer.optimize(machineDSL, sectionsToOptimize, originalData);
```

## 高级用法

### 编程接口

如果你想在自己的代码中使用优化器：

```typescript
import { AutoOptimizer } from "./optimizers/auto-optimizer";
import { splitSections } from "./generators/section-splitter";

// 创建优化器
const optimizer = new AutoOptimizer({
  maxIterations: 10,
  targetDiffThreshold: 0.02,
});

// 初始化
await optimizer.initialize();

// 运行优化
const sections = splitSections(dsl);
const results = await optimizer.optimize(dsl, sections, originalData);

// 处理结果
for (const result of results) {
  if (result.converged) {
    console.log(`✓ Section收敛: ${result.diffPercent * 100}%`);
  } else {
    console.log(`✗ Section未收敛: ${result.diffPercent * 100}%`);
  }
}

// 清理
await optimizer.cleanup();
```

### 自定义修复策略

如果你想添加自己的修复策略，编辑 `src/optimizers/auto-optimizer.ts`：

```typescript
private generateFixes(analysis, sectionRoot, nodeMap) {
  const fixes = [];
  
  // 你的自定义逻辑
  if (myCustomCondition) {
    fixes.push({
      type: "my-custom-fix",
      description: "我的自定义修复",
      payload: { /* 数据 */ },
    });
  }
  
  return fixes;
}
```

## 下一步

- 📖 阅读 [架构文档](./ARCHITECTURE.md) 了解系统设计
- 📖 阅读 [详细使用指南](./AUTO_OPTIMIZER.md) 了解更多功能
- 🔧 尝试调整优化参数，找到最适合你的配置
- 🚀 将优化器集成到你的工作流中

## 获取帮助

如果遇到问题：

1. 检查控制台输出的错误信息
2. 查看 [故障排查](./AUTO_OPTIMIZER.md#故障排查) 章节
3. 提交 Issue 到项目仓库

祝你使用愉快！🎉
