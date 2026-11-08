import { useState, useEffect } from 'react'
import { Upload, X } from 'lucide-react'

export interface CreateTaskPayload {
  name: string
  description: string
  video: File | null
  videoUrl: string
  modelType: string
  epochs: number
  batchSize: number
  imageSize: number
}

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateTaskPayload) => Promise<void>
  prefillName?: string
}

const modelTypes = [
  { value: 'yolov8n', label: 'YOLOv8n 轻量模型' },
  { value: 'yolov8s', label: 'YOLOv8s 小模型' },
  { value: 'yolov8m', label: 'YOLOv8m 中模型' },
]

export default function CreateTaskModal({ isOpen, onClose, onSubmit, prefillName }: CreateTaskModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<CreateTaskPayload>({
    name: prefillName || '',
    description: '',
    video: null,
    videoUrl: '',
    modelType: 'yolov8n',
    epochs: 10,
    batchSize: 4,
    imageSize: 640,
  })

  // 当从识别面板带预填名称进来时同步
  useEffect(() => {
    if (prefillName) setFormData((f) => ({ ...f, name: prefillName }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillName, isOpen])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    await onSubmit(formData)
    setIsSubmitting(false)
    setFormData({
      name: '',
      description: '',
      video: null,
      videoUrl: '',
      modelType: 'yolov8n',
      epochs: 10,
      batchSize: 4,
      imageSize: 640,
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">创建视频训练任务</h2>
            <p className="mt-1 text-sm text-slate-400">上传视频后会写入任务库，等待本地 GPU worker 自动抽帧、预标注、训练并回写结果。</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-800/60" type="button">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">任务名称</label>
            <input
              required
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className="w-full rounded-md border border-slate-600/50 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              placeholder="例如：边境北线夜间象群热成像视频训练"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">上传视频</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-600/50 bg-slate-800/50 px-4 py-5 text-sm text-slate-300 hover:bg-slate-800/60">
              <Upload size={18} />
              {formData.video ? formData.video.name : '选择热成像图片或视频（jpg / png / mp4 / mov）'}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  if (file && file.size > 500 * 1024 * 1024) {
                    alert('文件大小不能超过 500MB')
                    event.target.value = ''
                    return
                  }
                  setFormData({ ...formData, video: file })
                }}
              />
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">视频 URL</label>
            <input
              type="url"
              value={formData.videoUrl}
              onChange={(event) => setFormData({ ...formData, videoUrl: event.target.value })}
              className="w-full rounded-md border border-slate-600/50 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              placeholder="可选：远程视频地址"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200">任务描述</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              className="w-full rounded-md border border-slate-600/50 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">模型</label>
              <select value={formData.modelType} onChange={(event) => setFormData({ ...formData, modelType: event.target.value })} className="w-full rounded-md border border-slate-600/50 px-3 py-2">
                {modelTypes.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">训练轮数</label>
              <input type="number" min="1" max="300" value={formData.epochs} onChange={(event) => setFormData({ ...formData, epochs: Number(event.target.value) || 10 })} className="w-full rounded-md border border-slate-600/50 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">Batch</label>
              <input type="number" min="1" max="64" value={formData.batchSize} onChange={(event) => setFormData({ ...formData, batchSize: Number(event.target.value) || 4 })} className="w-full rounded-md border border-slate-600/50 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">图像尺寸</label>
              <select value={formData.imageSize} onChange={(event) => setFormData({ ...formData, imageSize: Number(event.target.value) })} className="w-full rounded-md border border-slate-600/50 px-3 py-2">
                <option value={320}>320</option>
                <option value={512}>512</option>
                <option value={640}>640</option>
                <option value={800}>800</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-600/50 px-4 py-2 hover:bg-slate-800/50">
              取消
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-purple-600 px-4 py-2 font-medium text-white hover:bg-slate-800/500 disabled:opacity-60">
              {isSubmitting ? '提交中...' : '创建训练任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
