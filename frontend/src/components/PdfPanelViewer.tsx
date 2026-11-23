import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type PdfPanelViewerProps = {
  file: string | null
  fileName: string
  initialPage: number | null
}

export function PdfPanelViewer({ file, fileName, initialPage }: PdfPanelViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [pageNumber, setPageNumber] = useState(initialPage ?? 1)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [pageWidth, setPageWidth] = useState(480)
  const [zoom, setZoom] = useState(1)
  const hasLinkedPdf = Boolean(file && initialPage)

  useEffect(() => {
    setPageNumber(initialPage ?? 1)
    setPageCount(null)
    setZoom(1)
  }, [file, initialPage])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(Math.max(250, entry.contentRect.width - 30))
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const previousPage = () => setPageNumber((current) => Math.max(1, current - 1))
  const nextPage = () => setPageNumber((current) => Math.min(pageCount ?? current, current + 1))

  return (
    <div className="pdf-panel-viewer">
      <div className="pdf-panel-toolbar">
        <div>
          <span>현재 파일</span>
          <strong>{fileName}</strong>
        </div>
        <div className="pdf-panel-zoom" aria-label="PDF 확대 축소">
          <button
            type="button"
            disabled={!hasLinkedPdf}
            onClick={() => setZoom((current) => Math.max(0.7, current - 0.1))}
          >
            축소
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            disabled={!hasLinkedPdf}
            onClick={() => setZoom((current) => Math.min(1.8, current + 0.1))}
          >
            확대
          </button>
        </div>
      </div>

      <div className="pdf-panel-scroll" ref={viewportRef}>
        {hasLinkedPdf && file && initialPage ? (
          <Document
            file={file}
            loading={<div className="pdf-panel-message">PDF 원본을 불러오고 있습니다.</div>}
            error={
              <div className="pdf-panel-message error">
                PDF 원본을 표시할 수 없습니다. 파일 연결 상태를 확인해 주세요.
              </div>
            }
            onLoadSuccess={({ numPages }) => {
              setPageCount(numPages)
              setPageNumber(Math.min(Math.max(1, initialPage), numPages))
            }}
          >
            <Page
              pageNumber={pageNumber}
              width={pageWidth * zoom}
              renderAnnotationLayer
              renderTextLayer
              loading={<div className="pdf-panel-message">페이지를 렌더링하고 있습니다.</div>}
            />
          </Document>
        ) : (
          <div className="pdf-panel-message empty">
            <strong>연결된 PDF 원본이 없습니다</strong>
            <p>PDF 페이지 위치가 분석 결과에 연결된 후 원본을 확인할 수 있습니다.</p>
          </div>
        )}
      </div>

      <div className="pdf-panel-footer">
        <button type="button" onClick={previousPage} disabled={!hasLinkedPdf || pageNumber <= 1}>
          이전
        </button>
        <span>
          <strong>{hasLinkedPdf ? pageNumber : '–'}</strong> / {pageCount ?? '–'}
        </span>
        <button type="button" onClick={nextPage} disabled={!hasLinkedPdf || !pageCount || pageNumber >= pageCount}>
          다음
        </button>
      </div>
    </div>
  )
}
