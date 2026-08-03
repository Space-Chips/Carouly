"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadBrandLogo } from "@/lib/actions/brand.actions";

/**
 * Uploads the brand mark that sits on every slide's top rail.
 *
 * A logo and a profile picture are the same thing here — one field, one
 * wording, no choice to make. The slide draws whatever arrives, and asking a
 * user to classify their own image would be a question with no consequence.
 *
 * Uploads on selection rather than on submit: the point of the control is
 * seeing the mark come back, and onboarding has no row to save it against yet.
 */
export default function LogoUpload({
  value,
  onUploaded,
  label = "Logo or profile picture",
}: {
  value?: string | null;
  onUploaded?: (url: string) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(value ?? null);
  const [error, setError] = useState<string | null>(null);

  const choose = (file: File | undefined) => {
    if (!file) return;

    setError(null);

    const body = new FormData();
    body.set("file", file);

    startTransition(async () => {
      try {
        const uploaded = await uploadBrandLogo(body);
        setUrl(uploaded);
        onUploaded?.(uploaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload that image.");
      } finally {
        // Lets the same file be picked again after a failure — without this the
        // input holds the old value and the change event never fires.
        if (input.current) input.current.value = "";
      }
    });
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="logo">{label}</Label>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Your brand mark"
              width={64}
              height={64}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              None
            </span>
          )}
        </div>

        <div className="grid gap-1">
          <input
            ref={input}
            id="logo"
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => input.current?.click()}
            >
              {pending ? "Uploading…" : url ? "Replace image" : "Upload image"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            PNG or JPEG, up to 2 MB. It sits beside your handle on every slide.
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
