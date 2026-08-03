import type { Metadata } from "next";
import {
  Clock,
  HandPalm,
  MagnifyingGlass,
  ShareNetwork,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";

import DotWave from "@/components/DotWave";
import SampleCarousel from "@/components/SampleCarousel";
import Faq, { type FaqEntry } from "@/components/landing/Faq";
import HeroRun from "@/components/landing/HeroRun";
import PlatformBand from "@/components/landing/PlatformBand";
import PrimaryCta from "@/components/landing/PrimaryCta";
import Reveal from "@/components/landing/Reveal";
import SiteFooter from "@/components/landing/SiteFooter";
import TaglineReveal from "@/components/landing/TaglineReveal";

export const metadata: Metadata = {
  // Absolute, so the site template does not append the brand name twice.
  title: { absolute: "Carouly · marketing that runs while you sleep" },
  description:
    "Tell us what you sell, once. Every night we find what your customers are searching for, turn it into a post they will save, and publish it to every account you connect.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Marketing that runs while you sleep",
    description:
      "Every night, a post built around what your customers are actually searching for. Written, designed and published without you.",
    type: "website",
  },
};

/** One container, so every section lines up on the same two edges. */
const shell = "mx-auto w-full max-w-6xl px-6";

const run = [
  {
    marker: "Once",
    title: "Tell us what you sell",
    body: "What you make, who buys it, and the thing you know more about than they do. One short form, and you are done for good.",
  },
  {
    marker: "Every night",
    title: "We find what they are asking",
    body: "Not a topic a model made up. Real phrases people are typing into search, ranked by how many want the answer and how few brands are bothering to give it.",
  },
  {
    marker: "Minutes later",
    title: "It gets written and designed",
    body: "A finished post that teaches one useful thing in your field, laid out and ready. There is no template waiting for you to fill it in.",
  },
  {
    marker: "Your hour",
    title: "It goes out",
    body: "Instagram, TikTok, Facebook, LinkedIn and X, in your timezone. Or it holds for your approval, if you would rather keep a hand on the wheel.",
  },
];

const benefits = [
  {
    icon: Clock,
    title: "You stop being the bottleneck",
    body: "The reason you post twice a month is that writing it is a job. That job now belongs to something that never gets a busy week.",
  },
  {
    icon: MagnifyingGlass,
    title: "You stop guessing what to post",
    body: "Every topic starts from real search demand in your field, so you are answering a question people already have instead of posting into silence.",
  },
  {
    icon: ShareNetwork,
    title: "One setup, every timeline",
    body: "Every account you connected gets the same post on the same night. One thing to manage instead of five.",
  },
  {
    icon: HandPalm,
    title: "You keep the final say",
    body: "Leave it fully automatic, or hold every post for approval and change anything you like before it goes out.",
  },
];

const comparison = {
  them: {
    heading: "Most social tools",
    points: [
      "Hand you an empty box and a calendar to fill in",
      "Suggest topics a model invented on the spot",
      "Post about the product, every single time",
      "Charge you per network, and want a login for each",
    ],
  },
  us: {
    heading: "Carouly",
    points: [
      "Nothing to fill in after the first minute",
      "Topics taken from what people are searching for right now",
      "Three posts that help before one that sells",
      "Every network from the same setup, on the same night",
    ],
  },
};

const faq: FaqEntry[] = [
  {
    question: "Will it sound like me?",
    answer:
      "It writes from what you tell it once: what you sell, who buys it, the field your advice comes from, and what makes you different from the shop next door. That description is yours to edit at any time, and you can rewrite any individual post before it publishes.",
  },
  {
    question: "Can I approve posts before they go out?",
    answer:
      "Yes. Turn off auto publish and every post waits in the queue until you release it. Writing and publishing are separate switches, so it can keep producing daily without anything reaching your audience unseen.",
  },
  {
    question: "Where do the topics come from?",
    answer:
      "From what people are actually typing into search. We pull live autocomplete from Google and DuckDuckGo for your field, around 300 real phrases, and rank them by how much demand each one has against how many brands already answer it. Nothing is invented.",
  },
  {
    question: "Which platforms does it post to?",
    answer:
      "Instagram, TikTok, Facebook Pages, LinkedIn and X. You can also connect nothing at all and just download the finished posts to publish by hand.",
  },
  {
    question: "Is this not just more AI slop?",
    answer:
      "Slop is what happens when every post is an advert. Three of the four slides never mention you, because a post nobody saves is worth nothing. The pitch arrives once, at the end, after the reader has been given something.",
  },
  {
    question: "What does it cost?",
    answer:
      "It is free while we are in early access, and there is no card at signup. If that changes you will hear about it before you are charged anything.",
  },
  {
    question: "How much of my time does this take?",
    answer:
      "About a minute to describe your business, and a minute per social account you connect. After that, none, unless you choose to review posts before they publish.",
  },
  {
    question: "What if I do not like a topic it picked?",
    answer:
      "Bin it and the next best one takes its place. The whole list is visible, so you can approve or reject topics in bulk long before any of them get written.",
  },
  {
    question: "Can I change how the posts look?",
    answer:
      "Yes. One setting controls the colours and type, another controls the look of the generated image. They are independent, so you can keep your palette and change the photography, or the other way round.",
  },
  {
    question: "Why does the last slide point at my bio link?",
    answer:
      "Because Instagram will not let you put a working link anywhere else. The final slide makes the brand unmistakable and sends people to the one link you do control.",
  },
];

