import type {
  AgentRunDetail,
  ConversationSendResult,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
} from '@ai-digital-life/kernel';
import { DEMO_SESSION_IDS } from './demo-constants';
import { appendLiveRunActivity, resetLiveRunActivity } from './demo-run-activity';
import { appendDemoAssistantMessage, buildDemoSendResult } from './demo-conversation';

const DEMO_REPLY_TEXT = '这是一个流式模拟的演示回复，用于观察逐字输出效果。';

export interface DemoStreamSimulator {
  sendMessage(input: {
    sessionId: string;
    content: string;
  }): Promise<ConversationSendResult>;
  cancelMessage(runId: string): Promise<AgentRunDetail | undefined>;
  cancelActiveStream(): void;
  reset(): void;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type ModelStreamPartial = DistributiveOmit<
  DigitalLifeModelStreamEventV1,
  'v' | 'runId' | 'seq'
>;
type RunActivityPartial = DistributiveOmit<
  DigitalLifeRunActivityEventV1,
  'v' | 'runId' | 'seq' | 'ts'
>;

interface PendingSend {
  result: ConversationSendResult;
  resolve: (result: ConversationSendResult) => void;
}

export function createDemoStreamSimulator(options: {
  emitModel: (e: DigitalLifeModelStreamEventV1) => void;
  emitActivity: (e: DigitalLifeRunActivityEventV1) => void;
}): DemoStreamSimulator {
  const { emitModel, emitActivity } = options;
  const timers: number[] = [];
  const activeRunIds = new Set<string>();
  const cancelledRunIds = new Set<string>();
  const pendingSends = new Map<string, PendingSend>();

  const schedule = (ms: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      const idx = timers.indexOf(timer);
      if (idx >= 0) {
        timers.splice(idx, 1);
      }
      fn();
    }, ms);
    timers.push(timer);
  };

  const clearAll = () => {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    timers.length = 0;
  };

  return {
    sendMessage: async ({ sessionId, content }) => {
      const runId = `run-demo-${Date.now()}`;
      activeRunIds.add(runId);

      let seq = 0;
      const emitA = (e: RunActivityPartial) => {
        seq += 1;
        emitActivity({ v: 1, runId, seq, ts: Date.now(), ...e } as DigitalLifeRunActivityEventV1);
      };
      const emitM = (e: ModelStreamPartial) => {
        seq += 1;
        emitModel({ v: 1, runId, seq, ...e } as DigitalLifeModelStreamEventV1);
      };

      const result = buildDemoSendResult(sessionId, content, runId);
      const runDetail = result.runDetail;

      const finish = (status: 'succeeded' | 'aborted') => {
        seq += 1;
        const doneEvent: DigitalLifeRunActivityEventV1 = {
          v: 1,
          runId,
          seq,
          ts: Date.now(),
          type: 'run-done',
          status,
        };
        emitActivity(doneEvent);
        appendLiveRunActivity(runId, doneEvent);
        const doneMessage = { ...result.assistantMessage };
        appendDemoAssistantMessage(sessionId, doneMessage);
        const pending = pendingSends.get(runId);
        if (pending) {
          pendingSends.delete(runId);
          pending.resolve({
            ...result,
            assistantMessage: doneMessage,
            runDetail:
              status === 'aborted'
                ? {
                    ...runDetail,
                    run: { ...runDetail.run, status: 'aborted' as const, completedAt: Date.now() },
                  }
                : runDetail,
          });
        }
        activeRunIds.delete(runId);
      };

      const isCancelled = () => cancelledRunIds.has(runId);

      return new Promise<ConversationSendResult>((resolve) => {
        pendingSends.set(runId, { result, resolve });

        emitM({ type: 'route', providerId: 'deepseek', modelId: 'deepseek-chat', reason: '演示场景路由' });

        schedule(300, () => {
          if (isCancelled()) {
            return;
          }
          emitA({ type: 'run-start', scenario: 'chat' });
          emitA({ type: 'context-added', contextType: 'file', label: 'README.md', path: 'README.md', tokenEstimate: 80 });
          emitA({ type: 'file-read', path: 'README.md', bytes: 64, tokenEstimate: 60 });
        });

        schedule(800, () => {
          if (isCancelled()) {
            return;
          }
          emitA({ type: 'search', query: 'demo', hitCount: 3, samplePaths: ['README.md'] });
        });

        schedule(1200, () => {
          if (isCancelled()) {
            return;
          }
          emitA({ type: 'command', phase: 'start', command: 'git', args: ['status'] });
          emitA({ type: 'command', phase: 'done', command: 'git', args: ['status'], exitCode: 0 });
        });

        schedule(1600, () => {
          if (isCancelled()) {
            return;
          }
          for (let i = 0; i < DEMO_REPLY_TEXT.length; i += 1) {
            const index = i;
            schedule(80 * index, () => {
              if (isCancelled()) {
                return;
              }
              emitM({ type: 'delta', text: DEMO_REPLY_TEXT[index] });
            });
          }
        });

        const total = 1600 + 80 * (DEMO_REPLY_TEXT.length - 1) + 800;
        schedule(total, () => {
          if (isCancelled()) {
            finish('aborted');
            return;
          }
          emitM({ type: 'usage', usage: { promptTokens: 60, completionTokens: 40, totalTokens: 100 } });
          emitM({ type: 'done' });
          finish('succeeded');
        });
      });
    },

    cancelActiveStream: () => {
      for (const runId of activeRunIds) {
        cancelledRunIds.add(runId);
      }
      activeRunIds.clear();
      clearAll();
      for (const [runId, pending] of pendingSends) {
        const abortedDetail = {
          ...pending.result.runDetail,
          run: {
            ...pending.result.runDetail.run,
            status: 'aborted' as const,
            completedAt: Date.now(),
          },
        };
        pending.resolve({ ...pending.result, runDetail: abortedDetail });
      }
      pendingSends.clear();
    },

    cancelMessage: async (runId: string) => {
      cancelledRunIds.add(runId);
      activeRunIds.delete(runId);
      clearAll();
      const pending = pendingSends.get(runId);
      if (pending) {
        pendingSends.delete(runId);
        const abortedDetail = {
          ...pending.result.runDetail,
          run: {
            ...pending.result.runDetail.run,
            id: runId,
            status: 'aborted' as const,
            completedAt: Date.now(),
          },
        };
        pending.resolve({ ...pending.result, runDetail: abortedDetail });
        return abortedDetail;
      }
      return {
        run: {
          id: runId,
          workspaceId: 'workspace-demo',
          sessionId: DEMO_SESSION_IDS.tools,
          prompt: '',
          scenario: 'chat',
          status: 'aborted' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: Date.now(),
        },
        steps: [],
      };
    },

    reset: () => {
      clearAll();
      cancelledRunIds.clear();
      activeRunIds.clear();
      pendingSends.clear();
      resetLiveRunActivity();
    },
  };
}
