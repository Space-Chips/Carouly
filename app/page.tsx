import type { Metadata } from "next";
import {
  Clock,
  HandPalm,
  MagnifyingGlass,
  ShareNetwork,
} from "@phosphor-icons/react/dist/ssr";

import CompareTable from "@/components/landing/CompareTable";
import Faq, { type FaqEntry } from "@/components/landing/Faq";
import HeroStage from "@/components/landing/HeroStage";
import PlatformBand from "@/components/landing/PlatformBand";
import ReelFan from "@/components/landing/ReelFan";
import ReelRail from "@/components/landing/ReelRail";
import Reveal from "@/components/landing/Reveal";
import RunPanel from "@/components/landing/RunPanel";
import SectionPager from "@/components/landing/SectionPager";
import SiteFooter from "@/components/landing/SiteFooter";
import TaglineReveal from "@/components/landing/TaglineReveal";
import UrlComposer from "@/components/landing/UrlComposer";

export const metadata: Metadata = {
  // Absolute, so the site template does not append the brand name twice.
  title: { absolute: "Carouly · your URL to nightly video" },
  description:
    "Paste your web address. Every night Carouly finds what your customers are searching for, cuts it into short vertical video for TikTok, Reels and Shorts, and publishes it while you sleep.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Your URL to nightly video",
    description:
      "Paste one web address. Short vertical video every night, built around what people are actually searching for in your field.",
    type: "website",
  },
};

/** One container, so every section lines up on the same two edges. */
const shell = "mx-auto w-full max-w-6xl px-6";

const run = [
  {
    marker: "One box",
    title: "You paste your web address",
    body: "That is the whole brief. What you sell, who buys it and the thing you know more about than they do are all already written on your own site.",
  },
  {
    marker: "Every night",
    title: "It finds what they are asking",
    body: "Not a topic a model invented. Real phrases people are typing into search in your field, ranked by how many want the answer against how few brands bother to give it.",
  },
  {
    marker: "Minutes later",
    title: "It gets cut into video",
    body: "A script, a shot list and a finished vertical cut of six to twenty seconds, plus the caption and the cover frame it goes out with.",
  },
  {
    marker: "Your hour",
    title: "It goes out",
    body: "TikTok, Reels, Shorts, and the feeds you already post to, in your timezone. Or it holds for approval, if you would rather keep a hand on the wheel.",
  },
];

const benefits = [
  {
    icon: Clock,
    title: "You stop being the bottleneck",
    body: "The reason you post twice a month is that filming it is a job. That job now belongs to something that never has a busy week.",
  },
  {
    icon: MagnifyingGlass,
    title: "You stop guessing at hooks",
    body: "Every clip opens on a question people are already typing into search, so the first two seconds are answering someone instead of shouting at everyone.",
  },
  {
    icon: ShareNetwork,
    title: "One address, every timeline",
    body: "One address covers every account you connected, and the same cut is reframed for each of them on the same night. One thing to manage instead of five.",
  },
  {
    icon: HandPalm,
    title: "You keep the final say",
    body: "Leave it fully automatic, or hold every cut for approval and change the script, the shots or the caption before anything publishes.",
  },
];

