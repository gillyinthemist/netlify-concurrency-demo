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
  rateLimitHistory: number[];
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

    // Calculate rate limit info (based on when tasks STARTED processing)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentStarts = state.rateLimitHistory.filter(
      (timestamp) => timestamp > oneMinuteAgo
    ).length;

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
        rateLimit: {
          limit: 250,
          windowSeconds: 60,
          used: recentStarts,
          remaining: Math.max(0, 250 - recentStarts),
          resetAt: state.rateLimitHistory.length > 0 && recentStarts > 0
            ? Math.min(...state.rateLimitHistory.filter((t) => t > oneMinuteAgo)) + 60000
            : null,
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
