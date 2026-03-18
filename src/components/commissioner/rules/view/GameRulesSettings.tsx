import React from 'react';
import { Settings2 } from 'lucide-react';
import { GameStructureSection } from './game-rules/GameStructureSection';
import { TimingViolationsSection } from './game-rules/TimingViolationsSection';
import { ScoringCourtSection } from './game-rules/ScoringCourtSection';
import { PersonnelSubsSection } from './game-rules/PersonnelSubsSection';
import { FoulsLimitsSection } from './game-rules/FoulsLimitsSection';
import { CoachingStrategySection } from './game-rules/CoachingStrategySection';

interface GameRulesSettingsProps {
    gameFormat: 'timed' | 'target_score';
    setGameFormat: (val: 'timed' | 'target_score') => void;
    gameTargetScore: number;
    setGameTargetScore: (val: number) => void;
    fourPointLine: boolean;
    setFourPointLine: (val: boolean) => void;
    threePointLineEnabled: boolean;
    setThreePointLineEnabled: (val: boolean) => void;
    multiballCount: number;
    setMultiballCount: (val: number) => void;
    foulOutLimit: number;
    setFoulOutLimit: (val: number) => void;
    teamFoulPenalty: number;
    setTeamFoulPenalty: (val: number) => void;
    quarterLength: number;
    setQuarterLength: (val: number) => void;
    numQuarters: number;
    setNumQuarters: (val: number) => void;
    overtimeDuration: number;
    setOvertimeDuration: (val: number) => void;
    overtimeTargetPoints: number;
    setOvertimeTargetPoints: (val: number) => void;
    shootoutRounds: number;
    setShootoutRounds: (val: number) => void;
    overtimeType: string;
    setOvertimeType: (val: string) => void;
    maxTimeouts: number;
    setMaxTimeouts: (val: number) => void;
    coachChallenges: boolean;
    setCoachChallenges: (val: boolean) => void;
    maxCoachChallenges: number;
    setMaxCoachChallenges: (val: number) => void;
    challengeReimbursed: boolean;
    setChallengeReimbursed: (val: boolean) => void;
    shotClockEnabled: boolean;
    setShotClockEnabled: (val: boolean) => void;
    shotClockValue: number;
    setShotClockValue: (val: number) => void;
    backcourtTimerEnabled: boolean;
    setBackcourtTimerEnabled: (val: boolean) => void;
    backcourtTimerValue: number;
    setBackcourtTimerValue: (val: number) => void;
    offensiveThreeSecondEnabled: boolean;
    setOffensiveThreeSecondEnabled: (val: boolean) => void;
    offensiveThreeSecondValue: number;
    setOffensiveThreeSecondValue: (val: number) => void;
    defensiveThreeSecondEnabled: boolean;
    setDefensiveThreeSecondEnabled: (val: boolean) => void;
    defensiveThreeSecondValue: number;
    setDefensiveThreeSecondValue: (val: number) => void;
    inboundTimerEnabled: boolean;
    setInboundTimerEnabled: (val: boolean) => void;
    inboundTimerValue: number;
    setInboundTimerValue: (val: number) => void;
    backToBasketTimerEnabled: boolean;
    setBackToBasketTimerEnabled: (val: boolean) => void;
    backToBasketTimerValue: number;
    setBackToBasketTimerValue: (val: number) => void;
    backcourtViolationEnabled: boolean;
    setBackcourtViolationEnabled: (val: boolean) => void;
    travelingEnabled: boolean;
    setTravelingEnabled: (val: boolean) => void;
    doubleDribbleEnabled: boolean;
    setDoubleDribbleEnabled: (val: boolean) => void;
    goaltendingEnabled: boolean;
    setGoaltendingEnabled: (val: boolean) => void;
    basketInterferenceEnabled: boolean;
    setBasketInterferenceEnabled: (val: boolean) => void;
    kickedBallEnabled: boolean;
    setKickedBallEnabled: (val: boolean) => void;
    flagrantFoulPenaltyEnabled: boolean;
    setFlagrantFoulPenaltyEnabled: (val: boolean) => void;
    clearPathFoulEnabled: boolean;
    setClearPathFoulEnabled: (val: boolean) => void;
    illegalScreenEnabled: boolean;
    setIllegalScreenEnabled: (val: boolean) => void;
    overTheBackFoulEnabled: boolean;
    setOverTheBackFoulEnabled: (val: boolean) => void;
    looseBallFoulEnabled: boolean;
    setLooseBallFoulEnabled: (val: boolean) => void;
    chargingEnabled: boolean;
    setChargingEnabled: (val: boolean) => void;
    overtimeEnabled: boolean;
    setOvertimeEnabled: (val: boolean) => void;
    maxOvertimesEnabled: boolean;
    setMaxOvertimesEnabled: (val: boolean) => void;
    maxOvertimes: number;
    setMaxOvertimes: (val: number) => void;
    overtimeTieBreaker: string;
    setOvertimeTieBreaker: (val: string) => void;
    maxPlayersOnCourt: number;
    setMaxPlayersOnCourt: (val: number) => void;
    substitutionLimitEnabled: boolean;
    setSubstitutionLimitEnabled: (val: boolean) => void;
    maxSubstitutions: number;
    setMaxSubstitutions: (val: number) => void;
    noDribbleRule: boolean;
    setNoDribbleRule: (val: boolean) => void;
    multiballEnabled: boolean;
    setMultiballEnabled: (val: boolean) => void;
    threePointLineDistance: number;
    setThreePointLineDistance: (val: number) => void;
    fourPointLineDistance: number;
    setFourPointLineDistance: (val: number) => void;
    dunkValue: number;
    setDunkValue: (val: number) => void;
    midrangeValue: number;
    setMidrangeValue: (val: number) => void;
    heaveRuleEnabled: boolean;
    setHeaveRuleEnabled: (val: boolean) => void;
    halfCourtShotValue: number;
    setHalfCourtShotValue: (val: number) => void;
    clutchTimeoutLimit: number;
    setClutchTimeoutLimit: (val: number) => void;
    handcheckingEnabled: boolean;
    setHandcheckingEnabled: (val: boolean) => void;
    illegalZoneDefenseEnabled: boolean;
    setIllegalZoneDefenseEnabled: (val: boolean) => void;
    // New Rules
    outOfBoundsEnabled: boolean;
    setOutOfBoundsEnabled: (val: boolean) => void;
    freeThrowDistance: number;
    setFreeThrowDistance: (val: number) => void;
    rimHeight: number;
    setRimHeight: (val: number) => void;
    ballWeight: number;
    setBallWeight: (val: number) => void;
    startOfPossessionMethod: 'jump_ball' | 'coin_toss' | 'rock_paper_scissors';
    setStartOfPossessionMethod: (val: 'jump_ball' | 'coin_toss' | 'rock_paper_scissors') => void;
    possessionPattern: 'nba' | 'alternating';
    setPossessionPattern: (val: 'nba' | 'alternating') => void;
    courtLength: number;
    setCourtLength: (val: number) => void;
    baselineLength: number;
    setBaselineLength: (val: number) => void;
    keyWidth: number;
    setKeyWidth: (val: number) => void;
    cornerThrowInEnabled: boolean;
    setCornerThrowInEnabled: (val: boolean) => void;
    techEjectionLimit: number;
    setTechEjectionLimit: (val: number) => void;
    flagrant1EjectionLimit: number;
    setFlagrant1EjectionLimit: (val: number) => void;
    flagrant2EjectionLimit: number;
    setFlagrant2EjectionLimit: (val: number) => void;
    fightingInstantEjection: boolean;
    setFightingInstantEjection: (val: boolean) => void;
    useYellowRedCards: boolean;
    setUseYellowRedCards: (val: boolean) => void;
    shotClockResetOffensiveRebound: number;
    setShotClockResetOffensiveRebound: (val: number) => void;
}

