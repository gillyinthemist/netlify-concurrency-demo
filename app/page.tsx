'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  data?: any;
}

interface QueueStatus {
  queued: Task[];
  processing: Task[];
  completed: Task[];
  stats: {
    queuedCount: number;
    processingCount: number;
    completedCount: number;
    totalTasks: number;
  };
  rateLimit?: {
    limit: number;
    windowSeconds: number;
    used: number;
    remaining: number;
    resetAt: number | null;
  };
}

export default function Home() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/queue-status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchStatus();
      }
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const queueMultiple = async (count: number) => {
    setQueueing(true);
    try {
      // Queue tasks in batches to avoid overwhelming browser/server
      // Unlimited queuing is allowed - rate limiting happens when tasks START processing
      const BATCH_SIZE = 50; // Process 50 at a time
      let queued = 0;
      let failed = 0;
      
      for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, count);
        const batchPromises = Array.from({ length: batchEnd - batchStart }, async (_, batchIndex) => {
          const index = batchStart + batchIndex;
          try {
            const response = await fetch('/api/queue-task', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: { timestamp: Date.now(), index } }),
            });
            
            if (response.ok) {
              return { success: true, index };
            } else {
              const result = await response.json().catch(() => ({}));
              console.error(`Failed to queue task ${index + 1}:`, result.error || response.statusText);
              return { success: false, index, error: result.error || response.statusText };
            }
          } catch (error) {
            console.error(`Error queueing task ${index + 1}:`, error);
            return { success: false, index, error: error instanceof Error ? error.message : 'Unknown error' };
          }
        });
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Count successes and failures
        batchResults.forEach(result => {
          if (result.success) {
            queued++;
          } else {
            failed++;
          }
        });
        
        // Small delay between batches to avoid overwhelming
        if (batchEnd < count) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Update status
      await fetchStatus();
      
      if (failed > 0) {
        alert(`Queued ${queued} out of ${count} tasks. ${failed} failed. Check console for details.`);
      } else {
        alert(`Successfully queued all ${queued} tasks! They will start processing as rate limit allows (250/min).`);
      }
    } catch (error) {
      console.error('Error queueing tasks:', error);
      alert(`Error queueing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setQueueing(false);
    }
  };

  const clearQueue = async () => {
    if (!confirm('Are you sure you want to clear the queue?')) return;
    try {
      await fetch('/api/clear-queue', { method: 'POST' });
      await fetchStatus();
    } catch (error) {
      console.error('Error clearing queue:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getDuration = (start: number, end?: number) => {
    const endTime = end || Date.now();
    return ((endTime - start) / 1000).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-black dark:to-zinc-900 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Netlify Async Workloads Queue Demo
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            FIFO queue with <strong>rate limiting</strong> (250 requests/min) - OpenAI-style. Tasks can take any duration; rate limit controls when they START, not how many run simultaneously.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
            Rate limit: Max 250 tasks can <strong>START processing</strong> per minute. Unlimited tasks can be queued. If 300 requests come in, first 250 start immediately, next 50 wait until the minute window resets.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <button
              onClick={() => queueMultiple(300)}
              disabled={queueing}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {queueing ? 'Queueing...' : 'Queue 300 Tasks'}
            </button>
            <button
              onClick={clearQueue}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Clear Queue
            </button>
            <label className="flex items-center gap-2 ml-auto">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Auto-refresh</span>
            </label>
            <button
              onClick={fetchStatus}
              className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Queued</div>
              <div className="text-3xl font-bold text-yellow-600">{status.stats.queuedCount}</div>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Processing</div>
              <div className="text-3xl font-bold text-blue-600">{status.stats.processingCount}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                Currently running
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Completed</div>
              <div className="text-3xl font-bold text-green-600">{status.stats.completedCount}</div>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Tasks</div>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{status.stats.totalTasks}</div>
            </div>
            {status.rateLimit && (
              <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Rate Limit (per min)</div>
                <div className="text-3xl font-bold text-purple-600">
                  {status.rateLimit.used} / {status.rateLimit.limit}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                  {status.rateLimit.remaining} remaining
                </div>
                {status.rateLimit.resetAt && status.rateLimit.used >= status.rateLimit.limit && (
                  <div className="text-xs text-orange-500 dark:text-orange-400 mt-1">
                    Resets in {Math.max(0, Math.ceil((status.rateLimit.resetAt - Date.now()) / 1000))}s
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Queue Status */}
        {status && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Queued Tasks */}
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                Queued ({status.queued.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {status.queued.length === 0 ? (
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">No tasks queued</p>
                ) : (
                  status.queued.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800"
                    >
                      <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mb-1">
                        {task.id}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">
                        Created: {formatTime(task.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Processing Tasks */}
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                Processing ({status.processing.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {status.processing.length === 0 ? (
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">No tasks processing</p>
                ) : (
                  status.processing.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800"
                    >
                      <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mb-1">
                        {task.id}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">
                        Started: {task.startedAt ? formatTime(task.startedAt) : 'N/A'}
                      </div>
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        Duration: {task.startedAt ? `${getDuration(task.startedAt)}s` : '0s'} / ~30s
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Completed Tasks */}
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                Completed ({status.completed.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {status.completed.length === 0 ? (
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">No tasks completed</p>
                ) : (
                  status.completed.slice().reverse().map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800"
                    >
                      <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mb-1">
                        {task.id}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">
                        Completed: {task.completedAt ? formatTime(task.completedAt) : 'N/A'}
                      </div>
                      {task.startedAt && task.completedAt && (
                        <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                          Duration: {getDuration(task.startedAt, task.completedAt)}s
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {loading && !status && (
          <div className="text-center py-12">
            <div className="text-zinc-600 dark:text-zinc-400">Loading queue status...</div>
          </div>
        )}
      </div>
    </div>
  );
}
