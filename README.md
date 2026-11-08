# 天眼护象 · 象群入侵风险智能研判平台

这是面向「无人机热成像 + 边缘 AI + 象群风险预警」的智能研判平台。系统已从静态演示页演进为一个**数据同源、态势联动的统一系统**，各功能模块职责边界清晰但全程协同，共同构成「监测—预警—研判—处警」闭环。平台底座包括：

- Next.js 动态前端（态势总览 / 实时监控 / AI 研判 / 预警处置 / 系统台账 / 人员管理）
- 训练任务 API 与本地 JSON 任务数据库
- 视频上传存储与模型状态同步接口
- GPU / 本地训练 worker（YOLO 热成像检测）

## 系统架构

平台不是彼此孤立的页面，而是共享同一套地理底座（云南底图 / 标注 / 预警等级）与统一数据流的互联系统：

- **感知接入**：设备管理（RTSP / 摄像头 / 本地视频）+ 无人机机队遥测（在线 / 电量 / 高度 / 速度 / 位置 / 任务状态），驱动 YOLO 实时检测。
- **实时监控**（统一监控中枢）：设备接入、机队遥测、巡检路线规划与动态模拟、瓦片态势地图协同联动，与态势总览共用地理底座。
- **态势总览**：3D 地理聚合，与实时监控共享态势，实时滚动预测入侵概率与抵达窗口。
- **AI 研判**（研判枢纽）：以六因子规则引擎为事实基准，叠加智谱 GLM-4-Flash 大模型增强，融合实时检测 / 气象 / 地理空间 / 历史轨迹多源证据，输出结构化研判结论。
- **预警处置**：按红橙黄蓝四级自动生成处置预案并自主联动，回写监测-预警-处警闭环。
- **系统台账 / 人员管理**：全流程留痕与分级权限，与研判、处置同源联动。

## 运行网站

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

> 若已初始化检测服务环境（`.venv`），`start-tianyan.bat` 会自动同时拉起前端与本地检测服务（端口 8765）。

## 实时检测服务（摄像头 / 相机 / 无人机视频流）

平台新增了独立于前端的**本地检测服务**（`worker/detect/`），以分层架构把「视频源 → 检测引擎 → 目标框叠加 → MJPEG 视频流」串成一条可热切换的真实检测链路：

- **视频源（Source）**：`webcam`（电脑摄像头 / USB 外置相机，Windows 下用 DirectShow 稳定打开）、`stream`（RTSP/RTMP/HTTP 视频流，可用于无人机图传）、`drone`（无人机机载流，预留）、`file`（本地视频文件回放）。统一用 `register_source()` 装饰器注册，新增源无需改动管线。
- **检测引擎（Engine）**：`yolo`（最新版 Ultralytics 8.4.x，默认 `yolo11n.pt`，GPU/CPU 自适应，优先使用项目训练产物 `best.pt`）与 `locateanything`（英伟达 LocateAnything-3B 开放词汇视觉定位，可自由描述要检测的目标，如“象群”“热源”“帐篷”）。统一用 `register_engine()` 注册。
- **HTTP 服务**：端口 `8765`，输出 MJPEG 视频流与 JSON 控制 API，前端通过 `/api/detect/*` 代理访问。

### 一键安装环境

```powershell
powershell -ExecutionPolicy Bypass -File detect_setup.ps1
```

会自动创建 `.venv`、安装 CUDA 版 PyTorch（cu128，适配 RTX 50 系）、最新版 Ultralytics 以及 LocateAnything 依赖（transformers / bitsandbytes 量化等）。

### 启动检测服务

```bat
start-detect.bat
```

或手动：

```bat
.venv\Scripts\python.exe worker\detect\run.py
```

首次使用 LocateAnything 引擎时，会自动从 HF 镜像下载约 7.7GB 权重（国内走 `HF_ENDPOINT=https://hf-mirror.com`）。8GB 显存会自动选择 INT8 量化加载，显存更小则退 INT4。

### 检测服务 API

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/api/status` | 服务状态、当前源/引擎/帧率/检测数 |
| GET | `/api/cameras` | 枚举本机摄像头（含 USB 相机友好名称） |
| GET | `/api/engines` | 已注册检测引擎与参数 |
| GET | `/api/live-detection` | 最近一次检测结果（bbox 归一化 + 置信度） |
| GET | `/video` | MJPEG 实时视频流（前端 `<img>` 直接引用） |
| POST | `/api/source/select` | 切换视频源（`{"type":"webcam","index":1}` 等） |
| POST | `/api/engine/select` | 切换引擎（`{"name":"yolo"}` 或 `locateanything`，可带 prompt） |
| POST | `/api/detection/start` / `stop` | 启动 / 停止检测管线 |
| POST | `/api/detection/config` | 调整检测参数（阈值、目标描述等） |

### 前端使用

- **设置 → 设备与通道**：枚举并选择摄像头，切换 YOLO / LocateAnything 引擎，实时预览 MJPEG 画面与检测结果。
- **实时监控页**：嵌入式真实摄像头检测面板，直接显示本机相机画面与检测框。
- 若检测服务未启动，页面会明确提示，前端其余功能不受影响（`/api/live-detection` 自动回退到演示模式并标注“推演演示”）。

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
