import Image from 'next/image'
import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <Image
            src="/agu-error.svg"
            alt="오프라인"
            width={200}
            height={200}
            className="h-48 w-48"
          />
        </div>

        <div className="space-y-4">
          <div className="flex justify-center">
            <WifiOff className="h-16 w-16 text-muted-foreground" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight">
            오프라인 상태입니다
          </h1>

          <p className="text-lg text-muted-foreground">
            인터넷 연결을 확인해주세요
          </p>

          <p className="text-sm text-muted-foreground">
            일부 기능은 오프라인에서 제한될 수 있습니다.
            <br />
            네트워크에 다시 연결되면 자동으로 동기화됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
