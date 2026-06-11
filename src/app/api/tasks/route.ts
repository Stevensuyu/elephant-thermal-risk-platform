import { NextResponse } from 'next/server'
import path from 'path'
import { writeFile } from 'fs/promises'
import { createTask, listTasks, uploadDir } from '@/lib/store'
import type { IntegrationConfig } from '@/lib/integrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await listTasks())
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('video')
      const videoFile = file instanceof File ? file : null
      let videoPath: string | undefined

      if (videoFile) {
        const safeName = videoFile.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
        const fileName = `${Date.now()}-${safeName}`
        videoPath = path.join(uploadDir, fileName)
        const bytes = Buffer.from(await videoFile.arrayBuffer())
        try {
          await writeFile(videoPath, bytes)
        } catch {
          videoPath = undefined
        }
      }

      const task = await createTask({
        name: String(form.get('name') || videoFile?.name || `研判任务-${Date.now()}`),
        description: String(form.get('description') || ''),
        videoFileName: videoFile?.name,
        videoPath,
        videoUrl: String(form.get('videoUrl') || ''),
        modelType: String(form.get('modelType') || 'yolov8n'),
        epochs: Number(form.get('epochs') || 10),
        batchSize: Number(form.get('batchSize') || 4),
        imageSize: Number(form.get('imageSize') || 640),
        integrationConfig: parseIntegrationConfig(form.get('integrationConfig')),
      })
      return NextResponse.json(task, { status: 201 })
    }

    const body = await request.json()
    const task = await createTask({
      name: body.name || `研判任务-${Date.now()}`,
      description: body.description,
      videoUrl: body.videoUrl,
      modelType: body.modelType,
      epochs: body.epochs,
      batchSize: body.batchSize,
      imageSize: body.imageSize,
      integrationConfig: parseIntegrationConfig(body.integrationConfig),
    })
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '创建任务失败' }, { status: 500 })
  }
}

function parseIntegrationConfig(value: unknown): Partial<IntegrationConfig> | undefined {
  if (!value) return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Partial<IntegrationConfig>
    } catch {
      return undefined
    }
  }
  if (typeof value === 'object') {
    return value as Partial<IntegrationConfig>
  }
  return undefined
}
