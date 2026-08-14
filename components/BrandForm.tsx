"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import LogoUpload from "@/components/LogoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBrand, type BrandFormValues } from "@/lib/actions/brand.actions";
import { Brand } from "@/types";

/**
 * Everything the generator needs to know about the brand. The three required
 * fields are the ones that shape every post: who you are, what the
 * product does, and which domain the tips should come from.
 */
export default function BrandForm({
  brand,
  redirectTo,
}: {
  brand: Brand | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The upload already stored it against the row; this only keeps the value in
  // the payload so an unrelated save cannot fall behind it.
  const [logoUrl, setLogoUrl] = useState<string | null>(brand?.logo_url ?? null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const values: BrandFormValues = {
      name: String(form.get("name") ?? ""),
      product_description: String(form.get("product_description") ?? ""),
      domain: String(form.get("domain") ?? ""),
      audience: String(form.get("audience") ?? ""),
      differentiator: String(form.get("differentiator") ?? ""),
      website_url: String(form.get("website_url") ?? ""),
      handle: String(form.get("handle") ?? ""),
      bio_link_label: String(form.get("bio_link_label") ?? ""),
      logo_url: logoUrl,
      posts_per_day: brand?.posts_per_day ?? 1,
      post_hour: brand?.post_hour ?? 9,
      timezone:
        brand?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone ??
        "UTC",
      autopilot: brand?.autopilot ?? false,
      auto_publish: brand?.auto_publish ?? false,
    };

    startTransition(async () => {
      try {
        await saveBrand(values);
        setSaved(true);
        router.refresh();
        if (redirectTo) router.push(redirectTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save brand.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6 max-w-2xl">
      <Field
        name="name"
        label="Brand name"
        defaultValue={brand?.name}
        placeholder="Northline"
        required
      />

      <LogoUpload value={logoUrl} onUploaded={setLogoUrl} />

      <div className="grid gap-2">
        <Label htmlFor="product_description">What does your product do?</Label>
        <Textarea
          id="product_description"
          name="product_description"
          required
          rows={3}
          defaultValue={brand?.product_description ?? ""}
          placeholder="A focus timer that blocks distracting apps and turns your deep work sessions into a weekly report."
        />
        <p className="text-xs text-muted-foreground">
          Written in one or two sentences. This drives every conversion slide.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="domain">Content domain</Label>
        <Input
          id="domain"
          name="domain"
          required
          defaultValue={brand?.domain ?? ""}
          placeholder="productivity and focus habits"
        />
        <p className="text-xs text-muted-foreground">
          The subject your tips live in. Posts teach this — never the product.
        </p>
      </div>

      <Field
        name="audience"
        label="Audience"
        defaultValue={brand?.audience ?? ""}
        placeholder="Freelancers and indie founders who work alone"
      />

      <Field
        name="differentiator"
        label="What makes you different (optional)"
        defaultValue={brand?.differentiator ?? ""}
        placeholder="The only timer that reports on outcomes, not hours"
      />

      <div className="grid sm:grid-cols-2 gap-6">
        <Field
          name="handle"
          label="Social handle"
          defaultValue={brand?.handle ?? ""}
          placeholder="@northline"
        />
        <Field
          name="website_url"
          label="Website"
          defaultValue={brand?.website_url ?? ""}
          placeholder="https://northline.app"
        />
      </div>

      <Field
        name="bio_link_label"
        label="Bio link wording"
        defaultValue={brand?.bio_link_label ?? "link in bio"}
        placeholder="link in bio"
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {saved && !redirectTo ? (
        <p className="text-sm text-emerald-400">Saved.</p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : brand ? "Save brand" : "Create brand"}
        </Button>
      </div>
    </form>
  );
}

const Field = ({
  name,
  label,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
}) => (
  <div className="grid gap-2">
    <Label htmlFor={name}>{label}</Label>
    <Input
      id={name}
      name={name}
      required={required}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
    />
  </div>
);
