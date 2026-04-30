import React from 'react';
import { Settings2 } from 'lucide-react';
import type { LeagueStats } from '../../../../types';
import { ruleValue } from './rulesDefaults';
import { GameStructureSection } from './game-rules/GameStructureSection';
import { TimingViolationsSection } from './game-rules/TimingViolationsSection';
import { ScoringCourtSection } from './game-rules/ScoringCourtSection';
import { PersonnelSubsSection } from './game-rules/PersonnelSubsSection';
import { FoulsLimitsSection } from './game-rules/FoulsLimitsSection';
import { CoachingStrategySection } from './game-rules/CoachingStrategySection';

interface GameRulesSettingsProps {
    rules: LeagueStats;
    setRule: <K extends keyof LeagueStats>(key: K, value: LeagueStats[K]) => void;
}

/** Bind a leaf-component flat-prop pair (`x`, `setX`) from a single LeagueStats key.
 *  Eliminates the 162-line props pyramid this file used to declare. */
function bind<K extends keyof LeagueStats>(
    rules: LeagueStats,
    setRule: <Kk extends keyof LeagueStats>(k: Kk, v: LeagueStats[Kk]) => void,
    key: K,
) {
    return {
        value: ruleValue(rules, key),
        set: (v: LeagueStats[K]) => setRule(key, v),
    };
}

