import type { Draft, ImageRecord, Material, PaginatedResponse, PublishedPost } from "../../shared/types";
import { apiDelete, apiGet, apiPost, apiPut, apiPostStream } from "../lib/api";

// Materials
export function useMaterialAPI() {
  return {
    list: (page = 1, tag?: string) =>
      apiGet<PaginatedResponse<Material>>(`/materials?page=${page}&limit=20${tag ? `&tag=${tag}` : ""}`),
    get: (id: string) => apiGet<Material>(`/materials/${id}`),
    create: (data: Record<string, unknown>) => apiPost<Material>("/materials", data),
    delete: (id: string) => apiDelete(`/materials/${id}`),
  };
}

// Drafts
export function useDraftAPI() {
  return {
    list: (status?: string, page = 1) =>
      apiGet<PaginatedResponse<Draft>>(`/drafts?page=${page}&limit=20${status ? `&status=${status}` : ""}`),
    get: (id: string) => apiGet<Draft>(`/drafts/${id}`),
    create: (data: Record<string, unknown>) => apiPost<Draft>("/drafts", data),
    update: (id: string, data: Record<string, unknown>) => apiPut<Draft>(`/drafts/${id}`, data),
    delete: (id: string) => apiDelete(`/drafts/${id}`),
  };
}

// Images
export function useImageAPI() {
  return {
    list: (page = 1) => apiGet<PaginatedResponse<ImageRecord>>(`/images?page=${page}&limit=20`),
    delete: (id: string) => apiDelete(`/images/${id}`),
  };
}

// AI
export function useAI() {
  return {
    summarize: (content: string, maxLength?: number) =>
      apiPost<{ summary: string; key_points: string[] }>("/ai/summarize", { content, max_length: maxLength }),
    generateTitles: (content: string, count = 5) =>
      apiPost<{ titles: string[] }>("/ai/generate-titles", { content, count }),
    rewrite: (content: string, style?: string, instruction?: string, onChunk?: (chunk: string) => void) => {
      if (onChunk) return apiPostStream("/ai/rewrite", { content, style, instruction }, onChunk);
      return apiPost("/ai/rewrite", { content, style, instruction });
    },
    polish: (content: string) => apiPost<{ polished: string }>("/ai/polish", { content }),
    outline: (materials: { title: string; content: string }[]) =>
      apiPost<{ outline: { section: string; key_points: string[] }[] }>("/ai/outline", { materials }),
  };
}

// Publish
export function usePublishAPI() {
  return {
    publish: (data: Record<string, unknown>) =>
      apiPost<{ job_id: string; status: string }>("/publish", data),
    status: (jobId: string) =>
      apiGet<{ status: string; xhs_post_id?: string; xhs_post_url?: string; error?: string }>(`/publish/status/${jobId}`),
  };
}

// Analytics
export function useAnalyticsAPI() {
  return {
    posts: (days = 30) => apiGet<{ posts: unknown[] }>(`/analytics/posts?days=${days}`),
    refresh: () => apiPost<{ refreshed: number }>("/analytics/refresh"),
  };
}
