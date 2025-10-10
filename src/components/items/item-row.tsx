'use client'

import { useState } from 'react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
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
import { toast } from 'sonner'
import { Pencil, Trash2, MoveHorizontal } from 'lucide-react'
import { OptimisticItem } from './item-list'
import { ItemForm } from './item-form'
import { MoveItemDialog } from './move-item-dialog'

interface ItemRowProps {
  item: OptimisticItem
  onDelete: (item: OptimisticItem) => void
  onMove?: () => void
}

export function ItemRow({ item, onDelete, onMove }: ItemRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)

  async function handleDelete() {
    try {
      setIsDeleting(true)

      const response = await fetch(`/api/items/${item.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '물품 삭제에 실패했습니다')
      }

      toast.success('물품이 삭제되었습니다')
      setShowDeleteDialog(false)
      onDelete(item)
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error(error instanceof Error ? error.message : '물품 삭제에 실패했습니다')
    } finally {
      setIsDeleting(false)
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={4} className="p-4">
          <ItemForm
            containerId={item.container_id}
            defaultValues={item}
            itemId={item.id}
            mode="edit"
            onSuccess={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
          />
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      <TableRow className={item.optimistic ? 'opacity-60' : ''}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell className="hidden sm:table-cell">
          {item.description || (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="hidden text-muted-foreground md:table-cell">
          {formatDate(item.created_at)}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMoveDialog(true)}
              disabled={item.optimistic}
              title="물품 이동"
            >
              <MoveHorizontal className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsEditing(true)}
              disabled={item.optimistic}
              title="물품 수정"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteDialog(true)}
              disabled={item.optimistic}
              title="물품 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>물품을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{item.name}</span> 물품이 삭제됩니다.
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

      <MoveItemDialog
        open={showMoveDialog}
        onOpenChange={setShowMoveDialog}
        itemId={item.id}
        itemName={item.name}
        currentContainerId={item.container_id}
        onSuccess={() => {
          if (onMove) {
            onMove()
          }
        }}
      />
    </>
  )
}
