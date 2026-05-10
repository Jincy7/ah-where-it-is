"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NavGroup } from "./nav-config";
import { navIcons } from "./nav-icons";

interface MobileNavProps {
  navGroups: readonly NavGroup[];
}

export function MobileNav({ navGroups }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
          <span className="sr-only">메뉴 열기</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>메뉴</SheetTitle>
          <SheetDescription className="sr-only">
            주요 메뉴와 하위 페이지 링크
          </SheetDescription>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-4">
          {navGroups.map((group) => {
            const Icon = navIcons[group.icon];

            if (group.items?.length) {
              return (
                <div key={group.href} className="space-y-1">
                  <div className="flex h-11 items-center gap-3 px-4 text-sm font-medium text-muted-foreground">
                    <Icon className="size-5" />
                    {group.label}
                  </div>
                  <div className="ml-6 flex flex-col gap-1 border-l pl-3">
                    {group.items.map((item) => {
                      const ItemIcon = navIcons[item.icon];

                      return (
                        <Button
                          key={item.href}
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-10 justify-start gap-3"
                          onClick={() => setOpen(false)}
                        >
                          <Link href={item.href}>
                            <ItemIcon className="size-4" />
                            {item.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <Button
                key={group.href}
                variant="ghost"
                size="lg"
                asChild
                className="justify-start gap-3"
                onClick={() => setOpen(false)}
              >
                <Link href={group.href}>
                  <Icon className="size-5" />
                  {group.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