const faq: FaqEntry[] = [
  {
    question: "What happens when I paste my website?",
    answer:
      "It becomes the starting point for your setup. We read what you sell, who you sell it to and what subject your advice lives in off your own pages, then show you what we got so you can correct it. Nothing publishes until you have connected an account and released the first run.",
  },
  {
    question: "Are the videos real footage or generated?",
    answer:
      "Generated. Carouly writes the script, picks the format, and renders a vertical cut you can edit shot by shot. If you would rather film it yourself, every run also hands you the script and the shot list, which is the part that actually takes the time.",
  },
  {
    question: "How long are the clips?",
    answer:
      "Six to twenty seconds, which is where the hook has to land and where the feeds stop rewarding you for going longer. Every run also gives you the script and the shot list, so a clip you want to shoot properly is already storyboarded.",
  },
  {
    question: "Where do the topics come from?",
    answer:
      "From what people are actually typing into search. We pull live autocomplete from Google and DuckDuckGo for your field, around 300 real phrases, and rank them by how much demand each one has against how many brands already answer it. Nothing is invented.",
  },
  {
    question: "Which platforms does it post to?",
    answer:
      "Instagram, TikTok, Facebook Pages, LinkedIn and X. You can also connect nothing at all and just download the finished files to publish by hand.",
  },
  {
    question: "Can I approve everything before it goes out?",
    answer:
      "Yes. Turn off auto publish and every cut waits in the queue until you release it. Producing and publishing are separate switches, so it can keep making things daily without anything reaching your audience unseen.",
  },
  {
    question: "Will it sound like me?",
    answer:
      "It writes from what your site says and from the description you can edit at any time: what you sell, who buys it, and what makes you different from the shop next door. Any individual script is yours to rewrite before it renders.",
  },
  {
    question: "Is this not just more AI slop?",
    answer:
      "Slop is what happens when every post is an advert. Three runs in four teach something and never mention you, because a clip nobody finishes is worth nothing. The pitch arrives once, at the end, after the viewer has been given something.",
  },
  {
    question: "How much of my time does this take?",
    answer:
      "One paste, about a minute of corrections, and a minute per social account you connect. After that, none, unless you choose to review cuts before they publish.",
  },
  {
    question: "What if I do not like the topic it picked?",
    answer:
      "Bin it and the next best one takes its place. The whole list is visible, so you can approve or reject topics in bulk long before any of them get written or filmed.",
  },
  {
    question: "What does it cost?",
    answer:
      "It is free while we are in early access, and there is no card at signup. If that changes you will hear about it before you are charged anything.",
  },
  {
    question: "What if I do not have a website?",
    answer:
      "Paste any page that describes what you do, including a shop listing or a booking page. If you have none of those, skip the box and sign up: setup asks the same questions by hand and takes about a minute longer.",
  },
];

