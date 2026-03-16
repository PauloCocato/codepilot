import type {
  HealthResponse,
  QueueStats,
  JobStatus,
  RepoInfo,
  EnqueueRequest,
  EnqueueResponse,
  ApiResult,
} from '../types';

export class CodePilotApiClient {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  updateServerUrl(url: string): void {
    this.serverUrl = url;
  }

  async checkHealth(): Promise<ApiResult<HealthResponse>> {
    return this.request<HealthResponse>('/health');
  }

  async getQueueStats(): Promise<ApiResult<QueueStats>> {
    return this.request<QueueStats>('/api/queue/stats');
  }

  async getRecentJobs(limit = 20): Promise<ApiResult<readonly JobStatus[]>> {
    return this.request<readonly JobStatus[]>(`/api/queue/jobs?limit=${limit}`);
  }

  async getJobStatus(jobId: string): Promise<ApiResult<JobStatus>> {
    return this.request<JobStatus>(`/api/queue/jobs/${encodeURIComponent(jobId)}`);
  }

  async enqueueIssue(data: EnqueueRequest): Promise<ApiResult<EnqueueResponse>> {
    return this.request<EnqueueResponse>('/api/queue/enqueue', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listRepos(): Promise<ApiResult<readonly RepoInfo[]>> {
    return this.request<readonly RepoInfo[]>('/api/repos');
  }

  async getRepo(owner: string, repo: string): Promise<ApiResult<RepoInfo>> {
    return this.request<RepoInfo>(
      `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
  }

  private async request<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`${this.serverUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        return {
          success: false,
          error: (body as { error?: string }).error || `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as T;
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
