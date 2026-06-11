# 大象热成像风险平台

这是面向“无人机热成像 + 中国地图 + AI 研判 + YOLO 推理”的风险预警平台。前端和 API 可部署在 Vercel，真实 YOLO 计算建议连接外部 GPU 服务或本地 worker。

## 已接入能力

- 中国地图接口：使用高德地图 JS API 2.0，配置 `NEXT_PUBLIC_AMAP_KEY` 后在首页显示中国地图与监测点。
- 真实 AI 分析：创建任务时调用 `OPENAI_API_KEY` 对任务内容、视频信息和接入配置进行风险研判；未配置时只使用规则兜底并在页面标明。
- 真实 YOLO：提供 `/api/yolo/predict` 推理接口。优先调用 `YOLO_SERVICE_URL`；本地或自托管 Node 环境可直接运行 `scripts/yolo_predict.py` 和 `ultralytics`。
- 训练 worker：`worker/training_worker.py` 支持 `TRAINING_MODE=real`，会调用 `train_elephant_yolo.py` 并读取 YOLO 输出的 `training_summary.json`；前端只在模型状态与确认汇总里展示结果。

## 环境变量

复制 `.env.example` 并配置：

```bash
NEXT_PUBLIC_AMAP_KEY=
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
YOLO_SERVICE_URL=
YOLO_PYTHON=python
YOLO_WEIGHTS=yolov8n.pt
WORKER_API_KEY=local-worker-key
API_URL=http://localhost:3000/api
TRAINING_MODE=real
```

Vercel 线上重点配置：

- `NEXT_PUBLIC_AMAP_KEY`
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `YOLO_SERVICE_URL`

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## YOLO 本地依赖

```bash
python -m pip install -r requirements-training.txt
python scripts/yolo_predict.py --source path/to/image.jpg --weights yolov8n.pt
```

启动训练 worker：

```bash
set TRAINING_MODE=real
set API_URL=http://localhost:3000/api
python worker/training_worker.py
```

## API

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/api/tasks` | 获取研判任务 |
| POST | `/api/tasks` | 创建任务，触发 AI 研判 |
| GET | `/api/tasks/:id` | 获取单个任务 |
| PUT | `/api/tasks/:id` | worker 回写任务状态 |
| POST | `/api/tasks/:id/aggregate` | 汇总研判结果 |
| GET | `/api/model-status` | 获取模型状态 |
| POST | `/api/yolo/predict` | YOLO 图片推理 |
| GET | `/api/integrations/status` | 查看地图、AI、YOLO 配置状态 |

## 部署说明

GitHub 已连接 Vercel 后，推送到 `main` 会触发部署。Vercel 不适合长时间 GPU 训练，所以线上 YOLO 建议配置 `YOLO_SERVICE_URL` 指向独立 GPU 服务；本地或服务器 worker 负责训练和推理，前端只展示当前模型状态、实时研判和确认汇总。
