import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Carouly stores, which third parties it sends data to, and how to delete your account.",
};

export default function PrivacyPage() {
  return (
    <article className="text-base text-dim">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">
        Privacy
      </p>
      <h1 className="balance mt-6 text-3xl font-bold tracking-tight text-bone sm:text-4xl">
        What we store, and who else sees it
      </h1>
      <p className="font-mono text-xs text-dim">Last updated 2 August 2026</p>

      <h2>What we collect</h2>
      <p>
        Your account details come from Clerk, our authentication provider: an
        email address, and whatever your identity provider passes along if you
        sign in with one. We never see or store your password.
      </p>
      <p>
        Everything else is what you type in: your brand profile, your keyword
        bank, your carousels, and the schedule you set. Generated slides are
        stored as images in Supabase Storage.
      </p>

      <h2>Connected social accounts</h2>
      <p>
        When you connect Instagram, LinkedIn, X or a Facebook Page, we store the
        access token that platform issues us, encrypted at rest. It is used for
        one thing: publishing the carousels you scheduled. Disconnecting an
        account deletes the token.
      </p>

      <h2>Third parties</h2>
      <ul>
        <li>Clerk, for authentication.</li>
        <li>Supabase, for the database and image storage.</li>
        <li>
          OpenRouter, for the models that write the slides and generate hook
          images. Your brand profile and the chosen keyword are sent with each
          request.
        </li>
        <li>
          Google Suggest and DuckDuckGo autocomplete, for keyword research.
          These receive search stems derived from your brand profile, and no
          account information.
        </li>
        <li>Vercel, for hosting and request logs.</li>
      </ul>

      <h2>What we do not do</h2>
      <p>
        We do not sell your data, we do not use your brand profile or generated
        content to train models of our own, and we do not read your social
        inboxes. The tokens we hold carry publishing scopes only.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Email us and we will delete your brand, keywords, carousels and stored
        images, and revoke every social token, within 30 days. Request logs held
        by our hosting provider expire on their own retention schedule.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about any of this can go to the address in your account
        settings.
      </p>
    </article>
  );
}
