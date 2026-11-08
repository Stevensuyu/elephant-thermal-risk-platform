#!/bin/bash

export WORKER_API_KEY="your-worker-api-key-here"
export API_URL="http://localhost:3000/api"
export TRAINING_MODE="simulate"

python worker/training_worker.py
