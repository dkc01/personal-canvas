"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CourseTray({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        router.back();
      }, 300);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {children}
      </SheetContent>
    </Sheet>
  );
}
