import { useEffect, useMemo, useRef, useState } from 'react'
import { OriginalTextPanel, type SourceBlock } from './components/OriginalTextPanel'
import { PdfPanelViewer } from './components/PdfPanelViewer'
import {
  analyzePdfDocument,
  downloadReviewCsv,
  saveReviewResult,
  uploadPdfDocument,
} from './services/documentAnalysis'

type ConditionId =
  | 'target'
  | 'rate'
  | 'performance'
  | 'limit'
  | 'performanceExclusion'
  | 'benefitExclusion'

type ReviewStatus = '검토 전' | '검토 필요' | '검토 완료'
type ValueStatus = 'known' | 'none' | 'unverified'
type ScreenState = 'empty' | 'uploading' | 'analyzing' | 'complete' | 'error'
type PendingDocumentAction =
  | { type: 'select'; documentId: string }
  | { type: 'upload'; file: File }

type Condition = {
  id: ConditionId
  label: string
  value: string
  aiValue: string
  status: ReviewStatus
  valueStatus?: ValueStatus
  sourceIndex: number
  tag?: string
  description?: string
}

type ConditionDraft = {
  value: string
  status: ReviewStatus
  valueStatus?: ValueStatus
}

type DocumentRecord = {
  id: string
  name: string
  document: string
  documentId: string
  version: string
  source: string
  benefit: string
  sourceBlocks: SourceBlock[]
  pdfUrl: string | null
  conditions: Condition[]
}

const SYNTHETIC_ANALYSIS_TEMPLATE: DocumentRecord = {
    id: 'analysis-template',
    name: '개발용 분석 결과',
    document: '',
    documentId: '',
    version: '업로드 문서',
    source: '개발용 합성 분석 결과',
    benefit: '편의점 할인',
    pdfUrl: null,
    sourceBlocks: [
      { blockId: 'BLOCK-001', text: '편의점 결제 시 10%, 카페 결제 시 5% 할인됩니다.', page: null },
      { blockId: 'BLOCK-002', text: '전월 이용실적 30만 원 이상인 경우 제공됩니다.', page: null },
      { blockId: 'BLOCK-003', text: '편의점과 카페 할인은 합산하여 월 최대 5천 원까지 제공됩니다.', page: null },
      { blockId: 'BLOCK-004', text: '상품권 구매금액은 전월 실적에서 제외됩니다.', page: null },
      { blockId: 'BLOCK-005', text: '간편결제 거래에는 할인이 적용되지 않습니다.', page: null },
    ],
    conditions: [
      { id: 'target', label: '대상', value: '편의점', aiValue: '편의점', status: '검토 완료', sourceIndex: 0 },
      { id: 'rate', label: '혜택 비율', value: '10% 할인', aiValue: '10% 할인', status: '검토 완료', sourceIndex: 0 },
      {
        id: 'performance',
        label: '전월 실적',
        value: '20만 원 이상',
        aiValue: '20만 원 이상',
        status: '검토 필요',
        sourceIndex: 1,
      },
      {
        id: 'limit',
        label: '혜택 한도',
        value: '월 최대 5천 원',
        aiValue: '월 최대 5천 원',
        status: '검토 전',
        sourceIndex: 2,
        tag: '공유 한도',
        description: '편의점·카페 혜택이 월 5천 원 한도를 공유합니다.',
      },
      {
        id: 'performanceExclusion',
        label: '실적 제외',
        value: '상품권 구매금액',
        aiValue: '상품권 구매금액',
        status: '검토 전',
        sourceIndex: 3,
      },
      {
        id: 'benefitExclusion',
        label: '혜택 제외',
        value: '간편결제 거래',
        aiValue: '간편결제 거래',
        status: '검토 전',
        sourceIndex: 4,
      },
    ],
}

const STATUS_OPTIONS: ReviewStatus[] = ['검토 전', '검토 필요', '검토 완료']

