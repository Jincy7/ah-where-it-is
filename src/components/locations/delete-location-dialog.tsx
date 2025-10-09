'use client'

import { useState } from 'react'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Tables } from '@/types/supabase'

type Location = Tables<'locations'>

interface DeleteLocationDialogProps {
  location: Location
  onDelete: (id: string) => void
}

export function DeleteLocationDialog({
  location,
  onDelete,
}: DeleteLocationDialogProps) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    try {
      setIsDeleting(true)

      const response = await fetch(`/api/locations/${location.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete location')
      }

      toast.success('위치가 삭제되었습니다')
      onDelete(location.id)
      setOpen(false)
    } catch (error) {
      console.error('Error deleting location:', error)
      toast.error('위치 삭제에 실패했습니다')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>위치를 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              <strong>{location.name}</strong>을(를) 삭제하려고 합니다.
            </p>
            <p className="text-destructive">
              이 위치를 사용하는 보관함의 위치 정보가 제거됩니다. 이 작업은
              되돌릴 수 없습니다.
            </p>
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
  )
}
