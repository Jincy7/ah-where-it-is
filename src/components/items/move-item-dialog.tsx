'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { ContainerSummary } from '@/lib/db'

interface MoveItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  itemName: string
  currentContainerId: string
  onSuccess: () => void
}

export function MoveItemDialog({
  open,
  onOpenChange,
  itemId,
  itemName,
  currentContainerId,
  onSuccess,
}: MoveItemDialogProps) {
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [selectedContainerId, setSelectedContainerId] = useState<string>('')
  const [isLoadingContainers, setIsLoadingContainers] = useState(false)
  const [isMoving, setIsMoving] = useState(false)

  // Fetch containers when dialog opens
  useEffect(() => {
    if (open) {
      fetchContainers()
    } else {
      // Reset state when dialog closes
      setSelectedContainerId('')
    }
  }, [open])

  async function fetchContainers() {
    try {
      setIsLoadingContainers(true)
      const response = await fetch('/api/containers/move-list')

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '보관함 목록을 불러오는데 실패했습니다')
      }

      const data = await response.json()
      setContainers(data)
    } catch (error) {
      console.error('Error fetching containers:', error)
      toast.error(
        error instanceof Error ? error.message : '보관함 목록을 불러오는데 실패했습니다'
      )
    } finally {
      setIsLoadingContainers(false)
    }
  }

  async function handleMove() {
    if (!selectedContainerId) {
      toast.error('이동할 보관함을 선택해주세요')
      return
    }

    if (selectedContainerId === currentContainerId) {
      toast.error('현재 보관함과 동일한 보관함입니다')
      return
    }

    try {
      setIsMoving(true)

      const response = await fetch(`/api/items/${itemId}/move`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newContainerId: selectedContainerId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '물품 이동에 실패했습니다')
      }

      toast.success('물품이 이동되었습니다')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error('Error moving item:', error)
      toast.error(error instanceof Error ? error.message : '물품 이동에 실패했습니다')
    } finally {
      setIsMoving(false)
    }
  }

  // Filter out current container from the list
  const availableContainers = containers.filter(
    (container) => container.id !== currentContainerId
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>물품 이동</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{itemName}</span> 물품을 다른 보관함으로
            이동합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoadingContainers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableContainers.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                이동 가능한 보관함이 없습니다.
                <br />
                다른 보관함을 먼저 만들어주세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="container-select"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                이동할 보관함
              </label>
              <Select
                value={selectedContainerId}
                onValueChange={setSelectedContainerId}
              >
                <SelectTrigger id="container-select">
                  <SelectValue placeholder="보관함을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {availableContainers.map((container) => (
                    <SelectItem key={container.id} value={container.id}>
                      {container.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMoving}
          >
            취소
          </Button>
          <Button
            onClick={handleMove}
            disabled={
              isMoving ||
              isLoadingContainers ||
              !selectedContainerId ||
              availableContainers.length === 0
            }
          >
            {isMoving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                이동 중...
              </>
            ) : (
              '이동'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
