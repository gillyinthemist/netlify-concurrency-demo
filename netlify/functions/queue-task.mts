import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface Task {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  data?: unknown;
}

interface QueueState {
  queue: string[];
  processing: string[];
  completed: string[];
  tasks: Record<string, Task>;
  rateLimitHistory: number[]; // Timestamps of completed tasks (for rate limiting)
}

// Note: Rate limiting is handled in process-task.mts when tasks START processing
// This file just queues tasks - unlimited queuing is allowed

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

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Use high-resolution time and more randomness to ensure unique IDs
    let taskId = `task-${Date.now()}-${performance.now().toString(36)}-${Math.random()
      .toString(36)
      .substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`;

    const task: Task = {
      id: taskId,
      status: "queued",
      createdAt: Date.now(),
      data: body.data || {},
    };

    // Note: We don't check rate limit when queueing - unlimited tasks can be queued
    // Rate limiting happens when tasks START processing (in process-task.mts)
    // This allows unlimited queuing, but only 250 tasks START per minute
    
    // Now add task to queue with retry logic
    let state = await getQueueState();
    let retries = 5;
    let success = false;

    while (retries > 0 && !success) {
      // Re-fetch state in case it changed
      const currentState = await getQueueState();
      
      // Check if task ID already exists (shouldn't happen, but safety check)
      if (currentState.tasks[taskId]) {
        // Generate new ID if collision (extremely unlikely)
        taskId = `task-${Date.now()}-${performance.now().toString(36)}-${Math.random()
          .toString(36)
          .substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`;
        task.id = taskId;
        continue;
      }

      // Add task to queue and update rate limit history
      currentState.queue.push(taskId);
      currentState.tasks[taskId] = task;
      // Update rate limit history (merge with what we calculated above)
      currentState.rateLimitHistory = state.rateLimitHistory;
      
      try {
        await saveQueueState(currentState);
        state = currentState;
        success = true;
      } catch (error) {
        // If save fails, retry after small delay
        retries--;
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
        }
      }
    }

    if (!success || !state) {
      throw new Error("Failed to queue task after retries");
    }

    // Trigger processing - rate limit check happens in process-task function
    // We can queue unlimited tasks, but only 250 will START per minute
    try {
      const { AsyncWorkloadsClient } = await import(
        "@netlify/async-workloads"
      );
      const client = new AsyncWorkloadsClient();
      await client.send("process-task");
    } catch (error) {
      console.error("Failed to trigger async workload:", error);
      // The task is still queued and will be processed when available
    }

    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        position: state.queue.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error queueing task:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/queue-task",
};
