export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface ScrapedContent {
  title: string;
  content: string;
  textContent: string;
  excerpts: string[];
  url: string;
  metadata: Record<string, string>;
}

export interface Material {
  tags?: string[];
  id: string;
  user_id: string;
  encrypted_content: string;
  encryption_iv: string;
  encryption_salt: string;
  content_hash: string;
  source_url: string | null;
  source_title: string | null;
  content_type: string;
  word_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  content_iv?: string | null;
  encryption_version?: number;
  image_ids?: string[];
  id: string;
  user_id: string;
  material_id: string | null;
  encrypted_title: string;
  encrypted_content: string;
  encryption_iv: string;
  encryption_salt: string;
  title_hash: string | null;
  status: "draft" | "ready" | "published";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ImageRecord {
  id: string;
  user_id: string;
  r2_key: string;
  r2_url: string;
  original_filename: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface PublishedPost {
  id: string;
  user_id: string;
  draft_id: string | null;
  xhs_post_id: string | null;
  xhs_post_url: string | null;
  publish_status: "published" | "failed" | "deleted";
  published_at: string;
}

export interface PostAnalytics {
  id: string;
  published_post_id: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  collected_at: string;
}

export interface UserSettings {
  apiKey: string;
  backendUrl: string;
  aiModel: string;
}

export interface AIUsage {
  id: string;
  operation_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
}
