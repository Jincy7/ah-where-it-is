import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { DesktopNav } from "./desktop-nav";
import { navGroups } from "./nav-config";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Don't render navbar on login page or if no user
  if (!user) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6 px-4">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/agu-logo.png"
              alt="아 그거 어딨지"
              width={80}
              height={80}
              className="h-10 w-10"
            />
            <span className="text-xl font-bold">아 그거 어딨지</span>
          </Link>

          {/* Desktop Navigation */}
          <DesktopNav navGroups={navGroups} />
        </div>

        {/* Right side - User menu and mobile toggle */}
        <div className="flex items-center gap-2">
          <UserMenu userEmail={user.email!} />

          {/* Mobile menu toggle */}
          <div className="md:hidden">
            <MobileNav navGroups={navGroups} />
          </div>
        </div>
      </div>
    </header>
  );
}
