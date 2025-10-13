"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "홈",
    icon: Home,
  },
  {
    href: "/search",
    label: "검색",
    icon: Search,
  },
  {
    href: "/settings",
    label: "설정",
    icon: Settings,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  // Check if current path matches the nav item href
  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-around h-16 pb-safe">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                "min-w-[44px] min-h-[44px]",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform",
                  active && "scale-110"
                )}
              />
              <span
                className={cn(
                  "text-xs font-medium",
                  active && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
