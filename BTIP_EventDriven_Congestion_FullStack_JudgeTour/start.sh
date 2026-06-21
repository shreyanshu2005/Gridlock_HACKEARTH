#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
if [ ! -f data/processed/clustered_feature_store.parquet ]; then
  python scripts/bootstrap_runtime_data.py
fi
exec uvicorn backend.main:app --host 127.0.0.1 --port 8000
