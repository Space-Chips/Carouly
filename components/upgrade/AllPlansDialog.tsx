"use client";

import { PricingTable } from "@clerk/nextjs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Every plan, one click away and no closer.
 *
 * Keeping the base paywall to two options is what makes it decide quickly;
 * hiding the rest behind this is what stops that simplicity from feeling like
 * information is being withheld. Clerk's own table renders here rather than a
 * hand built one, so a plan added in the dashboard shows up without a deploy.
 */
export default function AllPlansDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-hair bg-raise sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Compare all plans</DialogTitle>
          <DialogDescription className="pretty text-sm">
            Every plan includes the keyword research, the editor and the
            renderer. What changes is how many carousels a day it will write and
            post for you.
          </DialogDescription>
        </DialogHeader>

        {/* Unstyled on purpose: the dark theme is set once on ClerkProvider so
            this table, the checkout drawer and the sign-in screens all match
            without three separate appearance objects to keep in step. */}
        <div className="mt-4">
          <PricingTable />
        </div>
      </DialogContent>
    </Dialog>
  );
}
