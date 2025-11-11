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

  const queueTask = async () => {
    setQueueing(true);
    try {
      const response = await fetch('/api/queue-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { timestamp: Date.now() } }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchStatus();
      }
    } catch (error) {
      console.error('Error queueing task:', error);
    } finally {
      setQueueing(false);
    }
  };

  const queueMultiple = async (count: number) => {
    setQueueing(true);
    try {
      const promises = Array.from({ length: count }, () =>
        fetch('/api/queue-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { timestamp: Date.now() } }),
        })
      );
      await Promise.all(promises);
      await fetchStatus();
    } catch (error) {
      console.error('Error queueing tasks:', error);
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
            FIFO queue with max concurrency of 6. Each task takes ~30 seconds to complete.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <button
              onClick={queueTask}
              disabled={queueing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {queueing ? 'Queueing...' : 'Queue 1 Task'}
            </button>
            <button
              onClick={() => queueMultiple(5)}
              disabled={queueing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Queue 5 Tasks
            </button>
            <button
              onClick={() => queueMultiple(20)}
              disabled={queueing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Queue 20 Tasks
            </button>
            <button
              onClick={() => queueMultiple(50)}
              disabled={queueing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Queue 50 Tasks
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Queued</div>
              <div className="text-3xl font-bold text-yellow-600">{status.stats.queuedCount}</div>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Processing</div>
              <div className="text-3xl font-bold text-blue-600">{status.stats.processingCount} / 6</div>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Completed</div>
              <div className="text-3xl font-bold text-green-600">{status.stats.completedCount}</div>
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Tasks</div>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{status.stats.totalTasks}</div>
            </div>
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
                Processing ({status.processing.length} / 6)
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
