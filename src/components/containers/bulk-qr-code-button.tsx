'use client'

import { useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import QRCodeSVG from 'react-qr-code'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ContainerWithDetails } from '@/lib/db/containers'

export function BulkQrCodeButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [containers, setContainers] = useState<ContainerWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchContainers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/containers')
      if (!response.ok) {
        throw new Error('Failed to fetch containers')
      }
      const data = await response.json()
      setContainers(data)
    } catch (err) {
      setError('보관함을 불러오는데 실패했습니다.')
      console.error('Error fetching containers:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    fetchContainers()
  }

  const handlePrint = () => {
    window.print()
  }

  const getContainerUrl = (containerId: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/container/${containerId}`
    }
    return ''
  }

  return (
    <>
      <Button variant="default" onClick={handleOpen} size="lg">
        <Printer className="mr-2 h-5 w-5" />
        전체 QR 출력
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>전체 보관함 QR 코드</DialogTitle>
            <DialogDescription>
              {isLoading
                ? '보관함을 불러오는 중...'
                : `${containers.length}개의 보관함 QR 코드를 출력할 수 있습니다.`}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : containers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                출력할 보관함이 없습니다.
              </p>
            </div>
          ) : (
            <>
              {/* Print Button - Hidden during print */}
              <div className="flex justify-end pb-4 print:hidden">
                <Button onClick={handlePrint} size="lg">
                  <Printer className="mr-2 h-5 w-5" />
                  전체 인쇄하기
                </Button>
              </div>

              {/* QR Codes Grid - Scrollable in dialog, multi-page in print */}
              <div
                id="bulk-qr-container"
                className="overflow-y-auto max-h-[60vh] print:overflow-visible print:max-h-none"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2 print:gap-8">
                  {containers.map((container) => (
                    <div
                      key={container.id}
                      className="qr-card flex flex-col items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-6 print:border-dashed print:p-8 print:break-inside-avoid"
                    >
                      <div className="text-center">
                        <h3 className="text-lg font-bold text-gray-900 print:text-2xl">
                          {container.name}
                        </h3>
                        {container.location && (
                          <p className="text-sm text-muted-foreground mt-1 print:text-base">
                            {container.location.name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-center bg-white p-4 rounded print:p-6">
                        <QRCodeSVG
                          value={getContainerUrl(container.id)}
                          size={160}
                          level="H"
                          className="print:w-48 print:h-48"
                        />
                      </div>

                      <div className="text-center w-full">
                        <p className="text-xs text-muted-foreground break-all px-2 print:text-sm">
                          {getContainerUrl(container.id)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          /* Hide everything except the QR codes */
          body * {
            visibility: hidden;
          }

          #bulk-qr-container,
          #bulk-qr-container * {
            visibility: visible;
          }

          /* Position the container properly */
          #bulk-qr-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-height: none;
            overflow: visible;
          }

          /* Ensure proper page breaks */
          .qr-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Page settings */
          @page {
            margin: 1.5cm;
            size: A4 portrait;
          }

          /* Force black and white printing */
          * {
            color: black !important;
            background: white !important;
          }

          /* Make QR codes and text more prominent */
          .qr-card {
            border: 2px dashed #333 !important;
            padding: 2rem !important;
            margin-bottom: 1.5rem !important;
          }

          /* Ensure proper spacing in grid */
          #bulk-qr-container > div {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 2rem;
          }
        }
      `}</style>
    </>
  )
}
