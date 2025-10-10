import Link from "next/link";
import Image from "next/image";
import { Home, Settings, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Don't render navbar on login page or if no user
  if (!user) {
    return null;
  }

  // Define nav links with icon names as strings
  const navLinks = [
    { href: "/", label: "홈", icon: "home" as const },
    { href: "/search", label: "검색", icon: "search" as const },
    { href: "/settings", label: "설정", icon: "settings" as const },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6 px-4">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/agu-logo-2.svg"
              alt="아 그거 어딨지"
              width={40}
              height={40}
              className="h-10 w-10"
            />
            <span className="text-xl font-bold">아 그거 어딨지</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 px-4">
            <Button variant="ghost" size="sm" asChild className="gap-2">
              <Link href="/">
                <Home className="h-4 w-4" />홈
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="gap-2">
              <Link href="/search">
                <Search className="h-4 w-4" />
                검색
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="gap-2">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                설정
              </Link>
            </Button>
          </nav>
        </div>

        {/* Right side - User menu and mobile toggle */}
        <div className="flex items-center gap-2">
          <UserMenu userEmail={user.email!} />

          {/* Mobile menu toggle */}
          <div className="md:hidden">
            <MobileNav navLinks={navLinks} />
          </div>
        </div>
      </div>
    </header>
  );
}