export default function Home() {
  return (
    <>
      {/* The base layer styles every <main> as a padded app container. The
          marketing page manages its own full bleed sections instead. */}
      <main className="max-w-none bg-ink px-0 pt-0">
        {/* Hero -------------------------------------------------------------
            The page claims the thing keeps running without you, so the hero
            has to show a run rather than a post. One artifact in a column
            proves the tool can make a picture; four nights ending in an empty
            slot for tonight proves the only thing worth proving here. */}
        <section className="relative overflow-hidden pt-4">
          {/* Held to the copy block. Behind the run it competed with the
              artwork instead of lighting the field. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem]">
            <DotWave />
          </div>

          <div className={`${shell} relative pt-24`}>
            <p className="rise font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
              Marketing on autopilot
            </p>

            {/* Broken by hand at the clause, so no line ends mid phrase. */}
            <h1 className="rise stagger-1 heading-ink balance mt-6 max-w-[680px] text-4xl font-bold tracking-tight sm:text-5xl">
              Your marketing runs
              <br />
              while you sleep.
            </h1>

            <p className="rise stagger-2 pretty mt-6 max-w-[680px] text-lg text-dim">
              Tell us what you sell, once. Every night we find what your
              customers are searching for, turn it into a post worth saving,
              and publish it while you sleep.
            </p>

            <div className="rise stagger-3 mt-10 flex flex-wrap items-center gap-6">
              <PrimaryCta />
              <a
                href="#example"
                className="rounded-full text-base text-dim outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-bone focus-visible:ring-2 focus-visible:ring-ember"
              >
                Open one of these nights
              </a>
            </div>

            {/* The one thing a visitor needs before scrolling: what it costs
                to find out. There is no logo strip or testimonial to show yet,
                and inventing one would be worse than showing nothing, so the
                above-the-fold signal is the risk they are being asked to take.
                The closing CTA restates the same three facts, so the page
                opens and shuts on one promise rather than two. */}
            <p className="rise stagger-4 mt-8 text-sm text-dim">
              Free while in early access · No card at signup · Five networks
              from one setup
            </p>
          </div>

          <div className="relative mt-8 pb-16">
            <p
              className={`${shell} font-mono text-xs uppercase tracking-[0.2em] text-dim`}
            >
              An example run · four nights for one coffee roaster
            </p>

            <div className="mt-6">
              <HeroRun />
            </div>
          </div>
        </section>

        <PlatformBand />

        {/* What it posts --------------------------------------------------- */}
        <section id="example" className="scroll-mt-24 border-t border-hair">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
                One night, in full
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-bone sm:text-4xl">
                Three posts that help. One that sells.
              </h2>
              <p className="pretty mt-6 max-w-2xl text-lg text-dim">
                A real night&rsquo;s work for a small coffee roaster, exactly as
                it would have gone out. Nothing in the first three slides
                mentions the shop, which is precisely why someone saves it and
                sends it to a friend. The pitch waits until it has earned a
                look.
              </p>
            </Reveal>

            <Reveal delay={120} className="mt-12">
              <SampleCarousel width={264} />
            </Reveal>
          </div>
        </section>

        {/* Tagline ---------------------------------------------------------
            The one full bleed band on the page, on warm black rather than true
            black, so it reads as a held breath between arguments. */}
        <section className="border-t border-hair bg-warm-ink">
          <div className={`${shell} py-24`}>
            <TaglineReveal
              className="text-4xl font-semibold tracking-tight sm:text-5xl"
              text="Nobody saves an advert. They save the thing that taught them something. So we give three of those away every day, before we ever mention you."
            />
          </div>
        </section>

        {/* How it works --------------------------------------------------- */}
        <section id="run" className="scroll-mt-24 border-t border-hair">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
                How it works
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-bone sm:text-4xl">
                You show up once. It shows up every night.
              </h2>
            </Reveal>

            {/* An ordered list with a rail, because this genuinely is a
                sequence: each step consumes what the one above produced. */}
            <ol className="mt-16 border-l border-hair">
              {run.map((step, index) => (
                <Reveal
                  as="li"
                  key={step.title}
                  delay={index * 80}
                  className="relative grid gap-3 pb-12 pl-8 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8"
                >
                  <span
                    aria-hidden
                    className="absolute -left-1 top-2 size-2 rounded-full bg-ember"
                  />
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim sm:pt-1">
                    {step.marker}
                  </p>
                  <div>
                    <h3 className="text-lg font-semibold text-bone">
                      {step.title}
                    </h3>
                    <p className="pretty mt-3 max-w-2xl text-base leading-relaxed text-dim">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefits -------------------------------------------------------- */}
        <section className="border-t border-hair">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
                What you get
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-bone sm:text-4xl">
                A feed that keeps running when your week falls apart
              </h2>
            </Reveal>

            <ul className="mt-12 grid gap-4 sm:grid-cols-2">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon;

                return (
                  <Reveal
                    as="li"
                    key={benefit.title}
                    delay={index * 80}
                    // No `.surface` here: that class sets its own `transition`
                    // shorthand, which would replace the reveal's transition-all
                    // and leave the card stuck at opacity 0.
                    className="rounded-2xl border border-hair bg-raise p-8 hover:border-ember/30 hover:bg-raise-2"
                  >
                    <Icon
                      weight="duotone"
                      aria-hidden
                      className="size-6 text-ember"
                    />
                    <h3 className="mt-6 text-lg font-semibold text-bone">
                      {benefit.title}
                    </h3>
                    <p className="pretty mt-3 text-base leading-relaxed text-dim">
                      {benefit.body}
                    </p>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Objection band --------------------------------------------------- */}
        <section id="why" className="scroll-mt-24 border-t border-hair">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
                Why it gets saved
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-bone sm:text-4xl">
                The difference between posting daily and being worth following
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-4 lg:grid-cols-2">
              <Reveal className="rounded-2xl border border-hair bg-raise p-8">
                <h3 className="text-base font-semibold text-dim">
                  {comparison.them.heading}
                </h3>
                <ul className="mt-6 space-y-4">
                  {comparison.them.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <XCircle
                        weight="duotone"
                        aria-hidden
                        className="mt-0.5 size-5 shrink-0 text-dim"
                      />
                      <span className="pretty text-base leading-relaxed text-dim">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal
                delay={120}
                className="rounded-2xl border border-ember/30 bg-raise p-8"
              >
                <h3 className="text-base font-semibold text-bone">
                  {comparison.us.heading}
                </h3>
                <ul className="mt-6 space-y-4">
                  {comparison.us.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <CheckCircle
                        weight="duotone"
                        aria-hidden
                        className="mt-0.5 size-5 shrink-0 text-ember"
                      />
                      <span className="pretty text-base leading-relaxed text-bone">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* FAQ -------------------------------------------------------------- */}
        <section id="faq" className="scroll-mt-24 border-t border-hair">
          <div className={`${shell} py-24`}>
            <div className="grid gap-12 lg:grid-cols-[20rem_minmax(0,1fr)]">
              {/* Pinned while the answers scroll past. The column is a third
                  of the width and a tenth of the height of what sits beside
                  it, so left in flow it reads as a label that fell off the
                  top of the list. */}
              <Reveal className="lg:sticky lg:top-28 lg:self-start">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
                  Questions
                </p>
                <h2 className="balance mt-6 text-3xl font-semibold tracking-tight text-bone sm:text-4xl">
                  The things people ask before signing up
                </h2>
              </Reveal>

              <Reveal delay={120}>
                <Faq entries={faq} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* Final CTA --------------------------------------------------------
            On the tagline band's warm black rather than the page's true black.
            Those are the only two moments that are not argument — the pause
            before the case is made, and the ask after it — so they stand on
            the same ground and bracket everything in between. */}
        <section className="border-t border-hair bg-warm-ink">
          <div className={`${shell} py-24`}>
            <Reveal className="max-w-[680px]">
              <h2 className="heading-ink balance text-4xl font-bold tracking-tight sm:text-5xl">
                Set it up tonight.
                <br />
                Forget about it tomorrow.
              </h2>
              <p className="pretty mt-6 text-lg text-dim">
                Describe your business, connect one account, and the first post
                goes out at your next scheduled hour.
              </p>

              <div className="mt-10">
                <PrimaryCta />
              </div>

              <ul className="mt-8 flex flex-wrap gap-6 text-sm text-dim">
                <li>Free while in early access</li>
                <li>No card at signup</li>
                <li>Cancel any time</li>
                <li>Or download the posts and publish them yourself</li>
              </ul>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Answer engines lift these verbatim, so they must match the copy the
          visitor sees rather than a keyword stuffed variant. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((entry) => ({
              "@type": "Question",
              name: entry.question,
              acceptedAnswer: { "@type": "Answer", text: entry.answer },
            })),
          }),
        }}
      />
    </>
  );
}
