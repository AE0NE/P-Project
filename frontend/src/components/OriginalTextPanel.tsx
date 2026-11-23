export type SourceBlock = {
  blockId: string
  text: string
  page: number | null
}

type OriginalTextPanelProps = {
  blocks: SourceBlock[]
  selectedIndex: number
  selectedConditionLabel: string
  documentName: string
  hasPdfSource: boolean
  onBlockClick: (block: SourceBlock) => void
}

export function OriginalTextPanel({
  blocks,
  selectedIndex,
  selectedConditionLabel,
  documentName,
  hasPdfSource,
  onBlockClick,
}: OriginalTextPanelProps) {
  return (
    <>
      <div className="source-copy">
        {blocks.map((block, index) => {
          const selected = selectedIndex === index
          const hasLinkedPdf = block.page !== null && hasPdfSource

          return (
            <button
              key={block.blockId}
              className={`source-block ${selected ? 'highlighted' : ''}`}
              type="button"
              onClick={() => onBlockClick(block)}
              aria-label={
                hasLinkedPdf
                  ? `${block.text}, PDF ${block.page}쪽 원본 확인`
                  : `${block.text}, 연결된 PDF 원본 확인`
              }
              title={hasLinkedPdf ? `PDF ${block.page}쪽 열기` : '연결된 PDF 원본 정보 확인'}
            >
              <span className="source-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="source-text">{block.text}</span>
              <span className={`page-badge ${block.page === null ? 'unknown' : ''} ${selected ? 'selected' : ''}`}>
                {block.page === null ? '위치 미확인' : `${block.page}쪽`}
              </span>
            </button>
          )
        })}
      </div>
      <div className="source-footer">
        <span>선택한 조건</span>
        <strong>{selectedConditionLabel}</strong>
        <p>{documentName}에서 추출한 원문입니다. 문장을 누르면 연결된 PDF 원본 정보를 확인할 수 있습니다.</p>
      </div>
    </>
  )
}
