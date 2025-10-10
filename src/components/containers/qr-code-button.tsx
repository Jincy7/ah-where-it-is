'use client'

import { useState } from 'react'
import { QrCode, Printer, X } from 'lucide-react'
import QRCodeSVG from 'react-qr-code'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface QrCodeButtonProps {
  containerId: string
  containerName: string
}

export function QrCodeButton({ containerId, containerName }: QrCodeButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Generate the full URL for the container
  const containerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/container/${containerId}`
    : ''

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <QrCode className="mr-2 h-4 w-4" />
        QR 출력
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>보관함 QR 코드</DialogTitle>
            <DialogDescription>
              QR 코드를 스캔하여 {containerName} 보관함에 빠르게 접근할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* QR Code Container - Optimized for Print */}
            <div
              id="qr-code-container"
              className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-white p-8 print:border-none print:p-0"
            >
              <div className="text-center print:mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {containerName}
                </h3>
              </div>

              {containerUrl && (
                <div className="rounded-lg bg-white p-6">
                  <QRCodeSVG
                    value={containerUrl}
                    size={200}
                    level="H"
                    className="print:h-64 print:w-64"
                  />
                </div>
              )}

              <div className="text-center">
                <p className="text-xs text-muted-foreground break-all max-w-xs">
                  {containerUrl}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row print:hidden">
            <Button
              type="button"
              variant="default"
              onClick={handlePrint}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              인쇄하기
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          #qr-code-container,
          #qr-code-container * {
            visibility: visible;
          }

          #qr-code-container {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            max-width: 400px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2rem;
          }

          @page {
            margin: 2cm;
            size: A4 portrait;
          }
        }
      `}</style>
    </>
  )
}
