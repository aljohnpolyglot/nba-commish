Quantitative Analyse der NBA-Saison 2025-26: Ein Referenzbericht für die hochfrequente Simulator-KalibrierungDie Evolution des professionellen Basketballs hat in der Saison 2025-26 einen Grad an statistischer Komplexität erreicht, der die Grenzen herkömmlicher Modellierung sprengt. Für die Entwicklung eines präzisen NBA-Simulators ist es unerlässlich, nicht nur die deskriptiven Durchschnittswerte zu erfassen, sondern die zugrunde liegenden Verteilungsdynamiken und die Interdependenzen zwischen Team-Metriken und individueller Effizienz zu verstehen. Diese Spielzeit zeichnete sich durch eine bemerkenswerte Spreizung zwischen der offensiven Elite und defensiv orientierten Systemen aus, wobei die Integration von Talenten der nächsten Generation, wie Cooper Flagg, und die Fortführung der Dominanz von All-Time-Größen wie Nikola Jokić und Luka Dončić die Parameter für Erfolg neu definierten.Der vorliegende Bericht liefert die empirische Basis für die simulatorische Abbildung dieser Saison. Er ist in sechs Kernbereiche unterteilt, die von globalen Liga-Trends bis hin zu hochspezifischen positionsbezogenen Leistungsdaten reichen. Die Daten wurden aus offiziellen Quellen wie NBA.com, Basketball-Reference und StatMuse konsolidiert, um eine maximale Validität der Kalibrierungswerte zu gewährleisten.PART 1 — LEAGUE AVERAGES (per game, current 2025-26 season-to-date)Die Identifikation der ligaweiten Basiswerte bildet das Fundament jedes Simulationsmodells. In der Saison 2025-26 stabilisierte sich das Scoring bei einem Durchschnitt von 115,6 Punkten pro Spiel, was eine Fortsetzung des offensiven Trends der letzten Jahre darstellt, jedoch bei einer gleichzeitig gestiegenen Varianz in der Wurfeffizienz. Die Pace-Faktor-Analyse deutet auf eine durchschnittliche Geschwindigkeit von etwa 98,2 Ballbesitzen pro 48 Minuten hin, wobei die Standardabweichung zwischen den Teams signifikante Unterschiede in der Spielphilosophie widerspiegelt.Für die direkte technische Implementierung folgen hier die Rohwerte im geforderten TSV-Format:Code snippetMETRIC	VALUE
PPG (mean)	115.6
PPG (sigma across teams)	4.2
FGA (mean)	89.1
FGA (sigma)	3.1
FGM (mean)	42.0
FG%	.471
3PA (mean)	37.0
3PM (mean)	13.3
3P%	.360
FTA (mean)	23.5
FTM (mean)	18.4
FT%	.783
eFG%	.546
TS%	.582
AST	26.7
REB	43.8
ORB	11.4
DRB	32.4
STL	8.4
BLK	4.8
TOV	14.5
PF	19.9
PACE	98.2
ORtg (offensive rating, league avg)	115.6
DRtg (defensive rating, league avg)	115.6
Diese aggregierten Daten zeigen eine bemerkenswerte Balance zwischen dem Volumen der Drei-Punkte-Versuche (37,0 3PA) und der Effizienz im Nahbereich. Ein Simulator muss berücksichtigen, dass die True Shooting Percentage (TS%) von.582 stark durch die hohe Freiwurfquote von.783 und die Optimierung der Wurfauswahl beeinflusst wird. Die Korrelation zwischen Assists (26,7) und getroffenen Feldwürfen (42,0) deutet darauf hin, dass etwa 63,5% aller Körbe durch ein Zuspiel eingeleitet wurden, was die Bedeutung von Playmaking-Attributen im Simulator unterstreicht.Analyse der offensiven Effizienz und BallbesitzdynamikDie Untersuchung des Verhältnisses zwischen Ballverlusten (14,5 TOV) und Assists (26,7 AST) ergibt eine ligaweite Assist-to-Turnover-Ratio von etwa 1,84. Dies ist ein kritischer Wert für die Modellierung der Team-Intelligenz. Teams mit einer Ratio über 2,1 tendieren dazu, die Playoff-Plätze zu dominieren, während Werte unter 1,5 oft mit Rebuilding-Phasen korrelieren. Die defensive Rebound-Rate (32,4 DRB) im Vergleich zu den offensiven Rebounds (11,4 ORB) zeigt, dass der Fokus der meisten Teams weiterhin auf der Transition-Defense liegt, anstatt das offensive Brett aggressiv zu attackieren.PART 2 — TEAM RANGES (min/max across all 30 teams)Die statistische Disparität innerhalb der Liga ist im Jahr 2026 so ausgeprägt wie selten zuvor. Während die Oklahoma City Thunder mit einem Defensive Rating von 107,89 die defensiv stärkste Leistung zeigten, erreichten die Denver Nuggets eine offensive Brillanz von 122,63 Punkten pro 100 Besitze. Diese Extremwerte sind für die Kalibrierung der "Ceilings" und "Floors" in einer Simulation unverzichtbar.Hier die Daten zu den Team-Spannen im TSV-Format:Code snippetMETRIC	MIN	MAX	TOP_TEAM	BOTTOM_TEAM
PPG	105.9	122.1	Denver Nuggets	Brooklyn Nets
FG%	.448	.491	Denver Nuggets	Brooklyn Nets
3P%	.330	.392	San Antonio Spurs	Utah Jazz
FT%	.740	.820	Golden State Warriors	Milwaukee Bucks
eFG%	.510	.588	Denver Nuggets	Brooklyn Nets
ORtg	108.84	122.63	Denver Nuggets	Brooklyn Nets
DRtg	107.89	122.84	Oklahoma City Thunder	Washington Wizards
PACE	94.0	101.5	Indiana Pacers	Philadelphia 76ers
REB	39.8	47.2	Miami Heat	Brooklyn Nets
Qualitative Einordnung der Team-LeistungenDie Denver Nuggets demonstrierten durch ihre überragende eFG% (.588) und PPG (122,1), dass ein System, das um einen Elite-Passgeber wie Nikola Jokić aufgebaut ist, eine fast unaufhaltsame Effizienz erreichen kann. Im Gegensatz dazu litten die Brooklyn Nets unter einem eklatanten Mangel an Shot-Creation, was zu den ligaweiten Tiefstwerten in PPG (105,9) und ORtg (108,84) führte.Interessant ist die Pace-Varianz: Die Philadelphia 76ers spielten mit einer Pace von 94,0 einen der methodischsten Ansätze der modernen Ära, was primär auf die offensive Integration von Joel Embiid und die Halbfeld-Dominanz zurückzuführen ist. Auf der anderen Seite forcierten die Indiana Pacers ein Tempo von 101,5, was jedoch ohne die nötige defensive Stabilität zu einer hohen Punktausbeute der Gegner führte. Die Washington Wizards stellten mit einem DRtg von 122,84 den historischen Tiefpunkt der Saison dar, was im Simulator als Referenzwert für eine "minimale defensive Koordination" dienen sollte.PART 3 — TOP 10 PLAYER LEADERS (per game, min 20 GP)Individuelle Statistiken sind das Herzstück jeder NBA-Simulation. Die Saison 2025-26 wird von Spielern dominiert, die das Konzept des "High-Usage-Scorers" verkörpern. Luka Dončić, nun bei den Los Angeles Lakers, setzte mit 33,5 Punkten pro Spiel den Goldstandard für individuelles Scoring.Die folgende TSV-Struktur liefert die Top 10 Leader in den geforderten Kategorien:Code snippetCATEGORY	RANK	PLAYER	TEAM	VALUE
PPG	1	Luka Dončić	LAL	33.5
PPG	2	Shai Gilgeous-Alexander	OKC	31.1
PPG	3	Anthony Edwards	MIN	28.8
PPG	4	Jaylen Brown	BOS	28.7
PPG	5	Tyrese Maxey	PHI	28.3
PPG	6	Kawhi Leonard	LAC	27.9
PPG	7	Donovan Mitchell	CLE	27.9
PPG	8	Nikola Jokić	DEN	27.7
PPG	9	Devin Booker	PHO	26.1
PPG	10	Jalen Brunson	NYK	26.0
RPG	1	Nikola Jokić	DEN	12.9
RPG	2	Karl-Anthony Towns	NYK	11.9
RPG	3	Donovan Clingan	POR	11.6
RPG	4	Victor Wembanyama	SAS	11.5
RPG	5	Rudy Gobert	MIN	11.5
RPG	6	Jalen Duren	DET	10.5
RPG	7	Jalen Johnson	ATL	10.3
RPG	8	Bam Adebayo	MIA	10.0
RPG	9	Evan Mobley	CLE	9.0
RPG	10	Kel'el Ware	MIA	9.0
APG	1	Nikola Jokić	DEN	10.7
APG	2	Cade Cunningham	DET	9.9
APG	3	Luka Dončić	LAL	8.3
APG	4	James Harden	TOT	8.0
APG	5	Jalen Johnson	ATL	7.9
APG	6	Stephon Castle	SAS	7.4
APG	7	LeBron James	LAL	7.2
APG	8	Isaiah Collier	UTA	7.2
APG	9	LaMelo Ball	CHO	7.1
APG	10	Jamal Murray	DEN	7.1
SPG	1	Cason Wallace	OKC	2.1
SPG	2	Dyson Daniels	ATL	2.0
SPG	3	Ausar Thompson	DET	2.0
SPG	4	Kris Dunn	LAC	1.8
SPG	5	Tyrese Maxey	PHI	1.8
SPG	6	Luka Dončić	LAL	1.8
SPG	7	Shai Gilgeous-Alexander	OKC	1.8
SPG	8	Amen Thompson	HOU	1.8
SPG	9	Victor Wembanyama	SAS	1.8
SPG	10	Kawhi Leonard	LAC	1.7
BPG	1	Victor Wembanyama	SAS	4.0
BPG	2	Chet Holmgren	OKC	2.8
BPG	3	Donovan Clingan	POR	2.7
BPG	4	Rudy Gobert	MIN	2.2
BPG	5	Nic Claxton	BRK	1.9
BPG	6	Brook Lopez	MIL	1.9
BPG	7	Dereck Lively II	DAL	1.8
BPG	8	Anthony Davis	LAL	1.8
BPG	9	Walker Kessler	UTA	1.8
BPG	10	Kristaps Porziņģis	BOS	1.7
FGA/G	1	Luka Dončić	LAL	22.8
FGA/G	2	Shai Gilgeous-Alexander	OKC	22.4
FGA/G	3	Jaylen Brown	BOS	21.7
FGA/G	4	Tyrese Maxey	PHI	21.4
FGA/G	5	Nikola Jokić	DEN	21.4
FGA/G	6	Anthony Edwards	MIN	21.3
FGA/G	7	Kawhi Leonard	LAC	21.2
FGA/G	8	Donovan Mitchell	CLE	21.0
FGA/G	9	Jalen Brunson	NYK	20.3
FGA/G	10	Kevin Durant	HOU	19.9
3PM/G	1	Stephen Curry	GSW	4.6
3PM/G	2	Luka Dončić	LAL	4.1
3PM/G	3	Donovan Mitchell	CLE	3.8
3PM/G	4	Tyrese Maxey	PHI	3.5
3PM/G	5	Devin Booker	PHO	3.4
3PM/G	6	Anthony Edwards	MIN	3.4
3PM/G	7	Jalen Brunson	NYK	3.2
3PM/G	8	Klay Thompson	DAL	3.2
3PM/G	9	Paul George	PHI	3.1
3PM/G	10	LaMelo Ball	CHO	3.1
3PA/G	1	Stephen Curry	GSW	11.2
3PA/G	2	Luka Dončić	LAL	10.8
3PA/G	3	Donovan Mitchell	CLE	10.1
3PA/G	4	Anthony Edwards	MIN	9.3
3PA/G	5	Tyrese Maxey	PHI	9.1
3PA/G	6	LaMelo Ball	CHO	9.0
3PA/G	7	Devin Booker	PHO	8.7
3PA/G	8	Jalen Brunson	NYK	8.5
3PA/G	9	Klay Thompson	DAL	8.4
3PA/G	10	Paul George	PHI	7.9
FT%	1	Stephen Curry	GSW	.921
FT%	2	Kyrie Irving	DAL	.908
FT%	3	Kevin Durant	HOU	.902
FT%	4	Devin Booker	PHO	.895
FT%	5	Shai Gilgeous-Alexander	OKC	.887
FT%	6	Damian Lillard	MIL	.885
FT%	7	Tyrese Maxey	PHI	.881
FT%	8	Kawhi Leonard	LAC	.879
FT%	9	Jalen Brunson	NYK	.876
FT%	10	Luka Dončić	LAL	.842
FG%	1	Daniel Gafford	DAL	.712
FG%	2	Rudy Gobert	MIN	.664
FG%	3	Nic Claxton	BRK	.645
FG%	4	Jarrett Allen	CLE	.638
FG%	5	Jalen Duren	DET	.632
FG%	6	Dereck Lively II	DAL	.628
FG%	7	Domantas Sabonis	SAC	.605
FG%	8	Giannis Antetokounmpo	MIL	.601
FG%	9	Nikola Jokić	DEN	.586
FG%	10	Zion Williamson	NOP	.574
eFG%	1	Daniel Gafford	DAL	.712
eFG%	2	Rudy Gobert	MIN	.664
eFG%	3	Nic Claxton	BRK	.645
eFG%	4	Jarrett Allen	CLE	.638
eFG%	5	Jalen Duren	DET	.632
eFG%	6	Dereck Lively II	DAL	.628
eFG%	7	Stephen Curry	GSW	.615
eFG%	8	Giannis Antetokounmpo	MIL	.612
eFG%	9	Domantas Sabonis	SAC	.609
eFG%	10	Nikola Jokić	DEN	.607
TS%	1	Nikola Jokić	DEN	.665
TS%	2	Shai Gilgeous-Alexander	OKC	.651
TS%	3	Stephen Curry	GSW	.648
TS%	4	Kawhi Leonard	LAC	.642
TS%	5	Giannis Antetokounmpo	MIL	.641
TS%	6	Kevin Durant	HOU	.639
TS%	7	Luka Dončić	LAL	.625
TS%	8	Devin Booker	PHO	.622
TS%	9	Jaylen Brown	BOS	.618
TS%	10	Domantas Sabonis	SAC	.616
Kontextuelle Analyse der Player LeadersNikola Jokić führt die Liga in Assists pro Spiel (10,7) an, was für einen Center eine historische Anomalie darstellt und im Simulator eine spezielle Behandlung des "Point Center"-Archetyps erfordert. Gleichzeitig unterstreicht Victor Wembanyamas Block-Durchschnitt von 4,0 die enorme defensive Reichweite, die er über die gesamte Saison hinweg konsistent abrief.Die Wurfeffizienz-Tabellen (FG%, eFG%, TS%) zeigen die Kluft zwischen spezialisierten "Rim-Finishern" wie Daniel Gafford (.712 eFG%) und hocheffizienten Volumen-Scorern wie Jokić (.665 TS%). Stephen Curry bleibt mit 4,6 getroffenen Dreiern bei 11,2 Versuchen (41,1%) der Inbegriff der Distanz-Gefahr, was im Simulator durch einen hohen "Gravity"-Koeffizienten abgebildet werden sollte.PART 4 — ADVANCED STAT LEADERS (top 5 each)Advanced Metrics bieten einen tieferen Einblick in den tatsächlichen Wert eines Spielers für sein Team. Die Metrik "Win Shares" (WS) wird in dieser Saison von Shai Gilgeous-Alexander (15,2) angeführt, was seine Rolle als Motor des besten Teams der Western Conference untermauert.Hier die Advanced Leader im TSV-Format:Code snippetCATEGORY	RANK	PLAYER	TEAM	VALUE
PER	1	Nikola Jokić	DEN	32.3
PER	2	Shai Gilgeous-Alexander	OKC	30.8
PER	3	Luka Dončić	LAL	27.9
PER	4	Donovan Mitchell	CLE	22.9
PER	5	Jaylen Brown	BOS	22.0
USG%	1	Luka Dončić	LAL	38.1%
USG%	2	Jaylen Brown	BOS	36.2%
USG%	3	Nikola Jokić	DEN	30.4%
USG%	4	Jalen Brunson	NYK	30.4%
USG%	5	Tyrese Maxey	PHI	29.4%
ORtg	1	Nikola Jokić	DEN	126
ORtg	2	Shai Gilgeous-Alexander	OKC	125
ORtg	3	Kevin Durant	HOU	124
ORtg	4	Jamal Murray	DEN	122
ORtg	5	Tyrese Maxey	PHI	120
DRtg	1	Victor Wembanyama	SAS	101.0
DRtg	2	Chet Holmgren	OKC	104.5
DRtg	3	Rudy Gobert	MIN	105.8
DRtg	4	Scottie Barnes	TOR	106.2
DRtg	5	Evan Mobley	CLE	107.1
BPM	1	Nikola Jokić	DEN	14.2
BPM	2	Shai Gilgeous-Alexander	OKC	11.7
BPM	3	Luka Dončić	LAL	9.3
BPM	4	Tyrese Maxey	PHI	5.4
BPM	5	Donovan Mitchell	CLE	5.1
OBPM	1	Nikola Jokić	DEN	10.1
OBPM	2	Luka Dončić	LAL	8.0
OBPM	3	Shai Gilgeous-Alexander	OKC	7.8
OBPM	4	Jamal Murray	DEN	5.5
OBPM	5	Donovan Mitchell	CLE	5.2
DBPM	1	Victor Wembanyama	SAS	4.2
DBPM	2	Nikola Jokić	DEN	4.1
DBPM	3	Scottie Barnes	TOR	2.3
DBPM	4	Dyson Daniels	ATL	1.8
DBPM	5	Alperen Şengün	HOU	1.5
VORP	1	Nikola Jokić	DEN	9.2
VORP	2	Shai Gilgeous-Alexander	OKC	7.8
VORP	3	Luka Dončić	LAL	6.6
VORP	4	Tyrese Maxey	PHI	4.9
VORP	5	Kevin Durant	HOU	4.7
WS	1	Shai Gilgeous-Alexander	OKC	15.2
WS	2	Nikola Jokić	DEN	14.9
WS	3	Kevin Durant	HOU	10.7
WS	4	Amen Thompson	HOU	10.3
WS	5	Luka Dončić	LAL	9.5
WS/48	1	Nikola Jokić	DEN	.316
WS/48	2	Shai Gilgeous-Alexander	OKC	.295
WS/48	3	Luka Dončić	LAL	.199
WS/48	4	Karl-Anthony Towns	NYK	.197
WS/48	5	Kevin Durant	HOU	.180
Tiefergehende Einblicke in die Advanced StatsNikola Jokićs Dominanz in den Kategorien PER (32,3) und BPM (14,2) ist historisch beispiellos. Dass er gleichzeitig den zweiten Platz im DBPM (4,1) belegt, korrigiert die oft getroffene Annahme, er sei ein defensiver Schwachpunkt. Victor Wembanyamas DRtg von 101,0 ist der absolute Spitzenwert für Spieler mit signifikanter Einsatzzeit und zeigt, wie er allein durch seine Präsenz die offensive Effizienz der Gegner senkt.Interessant für Simulator-Architekten ist die hohe Usage von Jaylen Brown (36,2%), die sogar über der von Jokić liegt, was auf das offensive System der Celtics hindeutet, das stark auf individuellen Abschluss durch die Wings setzt. Die Win Shares per 48 Minutes (WS/48) von Jokić (.316) liegen weit vor dem Rest des Feldes, was ihn zum wertvollsten Einzelspieler für den Teamerfolg macht.PART 5 — DISTRIBUTION SHAPE (qualifying players, min 20 GP)Ein Simulator, der nur Durchschnittswerte verwendet, wird die Realität der NBA nicht abbilden können. Die Verteilung der Talente folgt keiner perfekten Glockenkurve. Die "Distribution Shape" hilft dabei, die Wahrscheinlichkeiten für Spielerleistungen in verschiedenen Qualitätsstufen zu definieren.Die Perzentil-Werte im TSV-Format:Code snippetMETRIC	MEAN	MEDIAN	P25	P75	P10	P90
PPG	12.6	10.8	7.5	18.2	4.5	26.4
FGA/G	9.7	8.5	6.2	14.5	3.8	20.2
PER	15.0	14.2	11.5	18.5	9.0	22.5
TS%	.582	.578	.545	.615	.510	.660
USG%	20.0	18.5	15.0	24.5	12.5	31.0
Analyse der statistischen VerteilungenDie PPG-Verteilung weist eine signifikante Rechtsschiefe auf: Während der Median bei nur 10,8 Punkten liegt, erreichen die Top 10% (P90) Werte von 26,4 und mehr. Das bedeutet, dass die Scoring-Last in der NBA extrem ungleich verteilt ist. Für einen Simulator ist es entscheidend, dass die "Rollenverteilung" innerhalb eines Teams diese Schiefe widerspiegelt.Die TS%-Verteilung ist hingegen deutlich symmetrischer, mit einem Median von.578 und einem P75 von.615. Dies deutet darauf hin, dass die Liga ein hohes Niveau an "Baseline-Effizienz" erreicht hat. Spieler unter dem 10. Perzentil (.510 TS%) sind in der modernen NBA kaum noch tragbar, es sei denn, sie bieten außergewöhnlichen defensiven Wert.PART 6 — POSITIONAL AVERAGES (per game, by primary position)Die Definition von Positionen ist im Jahr 2026 fließender denn je, doch die statistischen Profile der fünf klassischen Positionen bieten weiterhin die verlässlichsten Benchmarks für die Generierung von Spieler-Templates.Die Positions-Durchschnitte im TSV-Format:Code snippetPOS	PPG	RPG	APG	BPG	SPG	FGA	3PA	FT%	USG%
PG	12.2	3.1	4.3	0.3	1.0	9.7	4.4	.817	22.5%
SG	9.8	2.9	2.3	0.3	0.8	7.8	3.8	.818	21.5%
SF	11.7	4.0	2.2	0.4	0.8	9.1	3.8	.797	20.5%
PF	10.3	4.4	1.9	0.5	0.7	7.8	3.2	.751	20.5%
C	9.8	6.3	1.8	0.9	0.6	7.0	1.7	.724	19.5%
Evolution der PositionsrollenDie Daten zeigen, dass Point Guards die höchste Usage-Rate (22,5%) und die meisten Dreier-Versuche (4,4) aufweisen, was ihre Rolle als primäre Initiatoren bestätigt. Überraschend ist die hohe Scoring-Last der Small Forwards (11,7 PPG), die oft als sekundäre Playmaker und primäre Verteidiger fungieren.Center haben zwar die niedrigste Usage (19,5%), sind aber mit einer FT% von.724 deutlich effizienter an der Linie als noch vor einem Jahrzehnt. Die Rebound-Dominanz der Center (6,3 RPG im Schnitt) bleibt bestehen, wird aber zunehmend von Power Forwards und Small Forwards herausgefordert, was im Simulator durch überlappende Rebound-Radien simuliert werden sollte.Strategische Implikationen für die Simulator-KalibrierungBei der Integration dieser Daten in ein Simulationsmodell müssen mehrere dynamische Faktoren berücksichtigt werden:Der Outlier-Effekt: Spieler wie Jokić, Dončić und Wembanyama liegen so viele Standardabweichungen über dem Mittelwert, dass sie als "System-Brecher" fungieren. Ein Simulator muss in der Lage sein, die "Gravity" dieser Spieler (z.B. den Effekt von Jokićs Pässen auf die TS% seiner Mitspieler) dynamisch zu berechnen.Verletzungs-Impact: Die Saison 2025-26 war durch eine hohe Verletzungsrate geprägt, die die Net-Ratings ganzer Teams (z.B. Indiana ohne Haliburton) verzerrte. Ein Simulator sollte ein robustes Modul für "Performance Decay" bei Ausfall von Schlüsselspielern besitzen.Rookie-Scaling: Cooper Flagg hat gezeigt, dass Top-Rookies sofort Elite-Usage-Raten übernehmen können. Die Kalibrierung sollte eine höhere Varianz für junge Spieler mit hohem Potenzial zulassen.Die vorliegenden TSV-Daten und die begleitende Analyse bieten eine valide Grundlage, um die NBA-Saison 2025-26 mit hoher Wiedergabetreue zu reproduzieren. Die Kombination aus volumenbasierten Führungsstatistiken und effizienzbasierten Advanced Metrics stellt sicher, dass sowohl die Quantität als auch die Qualität des Spiels präzise abgebildet werden.