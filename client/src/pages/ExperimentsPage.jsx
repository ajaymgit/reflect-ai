import { useEffect, useState } from "react";
import { RefreshCcw, ShieldCheck, TestTube2 } from "lucide-react";
import { apiFetch } from "../api";

const statusTone = {
  supported: "border-[#8fae73]/60 bg-[#8fae73]/20 text-[#d9f5bc]",
  testing: "border-[#e8ab5f]/50 bg-[#e8ab5f]/15 text-[#ffe1b5]",
  detected: "border-[#e8ab5f]/50 bg-[#e8ab5f]/15 text-[#ffe1b5]",
  weakened: "border-orange-300/50 bg-orange-400/15 text-orange-100",
  contradicted: "border-red-300/50 bg-red-400/15 text-red-100",
  retired: "border-white/20 bg-white/10 text-white/70",
};

export default function ExperimentsPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function load(refresh = false) {
    setLoading(true);
    setStatus(refresh ? "Refreshing experiments..." : "");
    try {
      const data = await apiFetch(refresh ? "/api/hypotheses/refresh" : "/api/hypotheses/summary", {
        method: refresh ? "POST" : "GET",
      });
      setSummary(data);
      setStatus(refresh ? "Experiments updated" : "");
    } catch (error) {
      setStatus(error?.message || "Could not load experiments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  const hypotheses = summary?.hypotheses || [];

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <section className="glass rounded-3xl p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Experiment-validated evidence</p>
              <h2 className="text-3xl font-semibold mt-2">Personal Reflection Experiments</h2>
              <p className="text-sm text-white/70 mt-2 max-w-3xl">
                Equoria turns repeated journal signals into testable hypotheses. Strong chatbot claims stay locked until a pattern is supported by future entries.
              </p>
            </div>
            <button
              type="button"
              onClick={() => load(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 bg-[#8fae73] hover:bg-[#9fbe83] text-slate-900 font-medium"
            >
              <RefreshCcw size={16} />
              Refresh validation
            </button>
          </div>
          {status && <p className="text-xs text-white/60 mt-3">{status}</p>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat label="Total hypotheses" value={summary?.total ?? "--"} />
          <Stat label="Supported" value={summary?.supported ?? "--"} />
          <Stat label="Testing" value={summary?.testing ?? "--"} />
          <Stat label="Weakened/contradicted" value={summary?.contradicted ?? "--"} />
        </section>

        <section className="grid gap-4">
          {loading && <div className="glass rounded-2xl p-5 text-sm text-white/70">Loading experiments...</div>}
          {!loading && hypotheses.length === 0 && (
            <div className="glass rounded-2xl p-5 text-sm text-white/75">
              Write a few entries that mention recurring situations like meetings, sleep, movement, focus, or relationships. The experiment engine will create hypotheses once a signal repeats.
            </div>
          )}
          {hypotheses.map((hypothesis) => (
            <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} />
          ))}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-white/60">{label}</p>
      <p className="text-3xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function HypothesisCard({ hypothesis }) {
  const percent = Math.round((hypothesis.confidence || 0) * 100);
  const tone = statusTone[hypothesis.status] || statusTone.testing;
  const timeline = hypothesis.confidenceTimeline || [];
  const evidence = hypothesis.evidence || [];

  return (
    <article className="glass rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs capitalize ${tone}`}>
              <TestTube2 size={13} />
              {hypothesis.status}
            </span>
            {hypothesis.claimLock?.strongClaimsAllowed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#8fae73]/50 bg-[#8fae73]/15 px-3 py-1 text-xs text-[#d9f5bc]">
                <ShieldCheck size={13} />
                Strong claims unlocked
              </span>
            ) : (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/65">
                Strong claims locked
              </span>
            )}
          </div>
          <h3 className="text-xl font-semibold mt-3">{hypothesis.hypothesisText}</h3>
          <p className="text-sm text-white/65 mt-2">{hypothesis.claimLock?.reason}</p>
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 min-w-36">
          <p className="text-xs text-white/60">Confidence</p>
          <p className="text-3xl font-semibold">{percent}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <MiniStat label="Supports" value={hypothesis.supportCount} />
        <MiniStat label="Contradicts / weakens" value={hypothesis.contradictionCount} />
        <MiniStat label="Neutral" value={hypothesis.neutralCount} />
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-xs text-[#d9d2b0] uppercase tracking-wider">Recent evidence</p>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto scroll-area">
            {evidence.length === 0 && <p className="text-sm text-white/60">No evidence evaluated yet.</p>}
            {evidence.slice().reverse().map((item, index) => (
              <div key={`${item.journalId}-${index}`} className="rounded-lg bg-[#111827]/70 border border-white/10 p-2">
                <p className="text-[11px] text-white/55">
                  {item.date ? new Date(item.date).toDateString() : "Journal"} · {item.verdict}
                </p>
                <p className="text-xs text-white/80 mt-1">{item.quote}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-xs text-[#d9d2b0] uppercase tracking-wider">Confidence timeline</p>
          <div className="mt-3 flex items-end gap-1 h-24">
            {timeline.length === 0 && <p className="text-sm text-white/60">Timeline builds as entries are evaluated.</p>}
            {timeline.map((point, index) => (
              <div
                key={index}
                className="flex-1 rounded-t bg-[#8fae73]/70 min-w-2"
                style={{ height: `${Math.max(8, Math.round((point.confidence || 0) * 90))}%` }}
                title={`${Math.round((point.confidence || 0) * 100)}%`}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-xs text-white/60">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value ?? 0}</p>
    </div>
  );
}
