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

    // Retry logic to handle race conditions
    let retries = 5;
    let state: QueueState | undefined;
    let success = false;

    while (retries > 0 && !success) {
      state = await getQueueState();
      
      // Check if task ID already exists (shouldn't happen, but safety check)
      if (state.tasks[taskId]) {
        // Generate new ID if collision (extremely unlikely)
        taskId = `task-${Date.now()}-${performance.now().toString(36)}-${Math.random()
          .toString(36)
          .substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`;
        task.id = taskId;
        continue;
      }

      // Add task to queue
      state.queue.push(taskId);
      state.tasks[taskId] = task;
      
      try {
        await saveQueueState(state);
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

    // Trigger processing if under concurrency limit
    const MAX_CONCURRENCY = 6;
    if (state.processing.length < MAX_CONCURRENCY) {
      try {
        const { AsyncWorkloadsClient } = await import(
          "@netlify/async-workloads"
        );
        const client = new AsyncWorkloadsClient();
        await client.send("process-task");
      } catch (error) {
        console.error("Failed to trigger async workload:", error);
        // In production, this would fail, but for local dev we'll continue
        // The task is still queued and will be processed when the extension is available
      }
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