export default function Home() {
  return (
    <>
      {/* `data-surface` tells the body which ground it is on, so overscroll at
          either end of this page does not flash the dark app through. */}
      <main data-surface="paper" className="max-w-none bg-paper px-0 pt-0">
        {/* Hero -------------------------------------------------------------
            One claim, one box, and the work fanned out underneath it. There is
            no secondary call to action above the fold: the whole argument of
            the page is that a web address is the only input, so anything
            standing beside that box weakens it. */}
        <HeroStage>
          <div className={`${shell} hero-copy text-center`}>
            {/* One line, set as large as the container allows. The width runs
                past the 680px the rest of the page keeps to: a headline that
                wraps is a sentence, and a headline that does not is a sign. */}
            <div className="hero-headings">
              <h1 className="hero-sweep balance mx-auto max-w-6xl pb-[0.1em] text-5xl font-bold tracking-tighter sm:text-7xl lg:text-[6.75rem] lg:leading-[0.95]">
                Your URL to nightly video
              </h1>

              <p className="hero-subtitle pretty mx-auto mt-6 max-w-[680px] text-lg">
                Paste one address. Vertical video worth finishing, every night,
                without you.
              </p>
            </div>

            <div className="hero-composer-in">
              <UrlComposer showNote={false} />
            </div>
          </div>

          {/* No `.rise` here — the fan runs its own deal-out, and stacking a
              fade on top of it would start the swing from the wrong opacity. */}
          <div className="hero-fan">
            <ReelFan />
          </div>
        </HeroStage>

        <PlatformBand />

        {/* The run --------------------------------------------------------
            Proof before argument. Everything above is a claim about what
            happens overnight, so the next thing on the page is one night
            opened up rather than another paragraph about it. */}
        <section id="work" className="scroll-mt-24">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                One run, in full
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">
                A web address goes in. This comes out.
              </h2>
              <p className="pretty mt-6 max-w-2xl text-lg text-mute">
                A real night&rsquo;s work for a small coffee roaster, exactly as
                it would have gone out. Nothing in the first twenty seconds
                mentions the shop, which is precisely why someone watches to the
                end. The pitch waits until it has earned a look.
              </p>
            </Reveal>

            <Reveal delay={120} className="mt-12">
              <RunPanel />
            </Reveal>
          </div>

          {/* The gallery runs edge to edge, because a row of vertical video
              that stops at the container reads as a widget rather than as a
              queue with more behind it. */}
          <Reveal>
            <p className={`${shell} font-mono text-xs uppercase tracking-[0.2em] text-mute`}>
              Formats it cuts · placeholder frames while the renders land
            </p>
          </Reveal>

          <div className="mt-6 pb-24">
            <ReelRail />
          </div>
        </section>

        {/* Tagline ---------------------------------------------------------
            The one held breath on the page, between the proof and the case. */}
        <section className="border-y border-rule bg-paper-sunk">
          <div className={`${shell} py-24`}>
            <TaglineReveal
              tone="paper"
              className="text-4xl font-semibold tracking-tight sm:text-5xl"
              text="Nobody finishes an advert. They finish the thing that taught them something in nine seconds. So we give four of those away a week, before we ever mention you."
            />
          </div>
        </section>

        {/* How it works --------------------------------------------------- */}
        <section id="run" className="scroll-mt-24 border-t border-rule">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                How it works
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">
                You show up once. It shows up every night.
              </h2>
            </Reveal>

            {/* An ordered list with a rail, because this genuinely is a
                sequence: each step consumes what the one above produced. */}
            <ol className="mt-16 border-l border-rule">
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
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute sm:pt-1">
                    {step.marker}
                  </p>
                  <div>
                    <h3 className="text-lg font-semibold text-graphite">
                      {step.title}
                    </h3>
                    <p className="pretty mt-3 max-w-2xl text-base leading-relaxed text-mute">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefits -------------------------------------------------------- */}
        <section className="border-t border-rule">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                What you get
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">
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
                    className="rounded-2xl border border-rule bg-paper-lift p-8 hover:border-graphite/20"
                  >
                    <Icon
                      weight="duotone"
                      aria-hidden
                      className="size-6 text-ember"
                    />
                    <h3 className="mt-6 text-lg font-semibold text-graphite">
                      {benefit.title}
                    </h3>
                    <p className="pretty mt-3 text-base leading-relaxed text-mute">
                      {benefit.body}
                    </p>
                  </Reveal>
                );
              })}
            </ul>
          </div>
        </section>

        {/* The alternatives ------------------------------------------------ */}
        <section id="compare" className="scroll-mt-24 border-t border-rule">
          <div className={`${shell} py-24`}>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                The alternatives
              </p>
              <h2 className="balance mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">
                What you are doing instead, and what it costs you
              </h2>
            </Reveal>

            <Reveal delay={120} className="mt-12">
              <CompareTable />
            </Reveal>
          </div>
        </section>

        {/* FAQ -------------------------------------------------------------- */}
        <section id="faq" className="scroll-mt-24 border-t border-rule">
          <div className={`${shell} py-24`}>
            <div className="grid gap-12 lg:grid-cols-[20rem_minmax(0,1fr)]">
              {/* Pinned while the answers scroll past. The column is a third
                  of the width and a tenth of the height of what sits beside
                  it, so left in flow it reads as a label that fell off the
                  top of the list. */}
              <Reveal className="lg:sticky lg:top-28 lg:self-start">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                  Questions
                </p>
                <h2 className="balance mt-6 text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">
                  The things people ask before pasting anything
                </h2>
              </Reveal>

              <Reveal delay={120}>
                <Faq entries={faq} tone="paper" />
              </Reveal>
            </div>
          </div>
        </section>

        {/* Final CTA --------------------------------------------------------
            The same door as the top, worded the same way. Somebody who reached
            the bottom has read the argument and needs the box, not a new
            promise. */}
        <section className="border-t border-rule bg-paper-sunk">
          <div className={`${shell} py-24 text-center`}>
            <Reveal>
              <h2 className="heading-paper balance mx-auto max-w-[680px] text-4xl font-bold tracking-tighter sm:text-5xl">
                Paste it tonight.
                <br />
                Forget about it tomorrow.
              </h2>
              <p className="pretty mx-auto mt-6 max-w-[680px] text-lg text-mute">
                One address, one account connected, and the first cut goes out
                at your next scheduled hour.
              </p>

              <div className="mt-10">
                <UrlComposer />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Outside <main>, because it walks main's sections and should not be
          one of the things it walks. */}
      <SectionPager />

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
