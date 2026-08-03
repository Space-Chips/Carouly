import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms you agree to when using Carouly, including who owns the generated content.",
};

export default function TermsPage() {
  return (
    <article className="text-base text-dim">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">
        Terms
      </p>
      <h1 className="balance mt-6 text-3xl font-bold tracking-tight text-bone sm:text-4xl">
        The deal, in plain terms
      </h1>
      <p className="font-mono text-xs text-dim">Last updated 2 August 2026</p>

      <h2>What the service does</h2>
      <p>
        Carouly writes, designs and publishes social carousels on
        your behalf, using the brand profile and schedule you provide. You stay
        responsible for what goes out under your name.
      </p>

      <h2>Your content</h2>
      <p>
        You own your brand profile and the carousels generated for you, and you
        are free to export and use them anywhere. You grant us only the licence
        needed to store them, render them and publish them to the accounts you
        connected.
      </p>

      <h2>Review and accuracy</h2>
      <p>
        The slides are written by a language model. It can be wrong. If accuracy
        matters in your field, turn off auto publish and read each carousel
        before it goes out. We are not liable for claims made in content you
        published.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use the service to publish content that is unlawful, deceptive,
        or that breaks the terms of the platform it is posted to. Do not connect
        accounts you are not authorised to post from. We may suspend an account
        that does either.
      </p>

      <h2>Platform rules</h2>
      <p>
        Instagram, LinkedIn, X and Facebook each set their own terms and rate
        limits, and can change or revoke API access at any time. A publishing
        failure caused by a platform is not something we can guarantee against.
      </p>

      <h2>Price and cancellation</h2>
      <p>
        The service is free during early access. If that changes you will be
        told before you are charged anything. You can stop using it and delete
        your account at any point, and no notice period applies.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If we make a material change, the date at the top of this page changes
        and we tell you by email before it takes effect.
      </p>
    </article>
  );
}
