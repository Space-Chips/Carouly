import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CarouselControls } from "@/components/CarouselActions";
import SlideEditor from "@/components/SlideEditor";
import SlidePreview from "@/components/SlidePreview";
import StatusPill from "@/components/StatusPill";
import { getBrand } from "@/lib/actions/brand.actions";
import { getCarousel } from "@/lib/actions/carousel.actions";
import { getConnections } from "@/lib/actions/connection.actions";
import { getEntitlement } from "@/lib/billing";

export default async function CarouselPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const brand = await getBrand();
  if (!brand) redirect("/onboarding");

  const carousel = await getCarousel(id);
  if (!carousel) notFound();

  const connections = await getConnections();
  const hasConnections = connections.some((c) => c.enabled);
  const { tier } = await getEntitlement();

  return (
    <main className="pb-24">
      <Link
        href="/carousels"
        className="text-sm text-muted-foreground underline transition-colors hover:text-foreground"
      >
        ← All carousels
      </Link>

      <div className="rise mt-6 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">
              {carousel.title}
            </h1>
            <StatusPill status={carousel.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Keyword: {carousel.keyword_text} ·{" "}
            {new Date(carousel.created_at).toLocaleString()}
          </p>
          {carousel.error ? (
            <p className="mt-2 text-sm text-red-400">{carousel.error}</p>
          ) : null}
        </div>

        <CarouselControls
          carouselId={carousel.id}
          hasConnections={hasConnections}
          canPublish={tier.limits.autoPublish}
        />
      </div>

      <section className="rise stagger-1 mt-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
          Slides
        </h2>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-4 snap-x">
          {carousel.slides.map((slide) => (
            <div
              key={slide.id}
              className="grid gap-2 snap-start transition-transform duration-300 hover:-translate-y-1"
            >
              <SlidePreview
                slide={slide}
                carousel={carousel}
                brand={brand}
                total={carousel.slides.length}
                width={260}
              />
              {slide.image_url ? (
                <a
                  href={slide.image_url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline text-muted-foreground text-center"
                >
                  Download slide {slide.position + 1}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rise stagger-2 mt-12 grid lg:grid-cols-2 gap-10">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
            Copy
          </h2>
          <div className="mt-4 grid gap-4">
            {carousel.slides.map((slide) => (
              <SlideEditor key={slide.id} slide={slide} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
            Caption
          </h2>
          <div className="mt-4 rounded-lg border border-white/10 p-4">
            <p className="text-sm whitespace-pre-wrap">{carousel.caption}</p>
            <p className="mt-4 text-sm text-sky-300">
              {carousel.hashtags.map((tag) => `#${tag}`).join(" ")}
            </p>
          </div>

          {carousel.posts.length ? (
            <>
              <h2 className="mt-10 text-sm uppercase tracking-widest text-muted-foreground">
                Publishing history
              </h2>
              <ul className="mt-4 grid gap-2">
                {carousel.posts.map((post) => (
                  <li
                    key={post.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block capitalize">{post.platform}</span>
                      {post.error ? (
                        <span className="block text-xs text-red-400 truncate">
                          {post.error}
                        </span>
                      ) : post.permalink ? (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs underline text-muted-foreground truncate"
                        >
                          {post.permalink}
                        </a>
                      ) : null}
                    </span>
                    <StatusPill status={post.status} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
