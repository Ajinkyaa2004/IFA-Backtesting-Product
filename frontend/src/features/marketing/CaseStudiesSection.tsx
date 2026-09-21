/**
 * "What we've built" - the landing page's portfolio, presented as case studies.
 * Sits between "How it works" and "How we work with you" and keeps the
 * `#portfolio` anchor the nav links to.
 *
 * Each card opens a detail view (challenge, what we built, outcome, stack) in a
 * native <dialog>: focus trap, ESC and backdrop for free, and no framer-motion,
 * which the public landing bundle deliberately avoids. Data lives in
 * caseStudies.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Rocket, X } from "lucide-react";
import { CASE_STUDIES, CATEGORY_LABEL, type CaseStudy, type CaseStudyCategory } from "./caseStudies";
import CaseStudyThumbnail from "./CaseStudyThumbnail";

const INITIAL_COUNT = 6;
type Filter = "all" | CaseStudyCategory;
const CATEGORY_ORDER: CaseStudyCategory[] = ["execution", "arbitrage", "research", "allocation", "systems"];

const sectionLabel = "text-[10.5px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400";

function CaseStudyDialog({ study, onClose }: { study: CaseStudy | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (study && !dialog.open) dialog.showModal();
    if (!study && dialog.open) dialog.close();
  }, [study]);

  // showModal() blocks interaction behind the dialog but not page scroll.
  useEffect(() => {
    if (!study) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [study]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the ::backdrop is dispatched on the dialog element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="case-study-title"
      className="m-auto w-[calc(100%-1.5rem)] max-w-2xl max-h-[88vh] p-0 overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 text-ink-900 dark:text-ink-50 shadow-pop backdrop:bg-ink-900/50 backdrop:backdrop-blur-sm"
    >
      {study && (
        <div className="relative flex flex-col max-h-[88vh]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close case study"
            className="absolute top-3 right-3 z-10 size-8 rounded-full bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-ink-600 dark:text-ink-200 flex items-center justify-center"
          >
            <X size={15} aria-hidden />
          </button>

          <div key={study.slug} className="p-5 sm:p-7 overflow-y-auto min-h-0">
            <div className="flex items-start gap-4 pr-9">
              {/* Shown at its natural 5:2 shape. Stretched across the full dialog width it would be letterboxed. */}
              <div className="hidden sm:block w-48 shrink-0 aspect-[5/2] overflow-hidden rounded-lg border border-ink-200/70 dark:border-ink-800">
                <CaseStudyThumbnail kind={study.kind} />
              </div>
              <div className="min-w-0">
                <div className={sectionLabel}>
                  {CATEGORY_LABEL[study.category]} · {study.client}
                </div>
                <h3 id="case-study-title" className="mt-1.5 text-xl font-semibold tracking-tight">
                  {study.title}
                </h3>
              </div>
            </div>

            <div className="mt-6">
              <div className={sectionLabel}>The challenge</div>
              <p className="mt-1.5 text-sm text-ink-700 dark:text-ink-200 leading-relaxed">{study.challenge}</p>
            </div>

            <div className="mt-6">
              <div className={sectionLabel}>What we built</div>
              <ul className="mt-2 space-y-2">
                {study.built.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200 leading-relaxed">
                    <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <div className={sectionLabel}>{study.outcomeLabel ?? "Outcome"}</div>
              <ul className="mt-2 space-y-2">
                {study.outcomes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200 leading-relaxed">
                    <ArrowRight size={14} className="mt-1 shrink-0 text-accent-600 dark:text-accent-300" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-1.5">
              {study.stack.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300"
                >
                  {t}
                </span>
              ))}
            </div>

            {study.href && (
              <a
                href={study.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent-700 dark:text-accent-300 hover:underline"
              >
                Visit live <ArrowRight size={13} aria-hidden />
              </a>
            )}
          </div>

          <div className="shrink-0 px-5 sm:px-7 py-3.5 border-t border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-950/40 text-xs text-ink-600 dark:text-ink-300">
            Something similar in mind?{" "}
            <Link to="/signup" className="text-accent-700 dark:text-accent-300 hover:underline font-medium">
              Start a signup →
            </Link>
          </div>
        </div>
      )}
    </dialog>
  );
}

