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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Pencil, Trash2, MoveHorizontal, MoreVertical, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { OptimisticItem } from './item-list'
import { ItemForm } from './item-form'
import { MoveItemDialog } from './move-item-dialog'

interface ItemRowProps {
  item: OptimisticItem
  onDelete: (item: OptimisticItem) => void
  onUpdate?: (updatedItem: OptimisticItem) => void
  onMove?: () => void
}

export function ItemRow({ item, onDelete, onUpdate, onMove }: ItemRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [currentItem, setCurrentItem] = useState<OptimisticItem>(item)

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

  function handleUpdate(updatedItem: OptimisticItem) {
    setCurrentItem(updatedItem)
    setIsEditing(false)
    if (onUpdate) {
      onUpdate(updatedItem)
    }
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="p-4">
          <ItemForm
            containerId={currentItem.container_id}
            defaultValues={currentItem}
            itemId={currentItem.id}
            mode="edit"
            onSuccess={handleUpdate}
            onCancel={() => setIsEditing(false)}
          />
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      <TableRow className={currentItem.optimistic ? 'opacity-60' : ''}>
        <TableCell className="font-medium">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span>{currentItem.name}</span>
              <Badge variant="secondary" className="gap-1">
                <Package className="h-3 w-3" />
                {currentItem.quantity}
              </Badge>
            </div>
            {/* Mobile: Show description inline with expand/collapse */}
            {currentItem.description && (
              <div className="sm:hidden">
                <button
                  onClick={() => setShowDescription(!showDescription)}
                  className="text-left text-sm text-muted-foreground hover:text-foreground"
                >
                  {showDescription ? (
                    <span>{currentItem.description}</span>
                  ) : (
                    <span className="line-clamp-1">{currentItem.description}</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <Badge variant="outline" className="gap-1">
            <Package className="h-3 w-3" />
            {currentItem.quantity}개
          </Badge>
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          {currentItem.description || (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="hidden text-muted-foreground md:table-cell">
          {formatDate(currentItem.created_at)}
        </TableCell>
        <TableCell className="text-right">
          {/* Desktop: Show all buttons */}
          <div className="hidden justify-end gap-2 md:flex">
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
              disabled={currentItem.optimistic}
              title="물품 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile: Show dropdown menu */}
          <div className="flex justify-end md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={currentItem.optimistic}
                  title="작업 메뉴"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowMoveDialog(true)}>
                  <MoveHorizontal className="mr-2 h-4 w-4" />
                  이동
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>물품을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{currentItem.name}</span> 물품이 삭제됩니다.
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
        itemId={currentItem.id}
        itemName={currentItem.name}
        currentContainerId={currentItem.container_id}
        onSuccess={() => {
          if (onMove) {
            onMove()
          }
        }}
      />
    </>
  )
}
