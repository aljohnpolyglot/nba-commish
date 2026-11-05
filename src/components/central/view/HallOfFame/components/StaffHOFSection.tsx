import { Award, Hourglass, Trophy } from 'lucide-react';
import type { StaffRetirementRecord } from '../../../../../services/staff/staffRetirement';
import { getHOFCeremonyDateString } from '../../../../../services/playerDevelopment/hofChecker';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { displayStaffRole } from '../../../../../services/staff/staffCareerRows';

type Props = {
  records: StaffRetirementRecord[];
  currentDate: string;
};

const achievementCount = (record: StaffRetirementRecord, pattern: RegExp) =>
  (record.coachAchievements ?? []).filter(row => pattern.test(`${row.type} ${row.label}`)).length;

export function StaffHOFSection({ records, currentDate }: Props) {
  if (records.length === 0) return null;
  const sorted = [...records].sort((left, right) =>
    Number(right.hallOfFameEligibleYear ?? 0) - Number(left.hallOfFameEligibleYear ?? 0)
    || right.hallOfFameScore - left.hallOfFameScore
    || left.name.localeCompare(right.name)
  );

  return (
    <section className="mb-16 rounded-2xl border border-regal-gold/20 bg-gradient-to-br from-regal-gold/5 to-transparent p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Award className="text-regal-gold" size={22} />
        <div>
          <h2 className="font-display text-xl font-bold text-regal-paper">Coaches &amp; Staff</h2>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Outstanding coaching careers across this league</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(record => {
          const classYear = record.hallOfFameEligibleYear ?? record.season + 5;
          const inducted = currentDate >= getHOFCeremonyDateString(classYear);
          const championships = achievementCount(record, /champion/i);
          const coachAwards = achievementCount(record, /coach of the year|best coach|\bcoy\b/i);
          return (
            <article key={record.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="flex items-center gap-3">
                <PlayerPortrait imgUrl={record.portraitUrl} playerName={record.name} face={record.face} disableNameFallback size={54} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-regal-paper">{record.name}</div>
                  <div className="truncate text-xs text-zinc-500">{displayStaffRole(record.role)} · {record.teamName}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Class of</div>
                  <div className="text-sm font-black text-regal-gold">{classYear}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                  inducted ? 'bg-regal-gold/15 text-regal-gold' : 'bg-sky-500/15 text-sky-300'
                }`}>
                  {inducted ? <Award size={11} /> : <Hourglass size={11} />}
                  {inducted ? 'Inducted' : 'Awaiting Induction'}
                </span>
                {championships > 0 && <span className="inline-flex items-center gap-1 rounded bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-300"><Trophy size={10} /> {championships}× Champion</span>}
                {coachAwards > 0 && <span className="rounded bg-amber-400/10 px-2 py-1 text-[9px] font-black text-amber-300">{coachAwards}× Coach Award</span>}
                <span className="rounded bg-zinc-900 px-2 py-1 text-[9px] font-black text-zinc-400">{record.experienceLabel}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