export const GameRulesSettings: React.FC<GameRulesSettingsProps> = (props) => {
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
                        gameFormat={props.gameFormat}
                        setGameFormat={props.setGameFormat}
                        gameTargetScore={props.gameTargetScore}
                        setGameTargetScore={props.setGameTargetScore}
                        quarterLength={props.quarterLength}
                        setQuarterLength={props.setQuarterLength}
                        numQuarters={props.numQuarters}
                        setNumQuarters={props.setNumQuarters}
                        overtimeEnabled={props.overtimeEnabled}
                        setOvertimeEnabled={props.setOvertimeEnabled}
                        overtimeType={props.overtimeType}
                        setOvertimeType={props.setOvertimeType}
                        overtimeDuration={props.overtimeDuration}
                        setOvertimeDuration={props.setOvertimeDuration}
                        maxOvertimesEnabled={props.maxOvertimesEnabled}
                        setMaxOvertimesEnabled={props.setMaxOvertimesEnabled}
                        maxOvertimes={props.maxOvertimes}
                        setMaxOvertimes={props.setMaxOvertimes}
                        overtimeTieBreaker={props.overtimeTieBreaker}
                        setOvertimeTieBreaker={props.setOvertimeTieBreaker}
                        overtimeTargetPoints={props.overtimeTargetPoints}
                        setOvertimeTargetPoints={props.setOvertimeTargetPoints}
                        shootoutRounds={props.shootoutRounds}
                        setShootoutRounds={props.setShootoutRounds}
                        startOfPossessionMethod={props.startOfPossessionMethod}
                        setStartOfPossessionMethod={props.setStartOfPossessionMethod}
                        possessionPattern={props.possessionPattern}
                        setPossessionPattern={props.setPossessionPattern}
                    />
                    <TimingViolationsSection 
                        shotClockEnabled={props.shotClockEnabled}
                        setShotClockEnabled={props.setShotClockEnabled}
                        shotClockValue={props.shotClockValue}
                        setShotClockValue={props.setShotClockValue}
                        backcourtTimerEnabled={props.backcourtTimerEnabled}
                        setBackcourtTimerEnabled={props.setBackcourtTimerEnabled}
                        backcourtTimerValue={props.backcourtTimerValue}
                        setBackcourtTimerValue={props.setBackcourtTimerValue}
                        offensiveThreeSecondEnabled={props.offensiveThreeSecondEnabled}
                        setOffensiveThreeSecondEnabled={props.setOffensiveThreeSecondEnabled}
                        offensiveThreeSecondValue={props.offensiveThreeSecondValue}
                        setOffensiveThreeSecondValue={props.setOffensiveThreeSecondValue}
                        defensiveThreeSecondEnabled={props.defensiveThreeSecondEnabled}
                        setDefensiveThreeSecondEnabled={props.setDefensiveThreeSecondEnabled}
                        defensiveThreeSecondValue={props.defensiveThreeSecondValue}
                        setDefensiveThreeSecondValue={props.setDefensiveThreeSecondValue}
                        inboundTimerEnabled={props.inboundTimerEnabled}
                        setInboundTimerEnabled={props.setInboundTimerEnabled}
                        inboundTimerValue={props.inboundTimerValue}
                        setInboundTimerValue={props.setInboundTimerValue}
                        backToBasketTimerEnabled={props.backToBasketTimerEnabled}
                        setBackToBasketTimerEnabled={props.setBackToBasketTimerEnabled}
                        backToBasketTimerValue={props.backToBasketTimerValue}
                        setBackToBasketTimerValue={props.setBackToBasketTimerValue}
                        illegalZoneDefenseEnabled={props.illegalZoneDefenseEnabled}
                        setIllegalZoneDefenseEnabled={props.setIllegalZoneDefenseEnabled}
                        shotClockResetOffensiveRebound={props.shotClockResetOffensiveRebound}
                        setShotClockResetOffensiveRebound={props.setShotClockResetOffensiveRebound}
                    />
                </div>

                <div className="space-y-6">
                    <ScoringCourtSection 
                        threePointLineEnabled={props.threePointLineEnabled}
                        setThreePointLineEnabled={props.setThreePointLineEnabled}
                        threePointLineDistance={props.threePointLineDistance}
                        setThreePointLineDistance={props.setThreePointLineDistance}
                        fourPointLine={props.fourPointLine}
                        setFourPointLine={props.setFourPointLine}
                        fourPointLineDistance={props.fourPointLineDistance}
                        setFourPointLineDistance={props.setFourPointLineDistance}
                        dunkValue={props.dunkValue}
                        setDunkValue={props.setDunkValue}
                        midrangeValue={props.midrangeValue}
                        setMidrangeValue={props.setMidrangeValue}
                        heaveRuleEnabled={props.heaveRuleEnabled}
                        setHeaveRuleEnabled={props.setHeaveRuleEnabled}
                        halfCourtShotValue={props.halfCourtShotValue}
                        setHalfCourtShotValue={props.setHalfCourtShotValue}
                        backcourtViolationEnabled={props.backcourtViolationEnabled}
                        setBackcourtViolationEnabled={props.setBackcourtViolationEnabled}
                        travelingEnabled={props.travelingEnabled}
                        setTravelingEnabled={props.setTravelingEnabled}
                        doubleDribbleEnabled={props.doubleDribbleEnabled}
                        setDoubleDribbleEnabled={props.setDoubleDribbleEnabled}
                        goaltendingEnabled={props.goaltendingEnabled}
                        setGoaltendingEnabled={props.setGoaltendingEnabled}
                        basketInterferenceEnabled={props.basketInterferenceEnabled}
                        setBasketInterferenceEnabled={props.setBasketInterferenceEnabled}
                        kickedBallEnabled={props.kickedBallEnabled}
                        setKickedBallEnabled={props.setKickedBallEnabled}
                        outOfBoundsEnabled={props.outOfBoundsEnabled}
                        setOutOfBoundsEnabled={props.setOutOfBoundsEnabled}
                        freeThrowDistance={props.freeThrowDistance}
                        setFreeThrowDistance={props.setFreeThrowDistance}
                        rimHeight={props.rimHeight}
                        setRimHeight={props.setRimHeight}
                        ballWeight={props.ballWeight}
                        setBallWeight={props.setBallWeight}
                        courtLength={props.courtLength}
                        setCourtLength={props.setCourtLength}
                        baselineLength={props.baselineLength}
                        setBaselineLength={props.setBaselineLength}
                        keyWidth={props.keyWidth}
                        setKeyWidth={props.setKeyWidth}
                        cornerThrowInEnabled={props.cornerThrowInEnabled}
                        setCornerThrowInEnabled={props.setCornerThrowInEnabled}
                    />
                    <PersonnelSubsSection 
                        maxPlayersOnCourt={props.maxPlayersOnCourt}
                        setMaxPlayersOnCourt={props.setMaxPlayersOnCourt}
                        substitutionLimitEnabled={props.substitutionLimitEnabled}
                        setSubstitutionLimitEnabled={props.setSubstitutionLimitEnabled}
                        maxSubstitutions={props.maxSubstitutions}
                        setMaxSubstitutions={props.setMaxSubstitutions}
                        noDribbleRule={props.noDribbleRule}
                        setNoDribbleRule={props.setNoDribbleRule}
                        multiballEnabled={props.multiballEnabled}
                        setMultiballEnabled={props.setMultiballEnabled}
                        multiballCount={props.multiballCount}
                        setMultiballCount={props.setMultiballCount}
                    />
                    <FoulsLimitsSection 
                        foulOutLimit={props.foulOutLimit}
                        setFoulOutLimit={props.setFoulOutLimit}
                        teamFoulPenalty={props.teamFoulPenalty}
                        setTeamFoulPenalty={props.setTeamFoulPenalty}
                        flagrantFoulPenaltyEnabled={props.flagrantFoulPenaltyEnabled}
                        setFlagrantFoulPenaltyEnabled={props.setFlagrantFoulPenaltyEnabled}
                        clearPathFoulEnabled={props.clearPathFoulEnabled}
                        setClearPathFoulEnabled={props.setClearPathFoulEnabled}
                        illegalScreenEnabled={props.illegalScreenEnabled}
                        setIllegalScreenEnabled={props.setIllegalScreenEnabled}
                        overTheBackFoulEnabled={props.overTheBackFoulEnabled}
                        setOverTheBackFoulEnabled={props.setOverTheBackFoulEnabled}
                        looseBallFoulEnabled={props.looseBallFoulEnabled}
                        setLooseBallFoulEnabled={props.setLooseBallFoulEnabled}
                        chargingEnabled={props.chargingEnabled}
                        setChargingEnabled={props.setChargingEnabled}
                        handcheckingEnabled={props.handcheckingEnabled}
                        setHandcheckingEnabled={props.setHandcheckingEnabled}
                        techEjectionLimit={props.techEjectionLimit}
                        setTechEjectionLimit={props.setTechEjectionLimit}
                        flagrant1EjectionLimit={props.flagrant1EjectionLimit}
                        setFlagrant1EjectionLimit={props.setFlagrant1EjectionLimit}
                        flagrant2EjectionLimit={props.flagrant2EjectionLimit}
                        setFlagrant2EjectionLimit={props.setFlagrant2EjectionLimit}
                        fightingInstantEjection={props.fightingInstantEjection}
                        setFightingInstantEjection={props.setFightingInstantEjection}
                        useYellowRedCards={props.useYellowRedCards}
                        setUseYellowRedCards={props.setUseYellowRedCards}
                    />
                    <CoachingStrategySection 
                        maxTimeouts={props.maxTimeouts}
                        setMaxTimeouts={props.setMaxTimeouts}
                        clutchTimeoutLimit={props.clutchTimeoutLimit}
                        setClutchTimeoutLimit={props.setClutchTimeoutLimit}
                        coachChallenges={props.coachChallenges}
                        setCoachChallenges={props.setCoachChallenges}
                        maxCoachChallenges={props.maxCoachChallenges}
                        setMaxCoachChallenges={props.setMaxCoachChallenges}
                        challengeReimbursed={props.challengeReimbursed}
                        setChallengeReimbursed={props.setChallengeReimbursed}
                    />
                </div>
            </div>
        </div>
    );
};

