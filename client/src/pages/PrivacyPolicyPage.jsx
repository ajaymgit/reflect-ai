import { Link } from "react-router-dom";

// Real, specific-to-this-app language instead of a generic template --
// naming the actual fields collected, the actual encryption used
// (shared/utils/encryption.js), and the actual conditional AI-provider
// behavior (chat runs against a locally-hosted Ollama model by default;
// only sends content to OpenAI/Gemini if the deployer explicitly
// configures one of those API keys instead). A boilerplate privacy page
// that could describe any app is exactly the kind of "looks unfinished"
// signal worth avoiding here, not just a compliance checkbox to tick.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen page-gradient p-4 md:p-8">
      <div className="max-w-2xl mx-auto ui-card rounded-2xl p-6 md:p-8 space-y-6">
        <div>
          <p className="ui-kicker">Legal</p>
          <h1 className="ui-title mt-1">Privacy Policy</h1>
          <p className="text-sm text-ink/60 mt-2">Last updated August 2026.</p>
        </div>

        <section className="space-y-2">
          <h2 className="font-medium">What's collected</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            An account requires your name and email address. Everything else -- journal entries, mood tags, health
            metrics you log, chat messages -- is content you choose to enter, tied to your account.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">How it's stored</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            Journal content, tags, themes, and health metrics are encrypted at rest with AES-256-GCM before being
            written to the database, using a key that isn't stored alongside the data. Your password is never
            stored in plain text -- only a salted bcrypt hash. Two-factor backup codes and the Apple Health sync
            token are stored as one-way hashes, not the original values.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">AI processing</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            By default, the reflective chat feature runs against a self-hosted language model (Ollama) -- your
            entries and messages never leave the server that's running this app. If whoever is running this
            instance has instead configured an OpenAI or Gemini API key, chat messages you send are sent to that
            provider to generate a response, subject to that provider's own data-handling terms. Ask the person
            operating your instance which mode is active if you're unsure.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Email</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            Your email address is used only for account login, password-reset links, and (if you leave the setting
            on) an optional daily journaling reminder. It is never sold or shared for marketing.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Your control over your data</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            Settings -&gt; Your data lets you export everything -- every journal entry, health reading, retrospect
            analysis, and chat message -- as a single file at any time. There is currently no self-serve account
            deletion; contact whoever operates your instance to request full deletion.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">No ad tracking</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            This app doesn't run analytics scripts, ad pixels, or third-party trackers. There's nothing to opt out
            of because nothing is collected for advertising purposes.
          </p>
        </section>

        <Link to="/login" className="inline-block text-sm text-signal hover:text-signal-soft">
          Back to login
        </Link>
      </div>
    </div>
  );
}
