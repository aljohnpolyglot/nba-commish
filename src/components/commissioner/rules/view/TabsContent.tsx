import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FormatTab } from './FormatTab';
import { DraftTab } from './DraftTab';
import { AllStarTab } from './AllStarTab';
import { GameRulesSettings } from './GameRulesSettings';
import { LeagueHonorsSection } from '../LeagueHonorsSection';
import { AwardModal } from '../../AwardModal';
import { EconomyTab } from './EconomyTab';

interface TabsContentProps {
    activeTab: string;
    rulesState: any;
}

export const TabsContent: React.FC<TabsContentProps> = ({ activeTab, rulesState }) => {
    const updatePlayoffFormat = (index: number, value: string) => {
        const newFormat = [...rulesState.playoffFormat];
        if (value === '') {
            newFormat[index] = '';
        } else {
            newFormat[index] = parseInt(value, 10);
        }
        rulesState.setPlayoffFormat(newFormat);
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
            >
                {activeTab === 'Format' && (
                    <FormatTab 
                        playIn={rulesState.playIn}
                        setPlayIn={rulesState.setPlayIn}
                        inSeasonTournament={rulesState.inSeasonTournament}
                        setInSeasonTournament={rulesState.setInSeasonTournament}
                        playoffFormat={rulesState.playoffFormat}
                        updatePlayoffFormat={updatePlayoffFormat}
                        minGamesRequirement={rulesState.minGamesRequirement}
                        setMinGamesRequirement={rulesState.setMinGamesRequirement}
                        customScheduleEnabled={rulesState.customScheduleEnabled}
                        setCustomScheduleEnabled={rulesState.setCustomScheduleEnabled}
                        gamesPerSeason={rulesState.gamesPerSeason}
                        setGamesPerSeason={rulesState.setGamesPerSeason}
                        divisionGames={rulesState.divisionGames}
                        setDivisionGames={rulesState.setDivisionGames}
                        conferenceGames={rulesState.conferenceGames}
                        setConferenceGames={rulesState.setConferenceGames}
                    />
                )}

                {activeTab === 'Draft' && (
                    <DraftTab
                        draftType={rulesState.draftType}
                        setDraftType={rulesState.setDraftType}
                        eligibilityRule={rulesState.eligibilityRule}
                        setEligibilityRule={rulesState.setEligibilityRule}
                    />
                )}

                {activeTab === 'Honors' && (
                    <div className="space-y-6">
                        <LeagueHonorsSection 
                            localAwards={rulesState.localAwards}
                            expandedAward={rulesState.expandedAward}
                            setExpandedAward={rulesState.setExpandedAward}
                            handleRemoveAward={rulesState.handleRemoveAward}
                            setAwardModalOpen={rulesState.setAwardModalOpen}
                            allNbaTeams={rulesState.allNbaTeams}
                            setAllNbaTeams={rulesState.setAllNbaTeams}
                            allNbaPlayersPerTeam={rulesState.allNbaPlayersPerTeam}
                            setAllNbaPlayersPerTeam={rulesState.setAllNbaPlayersPerTeam}
                            allDefenseTeams={rulesState.allDefenseTeams}
                            setAllDefenseTeams={rulesState.setAllDefenseTeams}
                            allDefensePlayersPerTeam={rulesState.allDefensePlayersPerTeam}
                            setAllDefensePlayersPerTeam={rulesState.setAllDefensePlayersPerTeam}
                            allRookieTeams={rulesState.allRookieTeams}
                            setAllRookieTeams={rulesState.setAllRookieTeams}
                            allRookiePlayersPerTeam={rulesState.allRookiePlayersPerTeam}
                            setAllRookiePlayersPerTeam={rulesState.setAllRookiePlayersPerTeam}
                            positionlessAwards={rulesState.positionlessAwards}
                            setPositionlessAwards={rulesState.setPositionlessAwards}
                        />
                        {rulesState.awardModalOpen && (
                            <AwardModal 
                                onClose={() => rulesState.setAwardModalOpen(false)}
                                onAdd={rulesState.handleAddAward}
                                isGenerating={rulesState.isGeneratingAward}
                            />
                        )}
                    </div>
                )}

                {activeTab === 'All-Star' && (
                    <AllStarTab rules={rulesState.rules} setRule={rulesState.setRule} />
                )}

                {activeTab === 'Game Rules' && (
                    <div className="space-y-8">
                        <GameRulesSettings rules={rulesState.rules} setRule={rulesState.setRule} />
                    </div>
                )}

                {activeTab === 'Economy' && (
                    <EconomyTab 
                        draftType={rulesState.draftType}
                        salaryCap={rulesState.salaryCap}
                        setSalaryCap={rulesState.setSalaryCap}
                        salaryCapEnabled={rulesState.salaryCapEnabled}
                        setSalaryCapEnabled={rulesState.setSalaryCapEnabled}
                        salaryCapType={rulesState.salaryCapType}
                        setSalaryCapType={rulesState.setSalaryCapType}
                        minimumPayrollEnabled={rulesState.minimumPayrollEnabled}
                        setMinimumPayrollEnabled={rulesState.setMinimumPayrollEnabled}
                        minimumPayrollPercentage={rulesState.minimumPayrollPercentage}
                        setMinimumPayrollPercentage={rulesState.setMinimumPayrollPercentage}
                        luxuryTaxEnabled={rulesState.luxuryTaxEnabled}
                        setLuxuryTaxEnabled={rulesState.setLuxuryTaxEnabled}
                        luxuryTaxThresholdPercentage={rulesState.luxuryTaxThresholdPercentage}
                        setLuxuryTaxThresholdPercentage={rulesState.setLuxuryTaxThresholdPercentage}
                        apronsEnabled={rulesState.apronsEnabled}
                        setApronsEnabled={rulesState.setApronsEnabled}
                        numberOfAprons={rulesState.numberOfAprons}
                        setNumberOfAprons={rulesState.setNumberOfAprons}
                        firstApronPercentage={rulesState.firstApronPercentage}
                        setFirstApronPercentage={rulesState.setFirstApronPercentage}
                        secondApronPercentage={rulesState.secondApronPercentage}
                        setSecondApronPercentage={rulesState.setSecondApronPercentage}
                        tradeMatchingRatioUnder={rulesState.tradeMatchingRatioUnder}
                        setTradeMatchingRatioUnder={rulesState.setTradeMatchingRatioUnder}
                        tradeMatchingRatioOver1st={rulesState.tradeMatchingRatioOver1st}
                        setTradeMatchingRatioOver1st={rulesState.setTradeMatchingRatioOver1st}
                        tradeMatchingRatioOver2nd={rulesState.tradeMatchingRatioOver2nd}
                        setTradeMatchingRatioOver2nd={rulesState.setTradeMatchingRatioOver2nd}
                        restrictCashSendOver2ndApron={rulesState.restrictCashSendOver2ndApron}
                        setRestrictCashSendOver2ndApron={rulesState.setRestrictCashSendOver2ndApron}
                        restrictAggregationOver2ndApron={rulesState.restrictAggregationOver2ndApron}
                        setRestrictAggregationOver2ndApron={rulesState.setRestrictAggregationOver2ndApron}
                        restrictSignAndTradeAcquisitionOver1stApron={rulesState.restrictSignAndTradeAcquisitionOver1stApron}
                        setRestrictSignAndTradeAcquisitionOver1stApron={rulesState.setRestrictSignAndTradeAcquisitionOver1stApron}
                        freezePickAt2ndApron={rulesState.freezePickAt2ndApron}
                        setFreezePickAt2ndApron={rulesState.setFreezePickAt2ndApron}
                        restrictTPEProvenanceOver2ndApron={rulesState.restrictTPEProvenanceOver2ndApron}
                        setRestrictTPEProvenanceOver2ndApron={rulesState.setRestrictTPEProvenanceOver2ndApron}
                        postSigningMoratoriumEnabled={rulesState.postSigningMoratoriumEnabled}
                        setPostSigningMoratoriumEnabled={rulesState.setPostSigningMoratoriumEnabled}
                        twoWayContractsEnabled={rulesState.twoWayContractsEnabled}
                        setTwoWayContractsEnabled={rulesState.setTwoWayContractsEnabled}
                        nonGuaranteedContractsEnabled={rulesState.nonGuaranteedContractsEnabled ?? true}
                        setNonGuaranteedContractsEnabled={rulesState.setNonGuaranteedContractsEnabled}
                        minPlayersPerTeam={rulesState.minPlayersPerTeam}
                        setMinPlayersPerTeam={rulesState.setMinPlayersPerTeam}
                        maxPlayersPerTeam={rulesState.maxPlayersPerTeam}
                        setMaxPlayersPerTeam={rulesState.setMaxPlayersPerTeam}
                        maxStandardPlayersPerTeam={rulesState.maxStandardPlayersPerTeam}
                        setMaxStandardPlayersPerTeam={rulesState.setMaxStandardPlayersPerTeam}
                        maxTwoWayPlayersPerTeam={rulesState.maxTwoWayPlayersPerTeam}
                        setMaxTwoWayPlayersPerTeam={rulesState.setMaxTwoWayPlayersPerTeam}
                        maxTrainingCampRoster={rulesState.maxTrainingCampRoster}
                        setMaxTrainingCampRoster={rulesState.setMaxTrainingCampRoster}
                        minContractType={rulesState.minContractType}
                        setMinContractType={rulesState.setMinContractType}
                        minContractStaticAmount={rulesState.minContractStaticAmount}
                        setMinContractStaticAmount={rulesState.setMinContractStaticAmount}
                        maxContractType={rulesState.maxContractType}
                        setMaxContractType={rulesState.setMaxContractType}
                        maxContractStaticPercentage={rulesState.maxContractStaticPercentage}
                        setMaxContractStaticPercentage={rulesState.setMaxContractStaticPercentage}
                        supermaxEnabled={rulesState.supermaxEnabled}
                        setSupermaxEnabled={rulesState.setSupermaxEnabled}
                        supermaxPercentage={rulesState.supermaxPercentage}
                        setSupermaxPercentage={rulesState.setSupermaxPercentage}
                        supermaxMinYears={rulesState.supermaxMinYears}
                        setSupermaxMinYears={rulesState.setSupermaxMinYears}
                        rookieExtEnabled={rulesState.rookieExtEnabled}
                        setRookieExtEnabled={rulesState.setRookieExtEnabled}
                        rookieExtPct={rulesState.rookieExtPct}
                        setRookieExtPct={rulesState.setRookieExtPct}
                        rookieExtRosePct={rulesState.rookieExtRosePct}
                        setRookieExtRosePct={rulesState.setRookieExtRosePct}
                        birdRightsEnabled={rulesState.birdRightsEnabled}
                        setBirdRightsEnabled={rulesState.setBirdRightsEnabled}
                        minContractLength={rulesState.minContractLength}
                        setMinContractLength={rulesState.setMinContractLength}
                        maxContractLengthStandard={rulesState.maxContractLengthStandard}
                        setMaxContractLengthStandard={rulesState.setMaxContractLengthStandard}
                        maxContractLengthBird={rulesState.maxContractLengthBird}
                        setMaxContractLengthBird={rulesState.setMaxContractLengthBird}
                        playerOptionsEnabled={rulesState.playerOptionsEnabled}
                        setPlayerOptionsEnabled={rulesState.setPlayerOptionsEnabled}
                        tenDayContractsEnabled={rulesState.tenDayContractsEnabled}
                        setTenDayContractsEnabled={rulesState.setTenDayContractsEnabled}
                        rookieScaleType={rulesState.rookieScaleType}
                        setRookieScaleType={rulesState.setRookieScaleType}
                        rookieStaticAmount={rulesState.rookieStaticAmount}
                        setRookieStaticAmount={rulesState.setRookieStaticAmount}
                        rookieMaxContractPercentage={rulesState.rookieMaxContractPercentage}
                        setRookieMaxContractPercentage={rulesState.setRookieMaxContractPercentage}
                        rookieScaleAppliesTo={rulesState.rookieScaleAppliesTo}
                        setRookieScaleAppliesTo={rulesState.setRookieScaleAppliesTo}
                        rookieContractLength={rulesState.rookieContractLength}
                        setRookieContractLength={rulesState.setRookieContractLength}
                        rookieTeamOptionsEnabled={rulesState.rookieTeamOptionsEnabled}
                        setRookieTeamOptionsEnabled={rulesState.setRookieTeamOptionsEnabled}
                        rookieTeamOptionYears={rulesState.rookieTeamOptionYears}
                        setRookieTeamOptionYears={rulesState.setRookieTeamOptionYears}
                        rookieRestrictedFreeAgentEligibility={rulesState.rookieRestrictedFreeAgentEligibility}
                        setRookieRestrictedFreeAgentEligibility={rulesState.setRookieRestrictedFreeAgentEligibility}
                        rookieContractCapException={rulesState.rookieContractCapException}
                        setRookieContractCapException={rulesState.setRookieContractCapException}
                        r2ContractsNonGuaranteed={rulesState.r2ContractsNonGuaranteed}
                        setR2ContractsNonGuaranteed={rulesState.setR2ContractsNonGuaranteed}
                        inflationEnabled={rulesState.inflationEnabled}
                        setInflationEnabled={rulesState.setInflationEnabled}
                        inflationMin={rulesState.inflationMin}
                        setInflationMin={rulesState.setInflationMin}
                        inflationMax={rulesState.inflationMax}
                        setInflationMax={rulesState.setInflationMax}
                        inflationAverage={rulesState.inflationAverage}
                        setInflationAverage={rulesState.setInflationAverage}
                        inflationStdDev={rulesState.inflationStdDev}
                        setInflationStdDev={rulesState.setInflationStdDev}
                        tradableDraftPickSeasons={rulesState.tradableDraftPickSeasons}
                        setTradableDraftPickSeasons={rulesState.setTradableDraftPickSeasons}
                        stepienRuleEnabled={rulesState.stepienRuleEnabled}
                        setStepienRuleEnabled={rulesState.setStepienRuleEnabled}
                        tradeExceptionsEnabled={rulesState.tradeExceptionsEnabled}
                        setTradeExceptionsEnabled={rulesState.setTradeExceptionsEnabled}
                        disabledPlayerExceptionEnabled={rulesState.disabledPlayerExceptionEnabled}
                        setDisabledPlayerExceptionEnabled={rulesState.setDisabledPlayerExceptionEnabled}
                        rfaMatchingEnabled={rulesState.rfaMatchingEnabled}
                        setRfaMatchingEnabled={rulesState.setRfaMatchingEnabled}
                        rfaMatchWindowDays={rulesState.rfaMatchWindowDays}
                        setRfaMatchWindowDays={rulesState.setRfaMatchWindowDays}
                        rfaAutoDeclineOver2ndApron={rulesState.rfaAutoDeclineOver2ndApron}
                        setRfaAutoDeclineOver2ndApron={rulesState.setRfaAutoDeclineOver2ndApron}
                        deadMoneyEnabled={rulesState.deadMoneyEnabled}
                        setDeadMoneyEnabled={rulesState.setDeadMoneyEnabled}
                        ngGuaranteeDeadlineMonth={rulesState.ngGuaranteeDeadlineMonth}
                        setNgGuaranteeDeadlineMonth={rulesState.setNgGuaranteeDeadlineMonth}
                        ngGuaranteeDeadlineDay={rulesState.ngGuaranteeDeadlineDay}
                        setNgGuaranteeDeadlineDay={rulesState.setNgGuaranteeDeadlineDay}
                        stretchProvisionEnabled={rulesState.stretchProvisionEnabled}
                        setStretchProvisionEnabled={rulesState.setStretchProvisionEnabled}
                        stretchProvisionMultiplier={rulesState.stretchProvisionMultiplier}
                        setStretchProvisionMultiplier={rulesState.setStretchProvisionMultiplier}
                        stretchedDeadMoneyCapPct={rulesState.stretchedDeadMoneyCapPct}
                        setStretchedDeadMoneyCapPct={rulesState.setStretchedDeadMoneyCapPct}
                        mleEnabled={rulesState.mleEnabled}
                        setMleEnabled={rulesState.setMleEnabled}
                        roomMleAmount={rulesState.roomMleAmount}
                        setRoomMleAmount={rulesState.setRoomMleAmount}
                        nonTaxpayerMleAmount={rulesState.nonTaxpayerMleAmount}
                        setNonTaxpayerMleAmount={rulesState.setNonTaxpayerMleAmount}
                        taxpayerMleAmount={rulesState.taxpayerMleAmount}
                        setTaxpayerMleAmount={rulesState.setTaxpayerMleAmount}
                        biannualEnabled={rulesState.biannualEnabled}
                        setBiannualEnabled={rulesState.setBiannualEnabled}
                        biannualAmount={rulesState.biannualAmount}
                        setBiannualAmount={rulesState.setBiannualAmount}
                        roomMlePercentage={rulesState.roomMlePercentage}
                        setRoomMlePercentage={rulesState.setRoomMlePercentage}
                        nonTaxpayerMlePercentage={rulesState.nonTaxpayerMlePercentage}
                        setNonTaxpayerMlePercentage={rulesState.setNonTaxpayerMlePercentage}
                        taxpayerMlePercentage={rulesState.taxpayerMlePercentage}
                        setTaxpayerMlePercentage={rulesState.setTaxpayerMlePercentage}
                        biannualPercentage={rulesState.biannualPercentage}
                        setBiannualPercentage={rulesState.setBiannualPercentage}
                        tradeDeadlineMonth={rulesState.tradeDeadlineMonth}
                        setTradeDeadlineMonth={rulesState.setTradeDeadlineMonth}
                        tradeDeadlineOrdinal={rulesState.tradeDeadlineOrdinal}
                        setTradeDeadlineOrdinal={rulesState.setTradeDeadlineOrdinal}
                        tradeDeadlineDayOfWeek={rulesState.tradeDeadlineDayOfWeek}
                        setTradeDeadlineDayOfWeek={rulesState.setTradeDeadlineDayOfWeek}
                        faStartMonth={rulesState.faStartMonth}
                        setFaStartMonth={rulesState.setFaStartMonth}
                        faStartDay={rulesState.faStartDay}
                        setFaStartDay={rulesState.setFaStartDay}
                        faMoratoriumDays={rulesState.faMoratoriumDays}
                        setFaMoratoriumDays={rulesState.setFaMoratoriumDays}
                        regularSeasonFAEnabled={rulesState.regularSeasonFAEnabled}
                        setRegularSeasonFAEnabled={rulesState.setRegularSeasonFAEnabled}
                        postDeadlineMultiYearContracts={rulesState.postDeadlineMultiYearContracts}
                        setPostDeadlineMultiYearContracts={rulesState.setPostDeadlineMultiYearContracts}
                    />
                )}
            </motion.div>
        </AnimatePresence>
    );
};
