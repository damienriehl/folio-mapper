export interface EmbeddingStatus {
  available: boolean;
  provider: string | null;
  model: string | null;
  dimension: number | null;
  num_concepts: number | null;
  index_cached: boolean;
  error: string | null;
}
