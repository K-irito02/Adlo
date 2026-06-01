import type { ModelProviderId } from "@ai-digital-life/kernel";

export const DIFF_LAYOUT_STORAGE_KEY = "adl-diff-side-by-side";

export const MODEL_PROVIDER_IDS: ModelProviderId[] = ["deepseek", "minimax"];

export interface ModelOption {
  id: string;
  label: string;
}

export const MODEL_OPTIONS: Record<ModelProviderId, ModelOption[]> = {
  deepseek: [
    { id: "deepseek-v4-pro", label: "deepseek-v4-pro" },
    { id: "deepseek-chat", label: "deepseek-Chat" },
    { id: "deepseek-reasoner", label: "deepseek-reasoner" }
  ],
  minimax: [
    { id: "MiniMax-M2.7", label: "MiniMax-M2.7" },
    { id: "MiniMax-M2.5", label: "MiniMax-M2.5" }
  ]
};
