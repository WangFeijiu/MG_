/**
 * 默认生成配置
 */

import type { GenConfig } from "../types/gen-config.js";

export const DEFAULT_GEN_CONFIG: GenConfig = {
  styleMode: "inline",
  components: [],
  codeStyleFile: "",
};

/**
 * 合并用户配置与默认配置
 */
export function mergeConfig(userConfig: Partial<GenConfig> | undefined): GenConfig {
  if (!userConfig) return DEFAULT_GEN_CONFIG;

  return {
    styleMode: userConfig.styleMode ?? DEFAULT_GEN_CONFIG.styleMode,
    components: userConfig.components ?? DEFAULT_GEN_CONFIG.components,
    codeStyleFile: userConfig.codeStyleFile ?? DEFAULT_GEN_CONFIG.codeStyleFile,
  };
}
