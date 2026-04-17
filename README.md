# MasterGo DSL 工具链

> 高还原度页面生成 + 可视化微调 + 最终项目代码输出

## 🎯 核心理念

**HTML 只是编辑预览层，机器 DSL 才是真相。**

## 📋 完整链路

```text
MasterGo DSL
→ 统一机器 DSL
→ 预览 HTML（带 data-dsl-id）
→ 浏览器插件调整样式/布局
→ 保存 patch JSON
→ patch 回写机器 DSL
→ 基于机器 DSL 生成项目代码
```

```text
MasterGo 设计稿
→ 获取 MasterGo DSL (通过 MCP)  (往往会丢失挺多细节 比如圆角 border类型)
→ 转换为机器 DSL  (也可以增强缺失属性)
→ 生成预览 HTML (带 data-dsl-id)
→ 浏览器插件可视化编辑       
→ 导出 Patch JSON  
→ Patch 回写机器 DSL   
→ 生成最终 React 代码 (考虑进一步发展：独立一个项目，可以引用公共组件库UI和业务组件库 text-[24px] -> text-xxl 直接替换成UI规范中的变量)
```
MasterGo DSL = 设计稿原始描述
机器 DSL = 为代码生成/渲染加工后的描述

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
MG_MCP_TOKEN=your_mastergo_token
MG_FILE_ID=190096496279041
MG_LAYER_ID=11:1644
```

### 3. 运行工具链

```bash
npm run dev
```

这将自动执行以下步骤：

1. 从 MasterGo 获取原始 DSL
2. 转换为机器 DSL
3. 生成预览 HTML
4. 检查并应用 patch
5. 生成最终 React 代码

所有输出文件将保存在 `output` 目录中。

## 🎨 使用浏览器插件编辑

### 1. 加载插件

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension` 目录

### 2. 编辑页面

1. 在浏览器中打开 `output/preview.html`
2. 点击扩展图标打开编辑面板
3. 点击页面上的元素开始编辑
4. 调整圆角、位置、尺寸、裁剪等属性
5. 点击"保存 Patch"按钮
6. 点击"导出 Patch JSON"导出修改

### 3. 应用 Patch 并重新生成

1. 将导出的 `mastergo-dsl-patch.json` 重命名为 `patches.json`
2. 将其复制到 `output` 目录
3. 再次运行 `npm run dev`
4. 工具会自动应用 patch 并生成最终代码

## 📁 项目结构

```
.
├── src/
│   ├── types/              # TypeScript 类型定义
│   │   ├── machine-dsl.ts  # 机器 DSL 类型
│   │   └── patch.ts        # Patch 类型
│   ├── converters/         # 转换器
│   │   └── mastergo-to-machine.ts  # MasterGo DSL → 机器 DSL
│   ├── generators/         # 生成器
│   │   ├── html-preview.ts # 机器 DSL → 预览 HTML
│   │   └── react-code.ts   # 机器 DSL → React 代码
│   ├── utils/              # 工具函数
│   │   └── patch.ts        # Patch 处理工具
│   └── index.ts            # 主入口
├── extension/              # 浏览器插件
│   ├── manifest.json       # 插件配置
│   ├── popup.html          # 插件 UI
│   ├── popup.js            # 插件逻辑
│   ├── content.js          # 页面注入脚本
│   └── content.css         # 注入样式
├── output/                 # 输出目录
│   ├── original-dsl.json   # 原始 MasterGo DSL
│   ├── machine-dsl.json    # 机器 DSL
│   ├── preview.html        # 预览 HTML
│   ├── patches.json        # Patch 文件
│   ├── final-machine-dsl.json  # 应用 patch 后的机器 DSL
│   └── *.tsx               # 生成的 React 组件
└── README.md               # 本文档
```

## 🔧 核心功能

### 1. 机器 DSL

统一的中间表示，包含：

- **布局**：flex/absolute、方向、对齐、间距
- **样式**：背景、文本、圆角、overflow、阴影等
- **内容**：文本、图片
- **元信息**：源节点 ID、组件提示

### 2. Patch 系统

所有修改都以语义化的 patch 存储：

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

支持的操作类型：

- `update_style`: 更新样式
- `update_layout`: 更新布局
- `update_content`: 更新内容

### 3. 浏览器插件功能

#### 圆角编辑
- 全部联动/四角独立
- 预设值：0/4/8/12/16/24/32/全圆

#### 位置调整
- X/Y 坐标调整

#### 尺寸调整
- 宽度/高度
- gap 间距

#### 裁剪相关
- overflow: visible/hidden
- objectFit: fill/contain/cover

## 📝 示例 Patch 文档

```json
{
  "version": 1,
  "patches": [
    {
      "id": "patch_001",
      "targetNodeId": "node_hero",
      "op": "update_style",
      "payload": {
        "borderRadius": {
          "linked": true,
          "topLeft": 16,
          "topRight": 16,
          "bottomRight": 16,
          "bottomLeft": 16
        },
        "overflow": "hidden"
      }
    },
    {
      "id": "patch_002",
      "targetNodeId": "node_title",
      "op": "update_layout",
      "payload": {
        "y": 96
      }
    }
  ]
}
```

## 🎯 最终代码生成重点

生成的 React 代码专注于高还原度：

1. **容器还原**：div/flex/absolute/padding/gap
2. **文本还原**：字号/粗细/行高/颜色/对齐
3. **图片还原**：src/宽高/object-fit/圆角/裁切
4. **卡片视觉**：border-radius/overflow/box-shadow/border

## 🔑 关键实现点

### 1. 节点 ID 绑定必须稳定

HTML 中的 `data-dsl-id` 永远映射到机器 DSL 节点：

```html
<div class="dsl-node dsl-container" data-dsl-id="node_hero" data-dsl-type="container">
  ...
</div>
```

### 2. Patch 必须是语义化的

不要存：
```json
{ "style": "border-radius:16px; overflow:hidden;" }
```

要存：
```json
{
  "borderRadius": {
    "linked": true,
    "topLeft": 16,
    "topRight": 16,
    "bottomRight": 16,
    "bottomLeft": 16
  },
  "overflow": "hidden"
}
```

## 📖 API 文档

### convertMasterGoToMachine(masterGoDSL)

将 MasterGo DSL 转换为机器 DSL。

### generatePreviewHTML(machineDSL)

生成带有 `data-dsl-id` 的预览 HTML。

### generateReactCode(machineDSL)

生成 React 组件代码。

### applyPatches(machineDSL, patchDocument)

应用 patch 到机器 DSL，返回新的 DSL 对象。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT
