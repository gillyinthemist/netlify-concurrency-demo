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

export default async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const state = await getQueueState();

    // Get tasks in each state
    const queued = state.queue.map((id) => state.tasks[id]).filter(Boolean);
    const processing = state.processing
      .map((id) => state.tasks[id])
      .filter(Boolean);
    const completed = state.completed
      .slice(-50)
      .map((id) => state.tasks[id])
      .filter(Boolean); // Last 50 completed

    return new Response(
      JSON.stringify({
        queued,
        processing,
        completed,
        stats: {
          queuedCount: queued.length,
          processingCount: processing.length,
          completedCount: completed.length,
          totalTasks: Object.keys(state.tasks).length,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Error getting queue status:", error);
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
  path: "/api/queue-status",
};
