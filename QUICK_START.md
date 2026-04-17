# 🚀 快速开始指南

## 第一步：配置环境

1. 创建 `.env` 文件（参考 `.env.example`）：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的 MasterGo Token：

```env
MG_MCP_TOKEN=mg_your_actual_token_here
MG_FILE_ID=190096496279041
MG_LAYER_ID=11:1602
```

> 💡 提示：从 MasterGo 官网获取你的 API Token

## 第二步：生成初始页面

运行主程序：

```bash
npm run dev
```

生成的文件将保存在 `output` 目录：

- `original-dsl.json` - 原始 MasterGo DSL
- `machine-dsl.json` - 机器 DSL
- `preview.html` - 可编辑的预览页面
- `*.tsx` - React 组件

## 第三步：安装浏览器插件

1. 打开 Chrome：`chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目中的 `extension` 目录

## 第四步：编辑页面

1. 在浏览器中打开 `output/preview.html`
2. 点击浏览器扩展图标打开编辑器
3. 点击页面元素开始编辑：
   - **圆角**：联动模式或独立调整四个角
   - **位置**：X/Y 坐标微调
   - **尺寸**：宽度、高度、gap
   - **裁剪**：overflow 和 object-fit

4. 编辑完成后：
   - 点击 **💾 保存 Patch** 保存修改
   - 点击 **📥 导出 Patch JSON** 下载 patch 文件

## 第五步：应用 Patch 并重新生成

1. 将下载的 `mastergo-dsl-patch.json` 重命名为 `patches.json`
2. 复制到 `output` 目录
3. 再次运行：

```bash
npm run dev
```

4. 检查生成的文件：
   - `final-machine-dsl.json` - 应用 patch 后的机器 DSL
   - `preview-final.html` - 包含修改的预览页面
   - `*.tsx` - 更新的 React 组件

## 完成！🎉

你现在已经完成了完整的工具链流程：

```
MasterGo DSL → 机器 DSL → 预览 HTML → 插件编辑 → Patch → 最终代码
```

## 常见问题

### Q: 如何修改 MasterGo 的文件 ID 和图层 ID？

A: 在 `.env` 文件中修改 `MG_FILE_ID` 和 `MG_LAYER_ID`。

### Q: 插件无法识别页面元素？

A: 确保：
1. 页面是通过 `npm run dev` 生成的
2. HTML 元素包含 `data-dsl-id` 属性
3. 在 Chrome 扩展页面查看插件是否正常加载

### Q: Patch 没有生效？

A: 检查：
1. `patches.json` 是否在 `output` 目录
2. patch 中的 `targetNodeId` 是否正确
3. 查看控制台是否有错误信息

### Q: 生成的 React 代码样式不对？

A: 这可能是因为：
1. 机器 DSL 转换不完整
2. 需要调整 `src/generators/react-code.ts`
3. 某些 MasterGo 特性暂未支持

## 下一步

- 探索 `src/` 目录了解各个模块
- 自定义转换器和生成器
- 添加更多插件功能
- 集成组件库映射

Happy Coding! 💻
