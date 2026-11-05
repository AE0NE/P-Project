
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "local_data" / "card_cherry.db"

# 같은 문서를 두 가지 방식으로 분석했다고 가정
test_runs = [
    ("SYN-RULE-001", "rule", [
        ("TARGET", 0, 3, "편의점"),
        ("RATE", 4, 7, "10%")
    ]),
    ("SYN-MODEL-001", "model", [
        ("TARGET", 0, 3, "편의점")
    ])
]

conn = sqlite3.connect(DB_PATH)

try:
    conn.execute("PRAGMA foreign_keys = ON")

    for run_id, extractor_type, spans in test_runs:

        # 규칙 / 모델 실행을 별도로 저장
        conn.execute(
            """
            INSERT OR IGNORE INTO runs
            (run_id, document_id, offset_unit, extractor_type)
            VALUES (?, ?, ?, ?)
            """,
            (run_id, "SYN-D001", "unicode_code_point", extractor_type)
        )

        # 해당 실행의 최초 예측 저장
        for label, start, end, value in spans:
            conn.execute(
                """
                INSERT OR IGNORE INTO predictions
                (run_id, block_id, label, start_offset,
                 end_offset, raw_text)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (run_id, "SYN-B001", label, start, end, value)
            )

    conn.commit()

    rows = conn.execute(
        """
        SELECT run_id, document_id, extractor_type
        FROM runs
        ORDER BY run_id
        """
    ).fetchall()

    for row in rows:
        print(row)

finally:
    conn.close()