const REVIEW_STATUS_CLASS: Record<ReviewStatus, string> = {
  '검토 전': 'badge-pending',
  '검토 필요': 'badge-warning',
  '검토 완료': 'badge-complete',
}

function DocumentIcon({ analysis = false }: { analysis?: boolean }) {
  return analysis ? (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 11.5A4.5 4.5 0 0 1 14.5 7h19A4.5 4.5 0 0 1 38 11.5v25a4.5 4.5 0 0 1-4.5 4.5h-19a4.5 4.5 0 0 1-4.5-4.5z" />
      <path d="M17 17h14M17 24h8" />
      <path d="m27.5 32 3 3 6-7" className="accent-stroke" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M13 5h15l8 8v28H13z" />
      <path d="M28 5v9h8M19 23h11M19 29h11M19 35h7" />
      <path d="M8 13v28h20" className="accent-stroke" />
    </svg>
  )
}

function HeaderLogo() {
  return (
    <div className="brand" aria-label="PERQO">
      <img
        src="/perqo-logo.svg"
        alt="PERQO"
        className="brand-logo"
      />
    </div>
  )
}

function ValueBadge({ status }: { status: Exclude<ValueStatus, 'known'> }) {
  return (
    <span className={`value-state ${status === 'unverified' ? 'value-unverified' : 'value-none'}`}>
      {status === 'unverified' ? '미확인' : '없음'}
    </span>
  )
}

type ConditionRowProps = {
  condition: Condition
  selected: boolean
  editing: boolean
  draftValue?: string
  draftStatus?: ReviewStatus
  draftValueStatus?: ValueStatus
  onSelect: () => void
  onEdit: () => void
  onValueChange: (value: string) => void
  onStatusChange: (status: ReviewStatus) => void
}

