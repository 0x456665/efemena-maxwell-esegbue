export interface PaginatedResponse<T> {
    data: T[];
    count: number;
    page: number;
    limit: number;
}
export interface Response<T> {
    message: string;
    data: T;
}

export interface SuccessResponse {
    success: boolean;
    message: string;
}
