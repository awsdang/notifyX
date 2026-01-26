export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code?: string;
        message: string;
        details?: any;
    };
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}
