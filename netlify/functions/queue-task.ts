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
    const taskId = `task-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const task: Task = {
      id: taskId,
      status: "queued",
      createdAt: Date.now(),
      data: body.data || {},
    };

    const state = await getQueueState();
    state.queue.push(taskId);
    state.tasks[taskId] = task;
    await saveQueueState(state);

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
