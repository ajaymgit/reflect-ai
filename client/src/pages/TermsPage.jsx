import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="min-h-screen page-gradient p-4 md:p-8">
      <div className="max-w-2xl mx-auto ui-card rounded-2xl p-6 md:p-8 space-y-6">
        <div>
          <p className="ui-kicker">Legal</p>
          <h1 className="ui-title mt-1">Terms of Service</h1>
          <p className="text-sm text-ink/60 mt-2">Last updated August 2026.</p>
        </div>

        <section className="space-y-2">
          <h2 className="font-medium">What this is</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            Equoria (ReflectAI) is a personal journaling and reflection tool. It is not a medical device, and the
            chat feature is not a substitute for professional mental health care, diagnosis, or treatment. If
            you're in crisis or need immediate support, please contact a local emergency service or crisis line
            rather than relying on this app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Your content</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            You own what you write here. Journal entries, mood data, and chat messages are yours -- see the{" "}
            <Link to="/privacy" className="text-signal hover:text-signal-soft">
              Privacy Policy
            </Link>{" "}
            for how that content is stored and, where applicable, processed by an AI provider to power the chat
            feature.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Account responsibility</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            Keep your password private and enable two-factor authentication (Settings -&gt; Two-factor
            authentication) if you'd like an extra layer of protection. You're responsible for activity under your
            account. "Log out everywhere" (Settings -&gt; Security) revokes every active session immediately if you
            suspect unauthorized access.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">No warranty</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            This app is provided as-is, without warranty of any kind. Reflective insights, mood correlations, and
            AI-generated responses are generated from your own data using statistical and language-model methods --
            they're a prompt for your own reflection, not a clinical assessment, and may be wrong.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Changes</h2>
          <p className="text-sm text-ink/75 leading-relaxed">
            These terms may be updated as the app changes. Continuing to use the app after an update means you
            accept the current version.
          </p>
        </section>

        <Link to="/login" className="inline-block text-sm text-signal hover:text-signal-soft">
          Back to login
        </Link>
      </div>
    </div>
  );
}
