export type UploadedDocument = {
  id: string
  fileName: string
}

export type AnalyzedSourceBlock = {
  blockId: string
  text: string
  page: number | null
}

export type ReviewCsvRow = {
  condition: string
  value: string
  valueStatus: string
  reviewStatus: string
  source: string
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

// These functions are the UI-facing API boundary. Replace their simulated bodies
// with FastAPI requests without changing the review components.
export async function uploadPdfDocument(file: File): Promise<UploadedDocument> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) throw new Error('PDF 형식의 파일만 업로드할 수 있습니다.')
  if (file.size > 20 * 1024 * 1024) throw new Error('파일 크기는 20MB 이하여야 합니다.')

  await wait(700)
  return {
    id: `DOC-${Date.now().toString(36).toUpperCase()}`,
    fileName: file.name,
  }
}

export async function analyzePdfDocument(
  document: UploadedDocument,
): Promise<{ analysisId: string; sourceBlocks: AnalyzedSourceBlock[] }> {
  await wait(1300)
  return {
    analysisId: `ANALYSIS-${document.id}`,
    // The simulator cannot determine real locations. FastAPI should return
    // one-based PDF pages here after text extraction.
    sourceBlocks: [],
  }
}

export async function saveReviewResult(payload: {
  documentId: string
  conditions: Record<string, unknown>
}): Promise<{ savedAt: string }> {
  void payload
  await wait(650)
  return { savedAt: new Date().toISOString() }
}

export function downloadReviewCsv(rows: ReviewCsvRow[], fileName: string) {
  const headers = ['조건명', '검토 값', '값 확인 상태', '검토 상태', '원문 출처']
  const csvRows = rows.map((row) => [
    row.condition,
    row.value,
    row.valueStatus === 'unverified' ? '미확인' : row.valueStatus === 'none' ? '없음' : '확인됨',
    row.reviewStatus,
    row.source,
  ])
  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
