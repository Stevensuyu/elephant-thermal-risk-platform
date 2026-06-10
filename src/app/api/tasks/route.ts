import { NextResponse } from 'next/server'
import path from 'path'
import { writeFile } from 'fs/promises'
import { createTask, listTasks, uploadDir } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const tasks = await listTasks()
  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('video')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: '请上传视频文件' }, { status: 400 })
      }
      const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
      const fileName = `${Date.now()}-${safeName}`
      const videoPath = path.join(uploadDir, fileName)
      const bytes = Buffer.from(await file.arrayBuffer())
      await writeFile(videoPath, bytes)
      const task = await createTask({
        name: String(form.get('name') || file.name),
        description: String(form.get('description') || ''),
        videoFileName: file.name,
        videoPath,
        modelType: String(form.get('modelType') || 'yolov8n'),
        epochs: Number(form.get('epochs') || 10),
        batchSize: Number(form.get('batchSize') || 4),
        imageSize: Number(form.get('imageSize') || 640),
      })
      return NextResponse.json(task, { status: 201 })
    }

    const body = await request.json()
    const task = await createTask({
      name: body.name || `训练任务-${Date.now()}`,
      description: body.description,
      videoUrl: body.videoUrl,
      modelType: body.modelType,
      epochs: body.epochs,
      batchSize: body.batchSize,
      imageSize: body.imageSize,
    })
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '创建任务失败' }, { status: 500 })
  }
}
