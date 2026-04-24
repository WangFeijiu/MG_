/**
 * 生成配置类型定义
 */

export type StyleMode = "inline" | "tailwind" | "module-scss" | "plain-css";

export type ComponentSource =
  | { type: "local"; path: string }      // 本地路径，如 ./components
  | { type: "npm"; name: string; paths?: string[] }; // npm 包，可选子路径

export type GenConfig = {
  components?: ComponentSource[];          // 组件库列表
  codeStyleFile?: string;                 // ESLint/Prettier 配置文件路径
  styleMode?: StyleMode;                 // 样式输出方式
};

/**
 * 组件匹配结果
 */
export type ComponentMatch = {
  nodeId: string;
  componentName: string;
  componentPath: string;
  score?: number;
};
