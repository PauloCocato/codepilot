import { EventEmitter } from 'events';
import type { CodePilotApiClient } from '../api/client';
import type { JobStatus, QueueStats } from '../types';

export interface PollerEvents {
  statsUpdated: [jobs: readonly JobStatus[], stats: QueueStats];
  runCompleted: [job: JobStatus];
  runFailed: [job: JobStatus];
  connectionChanged: [connected: boolean];
}

export class Poller extends EventEmitter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly previousStates = new Map<string, string>();
  private isFirstPoll = true;
  private wasConnected = true;

  constructor(
    private readonly client: CodePilotApiClient,
    private intervalMs: number,
  ) {
    super();
  }

  start(): void {
    if (this.intervalId) {
      return;
    }
    this.isFirstPoll = true;
    this.previousStates.clear();
    void this.poll();
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setInterval(ms: number): void {
    this.intervalMs = ms;
  }

  dispose(): void {
    this.stop();
  }

  private async poll(): Promise<void> {
    try {
      const healthResult = await this.client.checkHealth();
      if (!healthResult.success) {
        if (this.wasConnected) {
          this.wasConnected = false;
          this.emit('connectionChanged', false);
        }
        return;
      }

      if (!this.wasConnected) {
        this.wasConnected = true;
        this.emit('connectionChanged', true);
      }

      const [jobsResult, statsResult] = await Promise.all([
        this.client.getRecentJobs(),
        this.client.getQueueStats(),
      ]);

      if (!jobsResult.success || !statsResult.success) {
        return;
      }

      const jobs = jobsResult.data;
      const stats = statsResult.data;

      this.emit('statsUpdated', jobs, stats);

      if (!this.isFirstPoll) {
        for (const job of jobs) {
          const previousState = this.previousStates.get(job.id);
          if (previousState && previousState !== job.state) {
            if (job.state === 'completed') {
              this.emit('runCompleted', job);
            } else if (job.state === 'failed') {
              this.emit('runFailed', job);
            }
          }
        }
      }

      this.previousStates.clear();
      for (const job of jobs) {
        this.previousStates.set(job.id, job.state);
      }

      this.isFirstPoll = false;
    } catch {
      if (this.wasConnected) {
        this.wasConnected = false;
        this.emit('connectionChanged', false);
      }
    }
  }
}
