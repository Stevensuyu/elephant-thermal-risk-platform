from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


API_URL = os.environ.get("API_URL", "http://localhost:3000/api").rstrip("/")
WORKER_API_KEY = os.environ.get("WORKER_API_KEY", "local-worker-key")
TRAINING_MODE = os.environ.get("TRAINING_MODE", "simulate").lower()
PYTHON_BIN = os.environ.get("PYTHON", "python")
PROJECT_ROOT = Path(__file__).resolve().parents[1]

STAGE_NAMES = [
    ("upload", "视频接收"),
    ("frames", "抽帧分析"),
    ("label", "自动预标注"),
    ("train", "YOLO 训练"),
    ("sync", "结果同步"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stages(active: int, progress: int = 0, failed: bool = False) -> list[dict[str, Any]]:
    rows = []
    for index, (key, name) in enumerate(STAGE_NAMES):
        if failed and index == active:
            rows.append({"key": key, "name": name, "progress": progress, "status": "失败"})
        elif index < active:
            rows.append({"key": key, "name": name, "progress": 100, "status": "完成"})
        elif index == active:
            rows.append({"key": key, "name": name, "progress": progress, "status": "处理中"})
        else:
            rows.append({"key": key, "name": name, "progress": 0, "status": "等待"})
    return rows


class TrainingWorker:
    def __init__(self) -> None:
        self.headers = {"Content-Type": "application/json", "X-Worker-Key": WORKER_API_KEY}

    def get_pending_tasks(self) -> list[dict[str, Any]]:
        response = requests.get(f"{API_URL}/tasks", headers=self.headers, timeout=20)
        response.raise_for_status()
        return [task for task in response.json() if task.get("status") == "PENDING"]

    def update_task(self, task_id: str, **patch: Any) -> None:
        response = requests.put(f"{API_URL}/tasks/{task_id}", headers=self.headers, json=patch, timeout=30)
        response.raise_for_status()

    def process(self, task: dict[str, Any]) -> None:
        task_id = task["id"]
        print(f"[worker] processing {task_id}: {task.get('name')}")
        try:
            self.update_task(task_id, status="RUNNING", progress=5, startedAt=now_iso(), stages=stages(0, 100))
            time.sleep(0.4)
            self.update_task(task_id, status="RUNNING", progress=20, stages=stages(1, 55))
            frame_count = self.extract_frames(task)
            self.update_task(task_id, status="RUNNING", progress=38, stages=stages(1, 100))
            time.sleep(0.4)
            self.update_task(task_id, status="RUNNING", progress=52, stages=stages(2, 100))
            time.sleep(0.4)

            result = self.run_real_training(task) if TRAINING_MODE == "real" else self.run_simulated_training(task, frame_count)

            self.update_task(
                task_id,
                status="COMPLETED",
                progress=100,
                completedAt=now_iso(),
                stages=stages(5, 100),
                metrics=result["metrics"],
                resultDir=result["resultDir"],
            )
            print(f"[worker] completed {task_id}")
        except Exception as exc:
            print(f"[worker] failed {task_id}: {exc}")
            self.update_task(task_id, status="FAILED", errorMessage=str(exc), stages=stages(3, 40, failed=True))

    def extract_frames(self, task: dict[str, Any]) -> int:
        video_path = task.get("videoPath")
        if not video_path or not Path(video_path).exists():
            return 0
        try:
            import cv2
        except Exception:
            return max(12, int(task.get("epochs", 10)) * 2)

        output_dir = PROJECT_ROOT / "storage" / "frames" / task["id"]
        output_dir.mkdir(parents=True, exist_ok=True)
        cap = cv2.VideoCapture(str(video_path))
        frame_count = 0
        saved = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if frame_count % 60 == 0:
                cv2.imwrite(str(output_dir / f"frame_{saved:05d}.jpg"), frame)
                saved += 1
            frame_count += 1
        cap.release()
        return saved

    def run_simulated_training(self, task: dict[str, Any], frame_count: int) -> dict[str, Any]:
        epochs = max(1, int(task.get("epochs", 10)))
        for epoch in range(epochs):
            progress = 55 + int(((epoch + 1) / epochs) * 35)
            self.update_task(task["id"], status="RUNNING", progress=progress, stages=stages(3, min(100, progress)))
            time.sleep(0.2)
        self.update_task(task["id"], status="RUNNING", progress=96, stages=stages(4, 80))
        time.sleep(0.4)
        boost = min(0.025, frame_count * 0.0005)
        return {
            "metrics": {
                "mAP50": round(0.587 + boost, 3),
                "precision": round(0.976 + min(0.01, boost / 2), 3),
                "recall": round(0.973 + min(0.01, boost / 2), 3),
                "frames": frame_count,
                "mode": "simulate",
            },
            "resultDir": str(PROJECT_ROOT / "storage" / "results" / task["id"]),
        }

    def run_real_training(self, task: dict[str, Any]) -> dict[str, Any]:
        run_name = f"{task['id']}_real_yolo"
        command = [
            PYTHON_BIN,
            "train_elephant_yolo.py",
            "--prepare",
            "--epochs",
            str(task.get("epochs", 10)),
            "--imgsz",
            str(task.get("imageSize", 640)),
            "--batch",
            str(task.get("batchSize", 4)),
            "--device",
            "auto",
            "--predict",
            "--name",
            run_name,
        ]
        self.update_task(task["id"], status="RUNNING", progress=60, stages=stages(3, 20))
        completed = subprocess.run(command, cwd=PROJECT_ROOT, text=True, capture_output=True, timeout=60 * 60 * 8)
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr[-2000:] or completed.stdout[-2000:] or "YOLO training failed")

        run_dir = PROJECT_ROOT / "runs" / "elephant_multisource_thermal" / run_name
        summary_path = run_dir / "training_summary.json"
        metrics = self.parse_yolo_summary(summary_path)
        metrics["mode"] = "real"
        return {"metrics": metrics, "resultDir": str(run_dir)}

    def parse_yolo_summary(self, summary_path: Path) -> dict[str, Any]:
        if not summary_path.exists():
            return {"mAP50": 0, "precision": 0, "recall": 0}
        payload = json.loads(summary_path.read_text(encoding="utf-8"))
        metrics = payload.get("metrics", {})
        return {
            "mAP50": first_number(metrics, ["metrics/mAP50(B)", "mAP50", "map50"]),
            "precision": first_number(metrics, ["metrics/precision(B)", "precision"]),
            "recall": first_number(metrics, ["metrics/recall(B)", "recall"]),
        }

    def run_forever(self, interval: int = 5) -> None:
        print(f"[worker] started, api={API_URL}, mode={TRAINING_MODE}")
        while True:
            try:
                for task in self.get_pending_tasks():
                    self.process(task)
            except Exception as exc:
                print(f"[worker] loop error: {exc}")
            time.sleep(interval)


def first_number(metrics: dict[str, Any], keys: list[str]) -> float:
    for key in keys:
        value = metrics.get(key)
        if isinstance(value, (int, float)):
            return round(float(value), 4)
    return 0.0


if __name__ == "__main__":
    TrainingWorker().run_forever()
