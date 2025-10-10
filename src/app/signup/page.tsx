import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "@/components/auth/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is already logged in, redirect to home
  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Image
              priority
              src="/agu-welcome.svg"
              alt="환영합니다"
              width={200}
              height={200}
              className="h-48 w-48"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">아 그거 어딨지</h1>
          <p className="text-lg text-muted-foreground">보관함 관리 시스템</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>회원가입</CardTitle>
            <CardDescription>
              새 계정을 만들어 보관함 관리를 시작하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SignupForm />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  또는
                </span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                이미 계정이 있으신가요?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary hover:underline"
                >
                  로그인
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          물건을 잃어버리지 않도록 도와드립니다
        </p>
      </div>
    </div>
  );
}
