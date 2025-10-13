'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MoreVertical, Pencil, Trash2, QrCode, Printer, X } from 'lucide-react'
import QRCodeSVG from 'react-qr-code'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface ContainerActionsMenuProps {
  containerId: string
  containerName: string
}

export function ContainerActionsMenu({
  containerId,
  containerName,
}: ContainerActionsMenuProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Generate the full URL for the container
  const containerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/container/${containerId}`
    : ''

  const handlePrint = () => {
    window.print()
  }

  async function handleDelete() {
    try {
      setIsDeleting(true)

      const response = await fetch(`/api/containers/${containerId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '보관함 삭제에 실패했습니다')
      }

      toast.success('보관함이 삭제되었습니다')
      setShowDeleteDialog(false)
      router.push('/container')
      router.refresh()
    } catch (error) {
      console.error('Error deleting container:', error)
      toast.error(error instanceof Error ? error.message : '보관함 삭제에 실패했습니다')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      {/* Desktop: Individual buttons */}
      <div className="hidden gap-2 md:flex">
        <Button variant="outline" asChild>
          <Link href={`/container/${containerId}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            수정
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowDeleteDialog(true)}
          aria-label="보관함 삭제"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          삭제
        </Button>
        <Button variant="outline" onClick={() => setShowQrDialog(true)} aria-label="QR 코드 보기">
          <QrCode className="mr-2 h-4 w-4" />
          QR 출력
        </Button>
      </div>

      {/* Mobile: Dropdown menu */}
      <div className="md:hidden">
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              aria-label="메뉴 열기"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link
                href={`/container/${containerId}/edit`}
                className="flex cursor-pointer items-center"
              >
                <Pencil className="mr-2 h-4 w-4" />
                수정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDropdownOpen(false)
                setShowQrDialog(true)
              }}
              className="flex cursor-pointer items-center"
            >
              <QrCode className="mr-2 h-4 w-4" />
              QR 출력
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setDropdownOpen(false)
                setShowDeleteDialog(true)
              }}
              className="flex cursor-pointer items-center text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>보관함을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{containerName}</span> 보관함과 안에 있는 모든 물품이 삭제됩니다.
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
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
                <p className="max-w-xs break-all text-xs text-muted-foreground">
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
              onClick={() => setShowQrDialog(false)}
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
