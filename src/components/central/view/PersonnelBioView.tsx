import React, { useState, useEffect } from 'react';
import { Personnel } from './LeagueOfficeSearcher';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { CoachPersonnelProfile } from './CoachPersonnelProfile';

const REF_WORKER   = 'https://curly-credit-f292.mogatas-princealjohn-05082003.workers.dev/';
const COACH_WORKER = 'https://fragrant-bar-f766.mogatas-princealjohn-05082003.workers.dev/';

interface RefData {
  name: string;
  number: string;
  imgSrc: string;
  bioHtml: string;
  careerRows: { label: string; value: string }[];
  funFactRows: { label: string; value: string }[];
}

interface CoachData {
  imgSrc: string;
  bioHtml: string;
  staffNames: string[];
}

type BioData =
  | { kind: 'ref';   data: RefData }
  | { kind: 'coach'; data: CoachData };

async function fetchRefBio(slug: string): Promise<RefData> {
  const resp = await fetch(`${REF_WORKER}?ref=${slug}`);
  if (!resp.ok) throw new Error(`Worker responded ${resp.status}`);
  const html = await resp.text();
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const name   = doc.querySelector('h1')?.textContent?.trim() ?? '';
  const number = doc.querySelector('.ref-number')?.textContent?.trim() ?? '';
  let imgSrc = doc.querySelector('.photo')?.getAttribute('src') ?? '';
  if (imgSrc.startsWith('/')) imgSrc = `https://www.nbra.net${imgSrc}`;
  const bioHtml = doc.querySelector('.description')?.innerHTML ?? '';
  const tables = doc.querySelectorAll('table.stats');
  const careerRows = parseTableRows(tables[0]);
  const funFactRows = parseTableRows(tables[1]);

  return { name, number, imgSrc, bioHtml, careerRows, funFactRows };
}

async function fetchCoachBio(slug: string): Promise<CoachData> {
  const resp = await fetch(`${COACH_WORKER}?slug=${slug}`);
  if (!resp.ok) throw new Error(`Worker responded ${resp.status}`);
  const html = await resp.text();
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  let imgSrc = '';
  const firstCol = doc.querySelector('.fusion-builder-column-0');
  if (firstCol) {
    const inner = firstCol.querySelector('.fusion-column-inner-bg-image') as HTMLElement | null;
    if (inner?.style?.backgroundImage) {
      const match = inner.style.backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
      if (match) imgSrc = match[2];
    }
  }
  let bioHtml = doc.querySelector('.fusion-text-1')?.innerHTML ?? '';
  bioHtml = bioHtml.replace(/\*Inclusive of Full-Time and Interim Head Coaches/gi, '').trim();
  const staffNames: string[] = [];
  const staffSection = doc.querySelector('.fusion-text-2');
  if (staffSection) {
    Array.from(staffSection.querySelectorAll('p, a')).forEach(el => {
      const text = el.textContent?.trim();
      if (text && !text.toUpperCase().includes('COACHES') && text.length > 1) {
        staffNames.push(text);
      }
    });
  }

  return { imgSrc, bioHtml, staffNames };
}

function parseTableRows(table: Element | undefined): { label: string; value: string }[] {
  if (!table) return [];
  return Array.from(table.querySelectorAll('tr')).reduce<{ label: string; value: string }[]>((acc, row) => {
    const label = row.querySelector('th')?.textContent?.trim();
    const value = row.querySelector('td')?.textContent?.trim();
    if (label && value) acc.push({ label, value });
    return acc;
  }, []);
}