export default function CaseStudiesSection() {
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<CaseStudy | null>(null);

  const counts = useMemo(() => {
    const c: Record<CaseStudyCategory, number> = { execution: 0, arbitrage: 0, research: 0, allocation: 0, systems: 0 };
    for (const s of CASE_STUDIES) c[s.category] += 1;
    return c;
  }, []);

  const filtered = filter === "all" ? CASE_STUDIES : CASE_STUDIES.filter((s) => s.category === filter);
  const collapsed = filter === "all" && !showAll && filtered.length > INITIAL_COUNT;
  const visible = collapsed ? filtered.slice(0, INITIAL_COUNT) : filtered;

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
      active
        ? "bg-ink-900 text-white border-ink-900 dark:bg-ink-50 dark:text-ink-900 dark:border-ink-50"
        : "bg-white text-ink-700 border-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:border-ink-700 dark:hover:bg-ink-800"
    }`;

  return (
    <section id="portfolio" className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-accent-500/10 text-accent-700 dark:text-accent-300 ring-1 ring-inset ring-accent-500/20 mb-3">
            <Rocket size={11} aria-hidden /> Portfolio &amp; case studies
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">What we've built for our clients</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Market-making and execution systems, arbitrage platforms, backtesting and research infrastructure, and live
            dashboards. Open any card for the challenge, what we built and the outcome.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-8" role="group" aria-label="Filter case studies">
          <button type="button" className={chip(filter === "all")} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="opacity-60">{CASE_STUDIES.length}</span>
          </button>
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              className={chip(filter === c)}
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
            >
              {CATEGORY_LABEL[c]} <span className="opacity-60">{counts[c]}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((s) => (
            <article
              key={s.slug}
              className="group relative flex flex-col rounded-2xl border border-ink-200/70 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden hover:shadow-pop transition-shadow focus-within:ring-2 focus-within:ring-accent-500/40"
            >
              {/* Same 5:2 shape as the artwork (320x128), so it fills the card edge to edge at any width. */}
              <div className="aspect-[5/2] relative overflow-hidden border-b border-ink-200/70 dark:border-ink-800">
                <CaseStudyThumbnail kind={s.kind} />
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className={sectionLabel}>{CATEGORY_LABEL[s.category]}</div>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">
                  {/* The button's ::after stretches over the whole card, so the card is one click target. */}
                  <button
                    type="button"
                    onClick={() => setOpen(s)}
                    aria-haspopup="dialog"
                    className="text-left focus:outline-none after:absolute after:inset-0"
                  >
                    {s.title}
                  </button>
                </h3>
                <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{s.client}</div>
                <p className="mt-2 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{s.summary}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.stack.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <span
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300 group-hover:underline"
                  aria-hidden
                >
                  Read case study <ArrowRight size={12} />
                </span>
              </div>
            </article>
          ))}
        </div>

        {collapsed && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm font-medium text-ink-800 dark:text-ink-100 hover:bg-ink-50 dark:hover:bg-ink-800"
            >
              Show all {filtered.length} case studies <ArrowRight size={13} aria-hidden />
            </button>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-ink-500 dark:text-ink-400 max-w-2xl mx-auto">
          Client names are withheld. Case studies describe what we built, not trading performance.
        </p>
        <p className="mt-3 text-center text-xs text-ink-500 dark:text-ink-400">
          Have a systematic strategy you want backtested or a bespoke engine in mind?{" "}
          <Link to="/signup" className="text-accent-700 dark:text-accent-300 hover:underline font-medium">
            Start a signup →
          </Link>
        </p>
      </div>

      <CaseStudyDialog study={open} onClose={() => setOpen(null)} />
    </section>
  );
}
