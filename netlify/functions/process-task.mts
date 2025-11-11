import type {
  AsyncWorkloadEvent,
  AsyncWorkloadConfig,
} from "@netlify/async-workloads";
import { getStore } from "@netlify/blobs";

const TASK_DURATION = 30000; // 30 seconds (can be longer - that's fine!)
const RATE_LIMIT_REQUESTS = 250; // Max tasks that can START per minute

interface Task {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  data?: unknown;
}

interface QueueState {
  queue: string[]; // Task IDs in order
  processing: string[]; // Currently processing task IDs
  completed: string[]; // Completed task IDs
  tasks: Record<string, Task>;
  rateLimitHistory: number[]; // Timestamps of completed tasks (for rate limiting)
}

async function getQueueState(): Promise<QueueState> {
  const store = getStore("queue-state");
  const data = await store.get("state", { type: "json" });

  if (!data) {
    return {
      queue: [],
      processing: [],
      completed: [],
      tasks: {},
      rateLimitHistory: [],
    };
  }

  // Ensure rateLimitHistory exists (for backwards compatibility)
  if (!data.rateLimitHistory) {
    data.rateLimitHistory = [];
  }

  return data as QueueState;
}

async function saveQueueState(state: QueueState): Promise<void> {
  const store = getStore("queue-state");
  await store.set("state", JSON.stringify(state));
}

async function processNextTask(): Promise<void> {
  const state = await getQueueState();

  // Get next task from queue
  if (state.queue.length === 0) {
    console.log("No tasks in queue");
    return;
  }

  // Check rate limit - how many tasks have STARTED in the last minute
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const recentStarts = state.rateLimitHistory.filter(
    (timestamp) => timestamp > oneMinuteAgo
  ).length;

  if (recentStarts >= RATE_LIMIT_REQUESTS) {
    console.log(
      `Rate limit reached (${RATE_LIMIT_REQUESTS} starts/min). Waiting for window to reset...`
    );
    // Don't process yet - wait for rate limit window to reset
    return;
  }

  const taskId = state.queue.shift()!;
  const task = state.tasks[taskId];

  if (!task) {
    console.error(`Task ${taskId} not found`);
    return;
  }

  // Move task to processing
  task.status = "processing";
  task.startedAt = Date.now();
  state.processing.push(taskId);

  // Record this start time for rate limiting (when task STARTS, not when it finishes)
  state.rateLimitHistory.push(Date.now());

  // Clean up old timestamps (keep only last hour for efficiency)
  const oneHourAgo = Date.now() - 3600000;
  state.rateLimitHistory = state.rateLimitHistory.filter(
    (timestamp) => timestamp > oneHourAgo
  );

  await saveQueueState(state);

  console.log(
    `Processing task ${taskId} (${
      recentStarts + 1
    }/${RATE_LIMIT_REQUESTS} started this minute)`
  );

  // Simulate 30-second task
  await new Promise((resolve) => setTimeout(resolve, TASK_DURATION));

  // Mark task as completed
  const updatedState = await getQueueState();
  const taskIndex = updatedState.processing.indexOf(taskId);
  if (taskIndex !== -1) {
    updatedState.processing.splice(taskIndex, 1);
  }

  if (updatedState.tasks[taskId]) {
    updatedState.tasks[taskId].status = "completed";
    updatedState.tasks[taskId].completedAt = Date.now();
    updatedState.completed.push(taskId);

    // Note: Rate limit history is tracked when tasks are queued (in queue-task.mts),
    // not when they complete. This matches OpenAI's rate limiting model.
  }

  await saveQueueState(updatedState);
  console.log(`Completed task ${taskId}`);

  // Process next task if available (check rate limit, not concurrency)
  const finalState = await getQueueState();
  if (finalState.queue.length > 0) {
    // Check if we can start another task (rate limit check)
    const finalNow = Date.now();
    const finalOneMinuteAgo = finalNow - 60000;
    const finalRecentStarts = finalState.rateLimitHistory.filter(
      (timestamp) => timestamp > finalOneMinuteAgo
    ).length;

    if (finalRecentStarts < RATE_LIMIT_REQUESTS) {
      // Trigger next task processing
      const { AsyncWorkloadsClient } = await import("@netlify/async-workloads");
      const client = new AsyncWorkloadsClient();
      await client.send("process-task");
    }
  }
}

// Handler function
async function handler(event: AsyncWorkloadEvent) {
  console.log("Async workload received event:", event.eventName);

  if (event.eventName === "process-task") {
    await processNextTask();
  }
}

// Dynamically import asyncWorkloadFn using top-level await (supported in ES modules)
const { asyncWorkloadFn } = await import("@netlify/async-workloads");
export default asyncWorkloadFn(handler);

export const asyncWorkloadConfig: AsyncWorkloadConfig = {
  events: ["process-task"],
};
