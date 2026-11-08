'use client'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { buildAiAnalysis } from '@/lib/ai/ai-analysis-engine'

// Re-export shared types for backward compatibility
export type { WarningLevel, AIAnalysis, TrainingStage, TrainingTask, ModelStatus } from '@/lib/utils/util-app-types'
import type { WarningLevel, AIAnalysis, TrainingStage } from '@/lib/utils/util-app-types'

/** @deprecated Use TrainingTask from @/lib/utils/types — kept for Zustand store compat */
interface ElephantTask {
  id: string
  name: string
  status: string
  progress: number
  warningLevel: WarningLevel
  aiAnalysis: AIAnalysis | null
  stages: TrainingStage[]
  createdAt: string
  updatedAt: string
  confirmed: boolean
  pendingConfirm: boolean
  videoFile?: string
  url?: string
  region?: string
}

interface TaskStore {
  tasks: ElephantTask[]
  createTask: (input: { name: string; videoFile?: string; url?: string; region?: string }) => string
  updateTask: (id: string, updates: Partial<ElephantTask>) => void
  confirmTask: (id: string) => void
  deleteTask: (id: string) => void
}

// ── Zustand Store ─────────────────────────────────────────────────────────
export const useTaskStore = create<TaskStore>()(
  devtools(
    (set, get) => ({
      tasks: [],

      createTask: (input) => {
        const id = `TRAIN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        const aiAnalysis = buildAiAnalysis(input)

        const stages: TrainingStage[] = [
          { name: '数据预处理', progress: 0, status: 'pending' },
          { name: '模型训练',   progress: 0, status: 'pending' },
          { name: '精度验证',   progress: 0, status: 'pending' },
          { name: '模型推送',   progress: 0, status: 'pending' },
        ]

        const task: ElephantTask = {
          id, name: input.name, status: 'PENDING', progress: 0,
          warningLevel: aiAnalysis.level, aiAnalysis, stages,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          confirmed: false, pendingConfirm: false,
          videoFile: input.videoFile, url: input.url, region: input.region,
        }
        set((s) => ({ tasks: [task, ...s.tasks] }))

        return id
      },

      updateTask: (id, updates) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      confirmTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, confirmed: true, pendingConfirm: false, status: 'COMPLETED', updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
    }),
    { name: 'elephant-task-store' }
  )
)
