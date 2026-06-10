# 边境象群热成像 AI 动态训练平台

这是面向“无人机热成像 + 边缘 AI + 象群风险预警”的动态训练平台。系统已经从静态演示页升级为：

- Next.js 动态前端
- 训练任务 API
- 本地 JSON 任务数据库
- 视频上传存储
- 模型状态同步接口
- GPU/本地训练 worker

## 运行网站

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 创建训练任务

在网页中点击“上传视频训练”，选择视频并提交。系统会：

1. 上传视频到 `storage/uploads/`
2. 创建训练任务到 `storage/training-db.json`
3. 在页面中显示等待、训练中、完成、失败等状态
4. 自动刷新“当前模型状态与继续训练”

## 启动训练 Worker

默认使用模拟训练模式，适合先跑通平台流程：

```bash
python worker/training_worker.py
```

真实 YOLO 训练模式：

```bash
set TRAINING_MODE=real
python worker/training_worker.py
```

真实训练会调用项目根目录下的 `train_elephant_yolo.py`。请先安装 Python 训练依赖：

```bash
pip install -r requirements-training.txt
```

## API

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/api/tasks` | 获取训练任务列表 |
| POST | `/api/tasks` | 上传视频并创建训练任务 |
| GET | `/api/tasks/:id` | 查看单个任务 |
| PUT | `/api/tasks/:id` | worker 回写任务状态 |
| DELETE | `/api/tasks/:id` | 取消任务 |
| GET | `/api/model-status` | 获取当前模型状态 |
| PUT | `/api/model-status` | 更新当前模型状态 |

## 目录结构

```text
src/app/page.tsx                 动态训练平台首页
src/app/api/tasks/               训练任务 API
src/app/api/model-status/        模型状态 API
src/lib/store.ts                 JSON 任务数据库
worker/training_worker.py        训练 worker
storage/                         上传视频、任务数据库和结果目录
```

## 部署说明

Vercel 可以部署前端与 API。真实生产环境建议把 `storage/` 替换为 Vercel Blob / S3，把 JSON 任务库替换为 Neon Postgres / Vercel Postgres，再让 GPU worker 轮询线上 API。

当前版本优先保证本机完整跑通：网页上传视频、API 创建任务、worker 处理任务、前端实时显示训练状态。
