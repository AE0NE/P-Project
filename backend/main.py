import csv
import io
from fastapi.responses import Response

import json
from typing import Literal

from pydantic import BaseModel, Field

import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException

app = FastAPI(title="Card Cherry Backend")

# 데이터베이스 위치
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "local_data" / "card_cherry.db"


# DB 연결 함수
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# 서버 실행 확인
@app.get("/health")
def health():
    return {"status": "ok"}


# 저장된 문서 목록 조회
@app.get("/api/documents")
def get_documents():
    conn = get_db()

    try:
        rows = conn.execute(
            "SELECT document_id, data_origin FROM documents"
        ).fetchall()

        return [dict(row) for row in rows]

    finally:
        conn.close()
# 특정 추출 실행의 원문과 최초 예측 결과 조회
@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    conn = get_db()

    try:
        # 1. 실행 정보와 문서 출처 조회
        run = conn.execute("""
            SELECT r.run_id, r.document_id,
                   r.offset_unit, d.data_origin
            FROM runs AS r
            JOIN documents AS d
              ON r.document_id = d.document_id
            WHERE r.run_id = ?
        """, (run_id,)).fetchone()

        if run is None:
            raise HTTPException(
                status_code=404,
                detail="해당 추출 실행을 찾을 수 없습니다."
            )

        # 2. 문서 원문 블록 조회
        blocks = conn.execute("""
            SELECT block_id, text
            FROM blocks
            WHERE document_id = ?
            ORDER BY block_id
        """, (run["document_id"],)).fetchall()

        # 3. 최초 추출 결과 조회
        predictions = conn.execute("""
            SELECT p.id, p.block_id, p.label,
                   p.start_offset, p.end_offset,
                   p.raw_text
            FROM predictions AS p
            JOIN blocks AS b
              ON p.block_id = b.block_id
            WHERE p.run_id = ?
              AND b.document_id = ?
            ORDER BY p.id
        """, (run_id, run["document_id"])).fetchall()

        # 4. JSON 응답 반환
        return {
            "run_id": run["run_id"],
            "document_id": run["document_id"],
            "data_origin": run["data_origin"],
            "offset_unit": run["offset_unit"],
            "blocks": [dict(row) for row in blocks],
            "original_predictions": [
                dict(row) for row in predictions
            ],
            "latest_review": None
        }

    finally:
        conn.close()

# 검토한 조건 하나의 데이터 구조
class ReviewItem(BaseModel):
    prediction_id: int
    reviewed_value: str | None
    condition_status: Literal[
        "extracted", "unknown",
        "explicit_none", "needs_review"
    ]


# 검토 저장 요청 구조
class ReviewRequest(BaseModel):
    base_revision: int = Field(ge=0)
    review_status: Literal[
        "draft", "in_review", "modified"
    ]
    reason: str | None = None
    items: list[ReviewItem]


# 새 검토 버전 저장 API
@app.post("/api/runs/{run_id}/reviews")
def save_review(run_id: str, request: ReviewRequest):
    conn = get_db()

    try:
        # 동시에 수정할 때 충돌하지 않도록 잠금
        conn.execute("BEGIN IMMEDIATE")

        # 실행 ID 존재 여부 확인
        run = conn.execute(
            "SELECT run_id FROM runs WHERE run_id = ?",
            (run_id,)
        ).fetchone()

        if run is None:
            raise HTTPException(404, "실행 ID가 없습니다.")

        # 최신 검토 버전 확인
        row = conn.execute("""
            SELECT COALESCE(MAX(revision), 0)
            FROM reviews WHERE run_id = ?
        """, (run_id,)).fetchone()

        latest = row[0]

        if request.base_revision != latest:
            raise HTTPException(
                409, "검토 버전이 충돌했습니다."
            )

        # 해당 실행의 모든 예측 ID 확인
        expected = [
            row[0] for row in conn.execute(
                "SELECT id FROM predictions WHERE run_id = ?",
                (run_id,)
            ).fetchall()
        ]

        received = [
            item.prediction_id for item in request.items
        ]

        if sorted(expected) != sorted(received):
            raise HTTPException(
                422, "검토 대상 조건 ID가 일치하지 않습니다."
            )

        # 새 검토 버전 생성
        revision = latest + 1

        items_json = json.dumps(
            [item.model_dump() for item in request.items],
            ensure_ascii=False
        )

        conn.execute("""
            INSERT INTO reviews
            (run_id, revision, base_revision,
             review_status, items_json, reason)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            run_id,
            revision,
            request.base_revision,
            request.review_status,
            items_json,
            request.reason
        ))

        conn.commit()

        return {
            "run_id": run_id,
            "revision": revision,
            "review_status": request.review_status,
            "message": "검토 결과 저장 완료"
        }

    except Exception:
        conn.rollback()
        raise

    finally:
        conn.close()

# 저장된 검토 결과 조회 API
@app.get("/api/runs/{run_id}/reviews/{revision}")
def get_review(run_id: str, revision: int):
    conn = get_db()

    try:
        # DB에서 해당 검토 버전 찾기
        review = conn.execute("""
            SELECT run_id, revision, base_revision,
                   review_status, items_json,
                   reason, created_at
            FROM reviews
            WHERE run_id = ? AND revision = ?
        """, (run_id, revision)).fetchone()

        # 저장된 검토 결과가 없는 경우
        if review is None:
            raise HTTPException(
                status_code=404,
                detail="해당 검토 결과를 찾을 수 없습니다."
            )

        # 저장된 JSON 문자열을 다시 데이터로 변환
        return {
            "run_id": review["run_id"],
            "revision": review["revision"],
            "base_revision": review["base_revision"],
            "review_status": review["review_status"],
            "reason": review["reason"],
            "created_at": review["created_at"],
            "items": json.loads(review["items_json"])
        }

    finally:
        conn.close()

# 검토한 결과를 CSV 파일로 다운로드
@app.get("/api/runs/{run_id}/reviews/{revision}/export.csv")
def export_review_csv(run_id: str, revision: int):
    conn = get_db()

    try:
        # 1. 저장된 검토 버전 가져오기
        review = conn.execute("""
            SELECT items_json, review_status
            FROM reviews
            WHERE run_id = ? AND revision = ?
        """, (run_id, revision)).fetchone()

        if review is None:
            raise HTTPException(
                status_code=404,
                detail="검토 결과를 찾을 수 없습니다."
            )

        # 2. 최초 AI 추출 결과 가져오기
        predictions = conn.execute("""
            SELECT id, block_id, label, raw_text
            FROM predictions
            WHERE run_id = ?
            ORDER BY id
        """, (run_id,)).fetchall()

        # 3. 검토 결과를 prediction_id 기준으로 연결
        items = {
            item["prediction_id"]: item
            for item in json.loads(review["items_json"])
        }

        # 4. CSV 내용 생성
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "run_id",
            "revision",
            "block_id",
            "label",
            "original_value",
            "reviewed_value",
            "condition_status",
            "review_status"
        ])

        for prediction in predictions:
            item = items[prediction["id"]]

            writer.writerow([
                run_id,
                revision,
                prediction["block_id"],
                prediction["label"],
                prediction["raw_text"],
                item["reviewed_value"],
                item["condition_status"],
                review["review_status"]
            ])

        # 5. 한글이 엑셀에서 깨지지 않도록 인코딩
        csv_data = output.getvalue().encode("utf-8-sig")

        # 6. CSV 파일 응답
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition":
                    f'attachment; filename="review_v{revision}.csv"'
            }
        )

    finally:
        conn.close()

