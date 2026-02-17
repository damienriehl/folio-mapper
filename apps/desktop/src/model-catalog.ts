export interface ModelCatalogEntry {
  id: string;
  name: string;
  filename: string;
  url: string;
  sizeBytes: number;
  description: string;
  recommended?: boolean;
}

export type ModelDownloadState = "idle" | "downloading" | "complete" | "error";

export interface ModelStatus {
  id: string;
  name: string;
  filename: string;
  description: string;
  sizeBytes: number;
  recommended?: boolean;
  downloaded: boolean;
  active: boolean;
  downloadState: ModelDownloadState;
  downloadProgress?: {
    bytesDownloaded: number;
    bytesTotal: number;
  };
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "qwen2.5-7b",
    name: "Qwen 2.5 7B Instruct",
    filename: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    sizeBytes: 4_683_000_000,
    description: "Best overall quality for classification tasks. Recommended for most systems with 8+ GB RAM.",
    recommended: true,
  },
  {
    id: "llama-3.1-8b",
    name: "Llama 3.1 8B Instruct",
    filename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    sizeBytes: 4_920_000_000,
    description: "Strong general-purpose model from Meta. Good at structured output and following instructions.",
  },
  {
    id: "mistral-7b",
    name: "Mistral 7B Instruct v0.3",
    filename: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    sizeBytes: 4_370_000_000,
    description: "Fast and efficient. Good balance of speed and accuracy for classification.",
  },
  {
    id: "phi-3.5-mini",
    name: "Phi 3.5 Mini Instruct",
    filename: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    sizeBytes: 2_390_000_000,
    description: "Compact Microsoft model. Runs well on systems with limited RAM (4+ GB).",
  },
  {
    id: "qwen2.5-3b",
    name: "Qwen 2.5 3B Instruct",
    filename: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    sizeBytes: 2_060_000_000,
    description: "Smallest option. Fast inference on low-end hardware, but less accurate.",
  },
];