export const GameRulesSettings: React.FC<GameRulesSettingsProps> = ({ rules, setRule }) => {
    // Pull the per-section flat props from rules/setRule via the typed `bind` helper.
    // Sub-section components keep their existing flat-prop API; the binding lives here
    // instead of being threaded through 162 lines of prop interfaces.
    const b = <K extends keyof LeagueStats>(key: K) => bind(rules, setRule, key);

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
                    <Settings2 size={20} />
                </div>
                <h4 className="text-xl font-black text-white uppercase tracking-tight">League Game Laws</h4>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <GameStructureSection
                        gameFormat={b('gameFormat').value as any}                  setGameFormat={b('gameFormat').set as any}
                        gameTargetScore={b('gameTargetScore').value as number}     setGameTargetScore={b('gameTargetScore').set as any}
                        quarterLength={b('quarterLength').value as number}         setQuarterLength={b('quarterLength').set as any}
                        numQuarters={b('numQuarters').value as number}             setNumQuarters={b('numQuarters').set as any}
                        overtimeEnabled={b('overtimeEnabled').value as boolean}    setOvertimeEnabled={b('overtimeEnabled').set as any}
                        overtimeType={b('overtimeType').value as string}           setOvertimeType={b('overtimeType').set as any}
                        overtimeDuration={b('overtimeDuration').value as number}   setOvertimeDuration={b('overtimeDuration').set as any}
                        maxOvertimesEnabled={b('maxOvertimesEnabled').value as boolean} setMaxOvertimesEnabled={b('maxOvertimesEnabled').set as any}
                        maxOvertimes={b('maxOvertimes').value as number}           setMaxOvertimes={b('maxOvertimes').set as any}
                        overtimeTieBreaker={b('overtimeTieBreaker').value as string} setOvertimeTieBreaker={b('overtimeTieBreaker').set as any}
                        overtimeTargetPoints={b('overtimeTargetPoints').value as number} setOvertimeTargetPoints={b('overtimeTargetPoints').set as any}
                        shootoutRounds={b('shootoutRounds').value as number}       setShootoutRounds={b('shootoutRounds').set as any}
                        startOfPossessionMethod={b('startOfPossessionMethod').value as any} setStartOfPossessionMethod={b('startOfPossessionMethod').set as any}
                        possessionPattern={b('possessionPattern').value as any}    setPossessionPattern={b('possessionPattern').set as any}
                    />
                    <TimingViolationsSection
                        shotClockEnabled={b('shotClockEnabled').value as boolean}              setShotClockEnabled={b('shotClockEnabled').set as any}
                        shotClockValue={b('shotClockValue').value as number}                    setShotClockValue={b('shotClockValue').set as any}
                        backcourtTimerEnabled={b('backcourtTimerEnabled').value as boolean}    setBackcourtTimerEnabled={b('backcourtTimerEnabled').set as any}
                        backcourtTimerValue={b('backcourtTimerValue').value as number}          setBackcourtTimerValue={b('backcourtTimerValue').set as any}
                        offensiveThreeSecondEnabled={b('offensiveThreeSecondEnabled').value as boolean} setOffensiveThreeSecondEnabled={b('offensiveThreeSecondEnabled').set as any}
                        offensiveThreeSecondValue={b('offensiveThreeSecondValue').value as number}      setOffensiveThreeSecondValue={b('offensiveThreeSecondValue').set as any}
                        defensiveThreeSecondEnabled={b('defensiveThreeSecondEnabled').value as boolean} setDefensiveThreeSecondEnabled={b('defensiveThreeSecondEnabled').set as any}
                        defensiveThreeSecondValue={b('defensiveThreeSecondValue').value as number}      setDefensiveThreeSecondValue={b('defensiveThreeSecondValue').set as any}
                        inboundTimerEnabled={b('inboundTimerEnabled').value as boolean}        setInboundTimerEnabled={b('inboundTimerEnabled').set as any}
                        inboundTimerValue={b('inboundTimerValue').value as number}              setInboundTimerValue={b('inboundTimerValue').set as any}
                        backToBasketTimerEnabled={b('backToBasketTimerEnabled').value as boolean} setBackToBasketTimerEnabled={b('backToBasketTimerEnabled').set as any}
                        backToBasketTimerValue={b('backToBasketTimerValue').value as number}    setBackToBasketTimerValue={b('backToBasketTimerValue').set as any}
                        illegalZoneDefenseEnabled={b('illegalZoneDefenseEnabled').value as boolean} setIllegalZoneDefenseEnabled={b('illegalZoneDefenseEnabled').set as any}
                        shotClockResetOffensiveRebound={b('shotClockResetOffensiveRebound').value as number} setShotClockResetOffensiveRebound={b('shotClockResetOffensiveRebound').set as any}
                    />
                </div>

                <div className="space-y-6">
                    <ScoringCourtSection
                        threePointLineEnabled={b('threePointLineEnabled').value as boolean}    setThreePointLineEnabled={b('threePointLineEnabled').set as any}
                        threePointLineDistance={b('threePointLineDistance').value as number}   setThreePointLineDistance={b('threePointLineDistance').set as any}
                        fourPointLine={b('fourPointLine').value as boolean}                    setFourPointLine={b('fourPointLine').set as any}
                        fourPointLineDistance={b('fourPointLineDistance').value as number}     setFourPointLineDistance={b('fourPointLineDistance').set as any}
                        dunkValue={b('dunkValue').value as number}                              setDunkValue={b('dunkValue').set as any}
                        midrangeValue={b('midrangeValue').value as number}                      setMidrangeValue={b('midrangeValue').set as any}
                        heaveRuleEnabled={b('heaveRuleEnabled').value as boolean}              setHeaveRuleEnabled={b('heaveRuleEnabled').set as any}
                        halfCourtShotValue={b('halfCourtShotValue').value as number}            setHalfCourtShotValue={b('halfCourtShotValue').set as any}
                        backcourtViolationEnabled={b('backcourtViolationEnabled').value as boolean} setBackcourtViolationEnabled={b('backcourtViolationEnabled').set as any}
                        travelingEnabled={b('travelingEnabled').value as boolean}              setTravelingEnabled={b('travelingEnabled').set as any}
                        doubleDribbleEnabled={b('doubleDribbleEnabled').value as boolean}      setDoubleDribbleEnabled={b('doubleDribbleEnabled').set as any}
                        goaltendingEnabled={b('goaltendingEnabled').value as boolean}          setGoaltendingEnabled={b('goaltendingEnabled').set as any}
                        basketInterferenceEnabled={b('basketInterferenceEnabled').value as boolean} setBasketInterferenceEnabled={b('basketInterferenceEnabled').set as any}
                        kickedBallEnabled={b('kickedBallEnabled').value as boolean}            setKickedBallEnabled={b('kickedBallEnabled').set as any}
                        outOfBoundsEnabled={b('outOfBoundsEnabled').value as boolean}          setOutOfBoundsEnabled={b('outOfBoundsEnabled').set as any}
                        freeThrowDistance={b('freeThrowDistance').value as number}              setFreeThrowDistance={b('freeThrowDistance').set as any}
                        rimHeight={b('rimHeight').value as number}                              setRimHeight={b('rimHeight').set as any}
                        ballWeight={b('ballWeight').value as number}                            setBallWeight={b('ballWeight').set as any}
                        courtLength={b('courtLength').value as number}                          setCourtLength={b('courtLength').set as any}
                        baselineLength={b('baselineLength').value as number}                    setBaselineLength={b('baselineLength').set as any}
                        keyWidth={b('keyWidth').value as number}                                setKeyWidth={b('keyWidth').set as any}
                        cornerThrowInEnabled={b('cornerThrowInEnabled').value as boolean}      setCornerThrowInEnabled={b('cornerThrowInEnabled').set as any}
                    />
                    <PersonnelSubsSection
                        maxPlayersOnCourt={b('maxPlayersOnCourt').value as number}              setMaxPlayersOnCourt={b('maxPlayersOnCourt').set as any}
                        substitutionLimitEnabled={b('substitutionLimitEnabled').value as boolean} setSubstitutionLimitEnabled={b('substitutionLimitEnabled').set as any}
                        maxSubstitutions={b('maxSubstitutions').value as number}                setMaxSubstitutions={b('maxSubstitutions').set as any}
                        noDribbleRule={b('noDribbleRule').value as boolean}                    setNoDribbleRule={b('noDribbleRule').set as any}
                        multiballEnabled={b('multiballEnabled').value as boolean}              setMultiballEnabled={b('multiballEnabled').set as any}
                        multiballCount={b('multiballCount').value as number}                    setMultiballCount={b('multiballCount').set as any}
                    />
                    <FoulsLimitsSection
                        foulOutLimit={b('foulOutLimit').value as number}                        setFoulOutLimit={b('foulOutLimit').set as any}
                        teamFoulPenalty={b('teamFoulPenalty').value as number}                  setTeamFoulPenalty={b('teamFoulPenalty').set as any}
                        flagrantFoulPenaltyEnabled={b('flagrantFoulPenaltyEnabled').value as boolean} setFlagrantFoulPenaltyEnabled={b('flagrantFoulPenaltyEnabled').set as any}
                        clearPathFoulEnabled={b('clearPathFoulEnabled').value as boolean}      setClearPathFoulEnabled={b('clearPathFoulEnabled').set as any}
                        illegalScreenEnabled={b('illegalScreenEnabled').value as boolean}      setIllegalScreenEnabled={b('illegalScreenEnabled').set as any}
                        overTheBackFoulEnabled={b('overTheBackFoulEnabled').value as boolean}  setOverTheBackFoulEnabled={b('overTheBackFoulEnabled').set as any}
                        looseBallFoulEnabled={b('looseBallFoulEnabled').value as boolean}      setLooseBallFoulEnabled={b('looseBallFoulEnabled').set as any}
                        chargingEnabled={b('chargingEnabled').value as boolean}                setChargingEnabled={b('chargingEnabled').set as any}
                        handcheckingEnabled={b('handcheckingEnabled').value as boolean}        setHandcheckingEnabled={b('handcheckingEnabled').set as any}
                        techEjectionLimit={b('techEjectionLimit').value as number}              setTechEjectionLimit={b('techEjectionLimit').set as any}
                        flagrant1EjectionLimit={b('flagrant1EjectionLimit').value as number}    setFlagrant1EjectionLimit={b('flagrant1EjectionLimit').set as any}
                        flagrant2EjectionLimit={b('flagrant2EjectionLimit').value as number}    setFlagrant2EjectionLimit={b('flagrant2EjectionLimit').set as any}
                        fightingInstantEjection={b('fightingInstantEjection').value as boolean} setFightingInstantEjection={b('fightingInstantEjection').set as any}
                        useYellowRedCards={b('useYellowRedCards').value as boolean}            setUseYellowRedCards={b('useYellowRedCards').set as any}
                    />
                    <CoachingStrategySection
                        maxTimeouts={b('maxTimeouts').value as number}                          setMaxTimeouts={b('maxTimeouts').set as any}
                        clutchTimeoutLimit={b('clutchTimeoutLimit').value as number}            setClutchTimeoutLimit={b('clutchTimeoutLimit').set as any}
                        coachChallenges={b('coachChallenges').value as boolean}                setCoachChallenges={b('coachChallenges').set as any}
                        maxCoachChallenges={b('maxCoachChallenges').value as number}            setMaxCoachChallenges={b('maxCoachChallenges').set as any}
                        challengeReimbursed={b('challengeReimbursed').value as boolean}        setChallengeReimbursed={b('challengeReimbursed').set as any}
                    />
                </div>
            </div>
        </div>
    );
};
