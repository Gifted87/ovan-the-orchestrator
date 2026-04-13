export type JobStatus = 'idle' | 'running' | 'paused' | 'completed' | 'aborted';

export interface Phase {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'completed';
}

export interface FeedItem {
  id: string;
  timestamp: number;
  message: string;
}

export interface Artifact {
  name: string;
  content: string;
}

export interface JobState {
  id?: string;
  status: JobStatus;
  startTime: number | null;
  lastActivityTime: number | null;
  task?: string;
  phases: Phase[];
  currentPhaseIndex: number;
  feed: FeedItem[];
  artifacts: Artifact[];
}

export interface JobHistoryItem {
  id: string;
  status: JobStatus;
  startTime: number;
  lastActivityTime: number;
  task: string;
}
