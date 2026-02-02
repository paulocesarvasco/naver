export interface ResponsePayload {
  requestID: string;
  result: any;
}

export interface PageResponse {
  data: {
    cursor: number;
    hasMore: boolean;
    total: number;
    data: [];
  };
}

export type WorkerRequestMessage =
  | { type: 'scan'; request_id: string; url: string; step: number; batch: boolean }
  | { type: 'shutdown' }
  | { type: 'cancel' };

export type WorkerResponseMessage =
  | { type: 'scan_finish'; request_id: string; worker_name: string }
  | { type: 'scan_error'; request_id: string; error: string; worker_name: string }
  | { type: 'worker_started'; worker_name: string };

export type RequestInfo = {
  workers: string[];
  ongoingRequests: number;
};

export interface IPInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  loc: string;
  org: string;
  postal: string;
  asn: string;
  timezone: string;
}

export interface SessionCookie {
  domain: string;
  name: string;
  path: string;
  value: string;
}

export interface OEPConfigCookie {
  path: string;
  domain: string;
  name: string;
  value: string;
  expires: number;
}

export type WaitForEventOptions<T> = {
  timeout?: number;
  filter: (value: T) => boolean;
};

export type Task<T> = {
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};