function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function plainTextToHtml(text: string): string {
  const escape = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return text
    .split(/\n{2,}/)
    .map(paragraph => `<p>${escape(paragraph.trim())}</p>`)
    .join('');
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

function parseRefParagraphs(bioHtml: string): string[] {
  const div = document.createElement('div');
  div.innerHTML = bioHtml;
  const pEls = Array.from(div.querySelectorAll('p'));
  if (pEls.length > 1) {
    return pEls.map(p => p.textContent?.trim() || '').filter(Boolean);
  }
  const text = (div.textContent || '').replace(/\s+/g, ' ').trim();
  const sentences = splitSentences(text);
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const s of sentences) {
    current.push(s);
    if (/^(A standout|He was also|has done charitable|went on to play|In April)/i.test(s)) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs.filter(Boolean);
}

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-slate-800/60 rounded-xl animate-pulse ${className}`} />
);

interface PersonnelBioViewProps {
  person: Personnel;
  onBack: () => void;
}

export const PersonnelBioView: React.FC<PersonnelBioViewProps> = ({ person, onBack }) => {
  const [bioData, setBioData] = useState<BioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBioData(null);

    const run = async () => {
      try {
        if (person.type === 'referee' && person.bioText) {
          const careerRows = [
            person.debutYear ? { label: 'League debut', value: String(person.debutYear) } : null,
            person.nationality ? { label: 'Nationality', value: person.nationality } : null,
          ].filter((row): row is { label: string; value: string } => !!row);
          const data: RefData = {
            name: person.name,
            number: person.number ?? '',
            imgSrc: person.playerPortraitUrl ?? '',
            bioHtml: plainTextToHtml(person.bioText),
            careerRows,
            funFactRows: [],
          };
          if (!cancelled) setBioData({ kind: 'ref', data });
        } else if (person.type === 'referee' && person.slug) {
          const data = await fetchRefBio(person.slug);
          if (!cancelled) setBioData({ kind: 'ref', data });
        } else if (person.type === 'coach' && person.slug) {
          const data = await fetchCoachBio(person.slug);
          if (!cancelled) setBioData({ kind: 'coach', data });
        }
      } catch (e: any) {
        if (!cancelled && person.type === 'referee') {
          const careerRows = [
            person.debutYear ? { label: 'League debut', value: String(person.debutYear) } : null,
            person.careerEndYear ? { label: 'Career end', value: String(person.careerEndYear) } : null,
            person.nationality ? { label: 'Nationality', value: person.nationality } : null,
          ].filter((row): row is { label: string; value: string } => !!row);
          setBioData({
            kind: 'ref',
            data: {
              name: person.name,
              number: person.number ?? '',
              imgSrc: person.playerPortraitUrl ?? '',
              bioHtml: person.bioText ? plainTextToHtml(person.bioText) : '',
              careerRows,
              funFactRows: [],
            },
          });
        } else if (!cancelled && person.type !== 'coach') {
          setError(e?.message ?? 'Profile unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [person]);

  const portrait = (() => {
    if (bioData?.kind === 'ref')   return bioData.data.imgSrc   || person.playerPortraitUrl || '';
    if (bioData?.kind === 'coach') return bioData.data.imgSrc   || person.playerPortraitUrl || '';
    return person.playerPortraitUrl || '';
  })();

  if (person.type === 'coach') {
    const coachBiography = bioData?.kind === 'coach'
      ? htmlToPlainText(bioData.data.bioHtml)
      : person.bioText;
    return (
      <CoachPersonnelProfile
        mode="bio"
        person={person}
        onBack={onBack}
        portraitUrl={portrait}
        biography={coachBiography}
        loading={loading}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-slate-900"
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-4 bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
            {portrait ? (
              <img src={portrait} alt={person.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 font-black">
                {person.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-black text-white leading-none">{person.name}</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
              {person.jobTitle}
              {person.number ? ` · #${person.number}` : ''}
              {person.team   ? ` · ${person.team}`   : ''}
            </p>
          </div>
        </div>
        {loading && (
          <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <Loader2 size={13} className="animate-spin text-indigo-400" />
            LOADING…
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* Loading skeleton */}
        {loading && (
          <div className="p-6 space-y-6">
            <div className="flex gap-6">
              <Skeleton className="w-48 h-60 flex-shrink-0" />
              <div className="flex-1 space-y-3 pt-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full mt-4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="p-12 text-center">
            <p className="text-rose-400 font-bold text-sm uppercase tracking-widest">Intel Unavailable</p>
            <p className="text-slate-600 text-xs mt-2">{error}</p>
          </div>
        )}

        {/* ── REFEREE BIO ──────────────────────────────────── */}
        {!loading && !error && bioData?.kind === 'ref' && (() => {
          const { data } = bioData;
          return (
            <div className="p-6 space-y-8">
              {/* Hero row */}
              <div className="flex flex-col md:flex-row gap-8">
                {/* Photo */}
                {data.imgSrc && (
                  <div className="flex-shrink-0">
                    <img
                      src={data.imgSrc}
                      alt={data.name}
                      className="w-48 rounded-2xl border border-slate-700 shadow-xl object-cover"
                      referrerPolicy="no-referrer"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                    {data.number && (
                      <div className="mt-3 text-center">
                        <span className="bg-indigo-600 text-white text-sm font-black px-4 py-1 rounded-full">
                          Official #{data.number.replace(/[^0-9]/g, '')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Career stats table */}
                {data.careerRows.length > 0 && (
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">
                      Career Stats
                    </p>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden">
                      {data.careerRows.map((row, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between px-5 py-3 ${
                            i !== data.careerRows.length - 1 ? 'border-b border-slate-800/60' : ''
                          }`}
                        >
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{row.label}</span>
                          <span className="text-sm font-bold text-white">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bio */}
              {data.bioHtml && (() => {
                const paras = parseRefParagraphs(data.bioHtml);
                return (
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Biography</p>
                    <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 space-y-4">
                      {paras.map((para, i) => (
                        <p key={i} className="text-slate-300 text-sm leading-relaxed">{para}</p>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Source biography details */}
              {data.funFactRows.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">
                    Career Details
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {data.funFactRows.map((row, i) => (
                      <div key={i} className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{row.label}</p>
                        <p className="text-sm font-bold text-white">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {!loading && !error && (person.type === 'gm' || person.type === 'league_office') && (
          <div className="space-y-6 p-4 sm:p-6">
            <div className="flex flex-col gap-6 sm:flex-row">
              {portrait && (
                <img
                  src={portrait}
                  alt={person.name}
                  className="h-auto w-40 self-center rounded-2xl border border-slate-700 object-cover object-top shadow-xl sm:self-start"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="min-w-0 flex-1 space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Current Appointment</p>
                  <p className="mt-2 text-lg font-bold text-white">{person.jobTitle || 'Executive'}</p>
                  {person.team && <p className="mt-1 text-sm text-slate-400">{person.team}</p>}
                </div>
                {(person.profileDetails?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {person.profileDetails!.map(detail => (
                      <div key={`${detail.label}-${detail.value}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{detail.label}</p>
                        <p className="mt-1 text-sm font-bold text-white">{detail.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {person.bioText && (
              <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-indigo-400">Biography</p>
                <p className="text-sm leading-relaxed text-slate-300">{person.bioText}</p>
              </section>
            )}
            {person.careerHistory && (
              <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-indigo-400">Career History</p>
                <div className="space-y-2">
                  {person.careerHistory.split(/\n+/).filter(Boolean).map((row, index) => (
                    <p key={`${row}-${index}`} className="text-sm leading-relaxed text-slate-300">{row}</p>
                  ))}
                </div>
              </section>
            )}
            {(person.honors?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-amber-300">Honors</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {person.honors!.map((honor, index) => (
                    <div
                      key={`${honor}-${index}`}
                      className="rounded-xl border border-amber-400/15 bg-slate-950/45 px-4 py-3 text-sm font-bold text-slate-100"
                    >
                      {honor}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!person.bioText && !person.careerHistory && (person.profileDetails?.length ?? 0) === 0 && (person.honors?.length ?? 0) === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                No saved biography is available for this executive.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
        <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">League Official Personnel Record</span>
        <span className="text-[9px] font-mono text-slate-700 uppercase">{person.type.toUpperCase()} · {person.id.slice(0, 10)}</span>
      </div>
    </motion.div>
  );
};