function ConditionRow({
  condition,
  selected,
  editing,
  draftValue,
  draftStatus,
  draftValueStatus,
  onSelect,
  onEdit,
  onValueChange,
  onStatusChange,
}: ConditionRowProps) {
  const status = draftStatus ?? condition.status
  const valueStatus = draftValueStatus ?? condition.valueStatus

  return (
    <div
      className={`condition-row ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      aria-pressed={selected}
    >
      <div className="condition-label">{condition.label}</div>
      <div className="condition-value">
        {editing ? (
          <div className="edit-stack" onClick={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={draftValue}
              onChange={(event) => onValueChange(event.target.value)}
              aria-label={`${condition.label} 값`}
            />
            <span>최초 AI 예측: {condition.aiValue}</span>
          </div>
        ) : (
          <div className="value-line">
            {valueStatus && valueStatus !== 'known' ? (
              <ValueBadge status={valueStatus} />
            ) : (
              <span>{draftValue ?? condition.value}</span>
            )}
            {condition.tag && <span className="limit-tag">{condition.tag}</span>}
          </div>
        )}
        {selected && condition.description && <p className="condition-description">{condition.description}</p>}
      </div>
      <div className="condition-review">
        {selected ? (
          <div className="selected-actions" onClick={(event) => event.stopPropagation()}>
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as ReviewStatus)}
              aria-label={`${condition.label} 검토 상태`}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            {!editing && (
              <button className="text-button" type="button" onClick={onEdit}>
                값 수정
              </button>
            )}
          </div>
        ) : (
          <span className={`review-badge ${REVIEW_STATUS_CLASS[status]}`}>{status}</span>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const operationIdRef = useRef(0)
  const documentUrlsRef = useRef(new Set<string>())
  const [screenState, setScreenState] = useState<ScreenState>('empty')
  const [isDragging, setIsDragging] = useState(false)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null)
  const [previewBlock, setPreviewBlock] = useState<SourceBlock | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingDocumentAction | null>(null)
  const [processingFileName, setProcessingFileName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedId, setSelectedId] = useState<ConditionId>('performance')
  const [editingId, setEditingId] = useState<ConditionId | null>(null)
  const [draft, setDraft] = useState<Partial<Record<ConditionId, ConditionDraft>>>({})
  const [savedResults, setSavedResults] = useState<Partial<Record<string, Partial<Record<ConditionId, ConditionDraft>>>>>({})
  const [hasSavedResult, setHasSavedResult] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const hasChanges = Object.keys(draft).length > 0
  const selectedCondition =
    activeDocument?.conditions.find((condition) => condition.id === selectedId) ?? activeDocument?.conditions[0]
  const currentConditions = useMemo(() => {
    if (!activeDocument) return []
    return activeDocument.conditions.map((condition) => ({
      ...condition,
      value: savedResults[activeDocument.id]?.[condition.id]?.value ?? condition.value,
      status: savedResults[activeDocument.id]?.[condition.id]?.status ?? condition.status,
      valueStatus: savedResults[activeDocument.id]?.[condition.id]?.valueStatus ?? condition.valueStatus,
    }))
  }, [activeDocument, savedResults])

  const resetReviewState = () => {
    setDraft({})
    setEditingId(null)
    setSelectedId('performance')
    setNotice(null)
    setIsSaving(false)
    setPreviewBlock(null)
  }

  useEffect(() => {
    const urls = documentUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const processFile = async (file: File) => {
    const operationId = ++operationIdRef.current
    resetReviewState()
    setErrorMessage('')
    setProcessingFileName(file.name)
    setScreenState('uploading')
    setActiveDocument(null)
    setHasSavedResult(false)

    try {
      const upload = await uploadPdfDocument(file)
      if (operationId !== operationIdRef.current) return
      setScreenState('analyzing')
      const analysis = await analyzePdfDocument(upload)
      if (operationId !== operationIdRef.current) return

      const pdfUrl = URL.createObjectURL(file)
      documentUrlsRef.current.add(pdfUrl)
      const analyzedDocument: DocumentRecord = {
        ...SYNTHETIC_ANALYSIS_TEMPLATE,
        id: `uploaded-${upload.id}`,
        name: file.name.replace(/\.pdf$/i, ''),
        document: file.name,
        documentId: upload.id,
        version: '업로드 문서',
        source: '업로드 PDF · 개발용 합성 분석 결과',
        pdfUrl,
        sourceBlocks: SYNTHETIC_ANALYSIS_TEMPLATE.sourceBlocks.map((block) => {
          const analyzedBlock = analysis.sourceBlocks.find((item) => item.blockId === block.blockId)
          return {
            ...block,
            text: analyzedBlock?.text ?? block.text,
            page: analyzedBlock?.page ?? null,
          }
        }),
      }
      setDocuments((current) => [...current, analyzedDocument])
      setActiveDocument(analyzedDocument)
      setScreenState('complete')
    } catch (error) {
      if (operationId !== operationIdRef.current) return
      setErrorMessage(error instanceof Error ? error.message : '문서를 처리하지 못했습니다.')
      setScreenState('error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const requestFileUpload = (file: File) => {
    if (hasChanges) {
      setPendingAction({ type: 'upload', file })
      return
    }
    void processFile(file)
  }

  const activateDocument = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId)
    if (!document) return
    operationIdRef.current += 1
    resetReviewState()
    setActiveDocument(document)
    setScreenState('complete')
    setHasSavedResult(Boolean(savedResults[document.id]))
  }

  const requestDocumentChange = (documentId: string) => {
    if (!documentId || documentId === activeDocument?.id) return
    if (hasChanges) {
      setPendingAction({ type: 'select', documentId })
      return
    }
    activateDocument(documentId)
  }

  const continuePendingAction = (action: PendingDocumentAction) => {
    setPendingAction(null)
    if (action.type === 'select') {
      activateDocument(action.documentId)
    } else {
      void processFile(action.file)
    }
  }

  const startEditing = (condition: Condition) => {
    setEditingId(condition.id)
    setDraft((current) => ({
      ...current,
      [condition.id]: current[condition.id] ?? {
        value: condition.value,
        status: condition.status,
        valueStatus: condition.valueStatus,
      },
    }))
  }

  const updateDraft = (id: ConditionId, next: Partial<ConditionDraft>) => {
    const condition = currentConditions.find((item) => item.id === id)
    if (!condition) return
    setDraft((current) => ({
      ...current,
      [id]: {
        value: current[id]?.value ?? condition.value,
        status: current[id]?.status ?? condition.status,
        valueStatus: current[id]?.valueStatus ?? condition.valueStatus,
        ...next,
      },
    }))
  }

  const cancelChanges = () => {
    setDraft({})
    setEditingId(null)
    setNotice('변경사항을 취소했습니다.')
  }

  const saveChanges = async (): Promise<boolean> => {
    if (!activeDocument) return false
    setIsSaving(true)
    setNotice('검토 결과를 저장하고 있습니다.')

    const results = Object.fromEntries(
      currentConditions.map((condition) => [
        condition.id,
        draft[condition.id] ?? {
          value: condition.value,
          status: condition.status,
          valueStatus: condition.valueStatus,
        },
      ]),
    ) as Record<ConditionId, ConditionDraft>

    try {
      await saveReviewResult({ documentId: activeDocument.id, conditions: results })
      setSavedResults((current) => ({
        ...current,
        [activeDocument.id]: results,
      }))
      setDraft({})
      setEditingId(null)
      setHasSavedResult(true)
      setNotice('검토 결과가 저장되었습니다.')
      return true
    } catch {
      setNotice('저장하지 못했습니다. 수정한 값은 유지됩니다.')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const saveAndContinue = async () => {
    if (!pendingAction) return
    const action = pendingAction
    const saved = await saveChanges()
    if (saved) continuePendingAction(action)
  }

  const discardAndContinue = () => {
    if (!pendingAction) return
    const action = pendingAction
    setDraft({})
    setEditingId(null)
    continuePendingAction(action)
  }

  const cancelPendingAction = () => {
    setPendingAction(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const exportCsv = () => {
    if (!activeDocument || hasChanges || !hasSavedResult) return
    const saved = savedResults[activeDocument.id]
    downloadReviewCsv(
      currentConditions.map((condition) => ({
        condition: condition.label,
        value: saved?.[condition.id]?.value ?? condition.value,
        valueStatus: saved?.[condition.id]?.valueStatus ?? condition.valueStatus ?? 'known',
        reviewStatus: saved?.[condition.id]?.status ?? condition.status,
        source: activeDocument.sourceBlocks[condition.sourceIndex]?.text ?? '',
      })),
      `${activeDocument.name}-검토결과.csv`,
    )
    setNotice('마지막으로 저장된 검토 결과를 CSV로 내보냈습니다.')
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) requestFileUpload(file)
  }

  const isProcessing = screenState === 'uploading' || screenState === 'analyzing'
  const showReview = screenState === 'complete' && activeDocument

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".pdf,application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) requestFileUpload(file)
        }}
      />

      <header className="topbar">
        <HeaderLogo />
        <div className="header-selects">
          <label>
            <span>현재 문서</span>
            <select
              value={showReview ? activeDocument.id : ''}
              disabled={isProcessing}
              onChange={(event) => requestDocumentChange(event.target.value)}
            >
              <option value="" disabled>
                {isProcessing ? processingFileName : documents.length ? '문서를 선택해 주세요' : '등록된 PDF 없음'}
              </option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.document}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>혜택</span>
            <select value={showReview ? activeDocument.benefit : ''} disabled={!showReview} onChange={() => undefined}>
              <option value="">{isProcessing ? '분석 중' : '문서 분석 후 선택 가능'}</option>
              {showReview && <option value={activeDocument.benefit}>{activeDocument.benefit}</option>}
            </select>
          </label>
        </div>
      </header>

      <main className={`workspace ${!showReview ? 'workspace-empty' : ''}`}>
        <section className="source-panel" aria-labelledby="source-heading">
          <div className="section-heading">
            <div>
              <span className="section-number">01</span>
              <h1 id="source-heading">{previewBlock ? 'PDF 원본' : '원문'}</h1>
            </div>
            {showReview && previewBlock ? (
              <button className="panel-action" type="button" onClick={() => setPreviewBlock(null)}>
                원문 목록으로 돌아가기
              </button>
            ) : showReview ? (
              <button className="panel-action" type="button" onClick={openFilePicker}>
                다른 파일 업로드
              </button>
            ) : (
              <p>{isProcessing ? '문서 처리 중' : 'PDF 상품설명서'}</p>
            )}
          </div>

          {(screenState === 'empty' || screenState === 'error') && (
            <div
              className={`upload-zone ${isDragging ? 'is-dragging' : ''} ${screenState === 'error' ? 'has-error' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false)
              }}
              onDrop={handleDrop}
            >
              <div className="empty-icon">
                <DocumentIcon />
              </div>
              <h2>{screenState === 'error' ? '문서를 처리하지 못했습니다' : '카드 상품설명서를 업로드하세요'}</h2>
              <p>
                {screenState === 'error'
                  ? errorMessage
                  : isDragging
                    ? '이곳에 PDF 파일을 놓아주세요'
                    : 'PDF 파일을 끌어다 놓거나 파일을 선택해 주세요'}
              </p>
              <button className="upload-button" type="button" onClick={openFilePicker}>
                {screenState === 'error' ? '다시 시도' : '파일 선택'}
              </button>
              <small>PDF 파일 · 최대 20MB</small>
            </div>
          )}

          {isProcessing && (
            <div className="processing-state">
              <div className="processing-file-icon">
                <DocumentIcon />
              </div>
              <span className="processing-label">{screenState === 'uploading' ? 'PDF 업로드' : 'AI 조건 분석'}</span>
              <h2>{processingFileName}</h2>
              <div className="loading-line" aria-hidden="true">
                <span />
              </div>
              <strong>
                {screenState === 'uploading'
                  ? '파일을 업로드하고 있습니다'
                  : '원문과 혜택 조건을 분석하고 있습니다'}
              </strong>
              <p>문서 크기에 따라 잠시 시간이 걸릴 수 있습니다.</p>
            </div>
          )}

          {showReview && selectedCondition && !previewBlock && (
            <OriginalTextPanel
              blocks={activeDocument.sourceBlocks}
              selectedIndex={selectedCondition.sourceIndex}
              selectedConditionLabel={selectedCondition.label}
              documentName={activeDocument.document}
              hasPdfSource={Boolean(activeDocument.pdfUrl)}
              onBlockClick={setPreviewBlock}
            />
          )}

          {showReview && previewBlock && (
            <PdfPanelViewer
              file={activeDocument.pdfUrl}
              fileName={activeDocument.document}
              initialPage={previewBlock.page}
            />
          )}
        </section>

        <section className="conditions-panel" aria-labelledby="conditions-heading">
          <div className="section-heading">
            <div>
              <span className="section-number">02</span>
              <h1 id="conditions-heading">AI 추출 조건</h1>
            </div>
            <p>{showReview ? '조건 하나를 선택해 검토합니다' : '분석 결과'}</p>
          </div>

          {!showReview && (
            <div className={`analysis-empty ${isProcessing ? 'is-processing' : ''}`}>
              <div className="empty-icon">
                <DocumentIcon analysis />
              </div>
              <h2>{isProcessing ? '혜택 조건을 정리하고 있습니다' : '분석 결과가 여기에 표시됩니다'}</h2>
              <p>
                {isProcessing
                  ? '원문 구조를 확인하고 여섯 가지 조건을 추출합니다.'
                  : '문서를 업로드하면 혜택 조건을 자동으로 정리합니다.'}
              </p>
              {isProcessing && (
                <div className="analysis-steps">
                  <span className={screenState === 'uploading' ? 'active' : 'done'}>파일 업로드</span>
                  <span className={screenState === 'analyzing' ? 'active' : ''}>원문 추출</span>
                  <span>조건 정리</span>
                </div>
              )}
            </div>
          )}

          {showReview && (
            <>
              <div className="condition-head">
                <span>조건명</span>
                <span>AI 추출값</span>
                <span>검토 상태</span>
              </div>
              <div className="condition-list">
                {currentConditions.map((condition) => (
                  <ConditionRow
                    key={condition.id}
                    condition={condition}
                    selected={selectedId === condition.id}
                    editing={editingId === condition.id}
                    draftValue={draft[condition.id]?.value}
                    draftStatus={draft[condition.id]?.status}
                    draftValueStatus={draft[condition.id]?.valueStatus}
                    onSelect={() => {
                      setSelectedId(condition.id)
                      setNotice(null)
                    }}
                    onEdit={() => startEditing(condition)}
                    onValueChange={(value) => updateDraft(condition.id, { value, valueStatus: 'known' })}
                    onStatusChange={(status) => updateDraft(condition.id, { status })}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {showReview && (
        <footer className="action-bar">
          <div className="work-status" aria-live="polite">
            <span className={hasChanges ? 'status-dot changed' : hasSavedResult ? 'status-dot' : 'status-dot pending'} />
            <div>
              <strong>
                {isSaving
                  ? '저장 중'
                  : hasChanges
                    ? `미저장 변경 ${Object.keys(draft).length}건`
                    : hasSavedResult
                      ? '검토 결과 저장 완료'
                      : '검토 결과를 저장해 주세요'}
              </strong>
              <small>
                {notice ??
                  (hasChanges
                    ? 'CSV 내보내기 전에 변경사항을 저장해 주세요.'
                    : hasSavedResult
                      ? '마지막 저장 결과를 CSV로 내보낼 수 있습니다.'
                      : '저장이 완료되면 CSV 내보내기를 사용할 수 있습니다.')}
              </small>
            </div>
          </div>
          <div className="action-buttons">
            {hasChanges && (
              <button className="secondary-button" type="button" onClick={cancelChanges} disabled={isSaving}>
                변경 취소
              </button>
            )}
            <button
              className="secondary-button save-button"
              type="button"
              disabled={isSaving || (hasSavedResult && !hasChanges)}
              onClick={() => void saveChanges()}
            >
              {isSaving ? '저장 중...' : '검토 결과 저장'}
            </button>
            <button
              className="primary-button export-button"
              type="button"
              disabled={hasChanges || !hasSavedResult || isSaving}
              onClick={exportCsv}
            >
              CSV 내보내기
            </button>
          </div>
        </footer>
      )}

      {pendingAction && (
        <div className="unsaved-dialog-backdrop" role="presentation">
          <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
            <span className="review-badge badge-warning">미저장 변경</span>
            <h2 id="unsaved-dialog-title">변경사항을 어떻게 처리할까요?</h2>
            <p>현재 문서에서 수정한 내용이 저장되지 않았습니다. 문서를 변경하기 전에 처리 방법을 선택해 주세요.</p>
            <div className="unsaved-dialog-actions">
              <button className="primary-button" type="button" onClick={() => void saveAndContinue()} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장 후 이동'}
              </button>
              <button className="secondary-button" type="button" onClick={discardAndContinue} disabled={isSaving}>
                변경 취소 후 이동
              </button>
              <button className="dialog-cancel-button" type="button" onClick={cancelPendingAction} disabled={isSaving}>
                문서 변경 취소
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  )
}
