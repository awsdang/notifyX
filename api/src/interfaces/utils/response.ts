/**
 * Standard response envelope — matches spec:
 * { error: boolean, message: string, data: any, totalCount?: number }
 */
export interface ApiResponse<T> {
  error: boolean;
  message: string;
  data: T | null;
  totalCount?: number;
}
