'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageModalProps {
  src: string
  alt: string
  trigger?: React.ReactNode
}

export function ImageModal({ src, alt, trigger }: ImageModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [zoom, setZoom] = useState(1)

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 1))
  }

  const handleClose = () => {
    setIsOpen(false)
    // Reset zoom when closing
    setTimeout(() => setZoom(1), 200)
  }

  return (
    <>
      {/* Trigger element - if provided, use it. Otherwise, show default image */}
      {trigger ? (
        <div onClick={() => setIsOpen(true)}>{trigger}</div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative aspect-video w-full overflow-hidden rounded-lg border bg-muted transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="이미지 크게 보기"
        >
          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority
          />
          {/* Hover overlay with zoom icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <div className="rounded-full bg-background/90 p-3 opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-6 w-6" />
            </div>
          </div>
        </button>
      )}

      {/* Full screen modal */}
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent
          className="max-w-[95vw] p-0 md:max-w-[90vw] lg:max-w-[85vw]"
          aria-describedby="image-modal-description"
        >
          <DialogTitle className="sr-only">{alt} - 이미지 보기</DialogTitle>
          <div id="image-modal-description" className="sr-only">
            보관함 사진을 크게 볼 수 있습니다. 줌 버튼으로 확대/축소하거나 ESC 키로 닫을 수 있습니다.
          </div>

          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-50 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={handleClose}
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Zoom controls */}
          <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-full bg-background/80 p-2 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              aria-label="축소"
              className="h-9 w-9"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="flex items-center px-3 text-sm font-medium">
              {Math.round(zoom * 100)}%
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              aria-label="확대"
              className="h-9 w-9"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Image container with scroll */}
          <div className="relative h-[80vh] w-full overflow-auto bg-muted/30">
            <div
              className={cn(
                'flex h-full w-full items-center justify-center p-4',
                zoom > 1 && 'cursor-move'
              )}
            >
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transition: 'transform 0.2s ease-in-out',
                }}
                className="relative h-full w-full"
              >
                <Image
                  src={src}
                  alt={alt}
                  fill
                  className="object-contain"
                  sizes="95vw"
                  quality={95}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface ContainerImageProps {
  src: string
  alt: string
}

/**
 * Container image component with click-to-expand functionality
 */
export function ContainerImage({ src, alt }: ContainerImageProps) {
  return <ImageModal src={src} alt={alt} />
}
