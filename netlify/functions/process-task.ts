import {
  asyncWorkloadFn,
  type AsyncWorkloadEvent,
  type AsyncWorkloadConfig,
} from "@netlify/async-workloads";
import { getStore } from "@netlify/blobs";

const MAX_CONCURRENCY = 6;
const TASK_DURATION = 30000; // 30 seconds

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
    };
  }

  return data as QueueState;
}

async function saveQueueState(state: QueueState): Promise<void> {
  const store = getStore("queue-state");
  await store.set("state", JSON.stringify(state));
}

async function processNextTask(): Promise<void> {
  const state = await getQueueState();

  // Check if we can process more tasks (concurrency limit)
  if (state.processing.length >= MAX_CONCURRENCY) {
    console.log(`Max concurrency reached (${MAX_CONCURRENCY}). Waiting...`);
    return;
  }

  // Get next task from queue
  if (state.queue.length === 0) {
    console.log("No tasks in queue");
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

  await saveQueueState(state);

  console.log(
    `Processing task ${taskId} (${state.processing.length}/${MAX_CONCURRENCY} concurrent)`
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
  }

  await saveQueueState(updatedState);
  console.log(`Completed task ${taskId}`);

  // Process next task if available
  const finalState = await getQueueState();
  if (
    finalState.queue.length > 0 &&
    finalState.processing.length < MAX_CONCURRENCY
  ) {
    // Trigger next task processing
    const { AsyncWorkloadsClient } = await import("@netlify/async-workloads");
    const client = new AsyncWorkloadsClient();
    await client.send("process-task");
  }
}

export default asyncWorkloadFn(async (event: AsyncWorkloadEvent) => {
  console.log("Async workload received event:", event.eventName);

  if (event.eventName === "process-task") {
    await processNextTask();
  }
});

export const asyncWorkloadConfig: AsyncWorkloadConfig = {
  events: ["process-task"],
};
