"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import LogoUpload from "@/components/LogoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBrand } from "@/lib/actions/brand.actions";
import { generateKeywords } from "@/lib/actions/keyword.actions";

/**
 * Onboarding in three steps rather than one wall of eight fields.
 *
 * The split is by question, not by field count: who you are, what you talk
 * about, and where it goes. Only the first two steps have required fields, so
 * a user can be through setup in about a minute.
 *
 * The final submit also builds the keyword bank, so onboarding ends with a
 * populated product rather than an empty dashboard. If that call fails (no
 * OpenRouter key yet) we still land the user on the dashboard — the brand is
 * already saved, and the bank refills itself on first generation anyway.
 */

type Values = Record<string, string>;

const STEPS = [
  { title: "Your brand", hint: "What you are and what you sell." },
  { title: "Your subject", hint: "What your posts will teach." },
  { title: "Where it points", hint: "How the last slide converts." },
];

/**
 * What can honestly be derived from a hostname alone.
 *
 * `northline.coffee` gives a brand name and a website, and nothing else. It is
 * deliberately not dressed up as having read the site: the fields are filled,
 * labelled as a starting point, and every one of them is editable, so nobody is
 * shown a guess wearing the clothes of a fact.
 */
const fromHost = (host: string): Values => {
  const [label] = host.split(".");

  return {
    name: label.charAt(0).toUpperCase() + label.slice(1),
    website_url: `https://${host}`,
  };
};

export default function OnboardingWizard({ site }: { site?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(() => ({
    bio_link_label: "link in bio",
    ...(site ? fromHost(site) : {}),
  }));
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const canAdvance =
    step === 0
      ? Boolean(values.name?.trim() && values.product_description?.trim())
      : step === 1
        ? Boolean(values.domain?.trim())
        : true;

  const submit = () => {
    setError(null);

    startTransition(async () => {
      try {
        setStage("Saving your brand…");
        await saveBrand({
          name: values.name ?? "",
          product_description: values.product_description ?? "",
          domain: values.domain ?? "",
          audience: values.audience,
          differentiator: values.differentiator,
          handle: values.handle,
          website_url: values.website_url,
          bio_link_label: values.bio_link_label,
          // Uploaded before the row existed, so it is carried in here rather
          // than written by the upload itself.
          logo_url: values.logo_url ?? null,
          posts_per_day: 1,
          post_hour: 9,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
          autopilot: false,
          auto_publish: false,
        });

        setStage("Researching keywords in your domain…");
        try {
          await generateKeywords(25);
        } catch (keywordError) {
          console.error(keywordError);
        }

        // The dashboard, not the buy page.
        //
        // This used to hand somebody straight to a two-step paywall, because a
        // subscription had to be sold before the product would do anything.
        // Under credits it already has: a new account carries its welcome
        // credits, and the honest next screen is the one where they can spend
        // them on the domain the setup just researched.
        router.push("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save brand.");
        setStage(null);
      }
    });
  };

  if (pending) {
    return (
      <div className="rise max-w-xl">
        <p className="text-sm breathe">{stage}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Building the first keyword bank takes around 30 seconds.
        </p>
        <div className="mt-6 grid gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="shimmer h-10 rounded-lg border border-white/10 bg-white/[0.03]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      {/* The address they pasted, held in view for the whole wizard. Without it
          the first screen looks like the form they were trying to avoid. */}
      {site ? (
        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Starting from
          </span>
          <span className="text-sm font-semibold">{site}</span>
          <span className="text-xs text-muted-foreground">
            Change anything below.
          </span>
        </div>
      ) : null}

      {/* Progress: three segments, filled left to right. */}
      <div className="flex gap-2" aria-label={`Step ${step + 1} of 3`}>
        {STEPS.map((item, index) => (
          <div key={item.title} className="flex-1">
            <div
              className={`h-0.5 rounded-full transition-colors duration-500 ${
                index <= step ? "bg-orange-500" : "bg-white/15"
              }`}
            />
          </div>
        ))}
      </div>

      <div key={step} className="rise mt-8">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Step {step + 1} of 3
        </p>
        {/* Title and hint are one unit — they sit tight together, with the
            gap below the pair rather than between them. */}
        <h2 className="mt-4 text-2xl font-semibold tracking-tight leading-tight">
          {STEPS[step].title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {STEPS[step].hint}
        </p>

        <div className="mt-8 grid gap-6">
          {step === 0 ? (
            <>
              <Field
                id="name"
                label="Brand name"
                value={values.name}
                onChange={set("name")}
                placeholder="Northline"
                autoFocus
              />
              <div className="grid gap-2">
                <Label htmlFor="product_description">
                  What does your product do?
                </Label>
                <Textarea
                  id="product_description"
                  rows={3}
                  value={values.product_description ?? ""}
                  onChange={set("product_description")}
                  placeholder="A focus timer that blocks distracting apps and turns deep work sessions into a weekly report."
                />
                <p className="text-xs text-muted-foreground">
                  One or two sentences. This drives every conversion slide.
                </p>
              </div>

              <LogoUpload
                value={values.logo_url}
                onUploaded={(url) =>
                  setValues((current) => ({ ...current, logo_url: url }))
                }
              />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="domain">Content domain</Label>
                <Input
                  id="domain"
                  value={values.domain ?? ""}
                  onChange={set("domain")}
                  placeholder="productivity and focus habits"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The subject your tips live in. Posts teach this — never
                  the product itself.
                </p>
              </div>
              <Field
                id="audience"
                label="Audience"
                value={values.audience}
                onChange={set("audience")}
                placeholder="Freelancers and indie founders who work alone"
              />
              <Field
                id="differentiator"
                label="What makes you different (optional)"
                value={values.differentiator}
                onChange={set("differentiator")}
                placeholder="Reports on outcomes, not hours"
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field
                id="handle"
                label="Social handle"
                value={values.handle}
                onChange={set("handle")}
                placeholder="@northline"
                autoFocus
              />
              <Field
                id="website_url"
                label="Website"
                value={values.website_url}
                onChange={set("website_url")}
                placeholder="https://northline.app"
              />
              <Field
                id="bio_link_label"
                label="Bio link wording"
                value={values.bio_link_label}
                onChange={set("bio_link_label")}
                placeholder="link in bio"
              />
              <p className="text-xs text-muted-foreground">
                The last slide shows your brand name at full size followed by
                this wording — never a raw URL, which most platforms strip.
              </p>
            </>
          ) : null}
        </div>

        {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null}

        <div className="mt-10 flex items-center gap-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}

          {step < 2 ? (
            <Button disabled={!canAdvance} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button onClick={submit}>Finish setup</Button>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  id: string;
  label: string;
  value?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) => (
  <div className="grid gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  </div>
);
