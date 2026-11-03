
import json
import sqlite3
from pathlib import Path

# 현재 backend 폴더 위치
BASE_DIR = Path(__file__).resolve().parent

# DB 파일 저장 위치
DATA_DIR = BASE_DIR / "local_data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "card_cherry.db"

# 가상 JSON 파일 읽기
with open(BASE_DIR / "sample_run.json", "r", encoding="utf-8") as f:
    sample = json.load(f)

# SQLite 연결
with sqlite3.connect(DB_PATH) as conn:
    conn.execute("PRAGMA foreign_keys = ON")

    # 테이블 생성
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            document_id TEXT PRIMARY KEY,
            data_origin TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS blocks (
            block_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY (document_id)
                REFERENCES documents(document_id)
        );

        CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            offset_unit TEXT NOT NULL,
            FOREIGN KEY (document_id)
                REFERENCES documents(document_id)
        );

        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            block_id TEXT NOT NULL,
            label TEXT NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            raw_text TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES runs(run_id),
            FOREIGN KEY (block_id) REFERENCES blocks(block_id),
            UNIQUE(run_id, block_id, label, start_offset, end_offset)
        );
        
        CREATE TABLE IF NOT EXISTS reviews (
            run_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            base_revision INTEGER NOT NULL,
            review_status TEXT NOT NULL,
            items_json TEXT NOT NULL,
            reason TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,

            PRIMARY KEY (run_id, revision),
            FOREIGN KEY (run_id) REFERENCES runs(run_id)
        );

    """)

    # 문서 저장
    conn.execute(
        "INSERT OR IGNORE INTO documents VALUES (?, ?)",
        (sample["document_id"], sample["data_origin"])
    )

    # 원문 블록 저장
    conn.execute(
        "INSERT OR IGNORE INTO blocks VALUES (?, ?, ?)",
        (sample["block_id"], sample["document_id"], sample["text"])
    )

    # 추출 실행 정보 저장
    conn.execute(
        "INSERT OR IGNORE INTO runs VALUES (?, ?, ?)",
        (sample["run_id"], sample["document_id"], sample["offset_unit"])
    )

    # 최초 추출 결과 저장
    for span in sample["spans"]:
        start = span["start"]
        end = span["end"]

        if sample["text"][start:end] != span["text"]:
            raise ValueError("원문 위치와 추출값이 일치하지 않습니다.")

        conn.execute(
            """INSERT OR IGNORE INTO predictions
               (run_id, block_id, label, start_offset,
                end_offset, raw_text)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                sample["run_id"],
                sample["block_id"],
                span["type"],
                start,
                end,
                span["text"]
            )
        )

    conn.commit()

print("SQLite DB 생성 및 샘플 데이터 저장 완료!")
print("DB 위치:", DB_PATH)
