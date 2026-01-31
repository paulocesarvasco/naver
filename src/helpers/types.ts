export type ResponsePayload = {
  requestID: string;
  result: any;
};

export type PageResponse<T> = {
  data: {
    cursor: number;
    hasMore: boolean;
    total: number;
    data: T[];
  };
};

export type WorkerRequestMessage =
  | { type: 'scan'; request_id: string; url: string; step: number; batch: boolean }
  | { type: 'shutdown' };

export type WorkerResponseMessage =
  | { type: 'scan_finish'; request_id: string; worker_name: string }
  | { type: 'scan_error'; request_id: string; error: string; worker_name: string }
  | { type: 'worker_started'; worker_name: string };
