@echo off
cd /d %~dp0
if not exist .venv python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
if not exist data\processed\clustered_feature_store.parquet python scripts\bootstrap_runtime_data.py
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
