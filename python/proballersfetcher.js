//proballersplayerlst
(async () => {
    console.log("🚀 SCRAPER ACB 25-26 ESTRICTO (Sólo estadísticas de Liga Endesa este año)...");
    const players = [];
    const teamsMap = new Map();
    const rows = document.querySelectorAll('table.table tbody tr');
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const getCleanHeight = (str) => {
        const match = str.match(/(\d)m(\d+)/);
        return match ? (parseInt(match[1]) * 100 + parseInt(match[2])) : 195;
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) continue;

        const playerLink = row.querySelector('.list-player-entry');
        const teamLink = row.querySelector('.list-team-entry');
        if (!playerLink) continue;

        const name = playerLink.innerText.replace(/\s+/g, ' ').trim();
        const profileUrl = playerLink.href;
        const internalId = profileUrl.split('/')[5];
        const listAge = parseInt(cells[2].innerText) || 25;
        const birthYear = 2026 - listAge; 
        const listHomeCountry = cells[4].innerText.trim();

        try {
            const response = await fetch(profileUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            // --- FILTRADO 100% ESTRICTO: LIGA ENDESA 25-26 ---
            const allStatRows = Array.from(doc.querySelectorAll('table.table tbody tr'));
            let acbRow = null;

            allStatRows.forEach(sRow => {
                const sCells = sRow.querySelectorAll('td');
                if (sCells.length < 10) return;
                
                const seasonLabel = sCells[0].innerText.trim(); // "25-26"
                const leagueName = sCells[2].innerText.trim();
                const gp = parseInt(sCells[6].innerText) || 0;

                // CONDICIÓN ÚNICA: Temporada actual Y Liga Endesa Y haber jugado
                if (seasonLabel === "25-26" && (leagueName.includes("Endesa") || leagueName.includes("SPA-1")) && gp > 0) {
                    acbRow = sCells;
                }
            });

            // Si no tiene fila de ACB este año, lo ignoramos completamente
            if (!acbRow) {
                console.log(`⏩ [IGNORADO] ${name} (No ha debutado en ACB 25-26)`);
                continue;
            }

            const profileInfos = doc.querySelectorAll('.identity__stats__profil .info');
            const profilePos = profileInfos[3]?.innerText.trim() || "GF";
            const portraitImg = doc.querySelector('.identity__picture__box img')?.src || "";

            let fullStats = {
                season: 2026,
                tid: -1,
                pts: parseFloat(acbRow[3].innerText) || 0,
                trb: parseFloat(acbRow[4].innerText) || 0,
                ast: parseFloat(acbRow[5].innerText) || 0,
                gp: parseInt(acbRow[6].innerText) || 0,
                min: parseFloat(acbRow[7].innerText) || 0,
                fgp: parseFloat(acbRow[8].innerText) || 0,
                tpp: parseFloat(acbRow[9].innerText) || 0,
                ftp: parseFloat(acbRow[10].innerText) || 0,
                orb: parseFloat(acbRow[11].innerText) || 0,
                drb: parseFloat(acbRow[12].innerText) || 0,
                stl: parseFloat(acbRow[15].innerText) || 0,
                tov: parseFloat(acbRow[16].innerText) || 0,
                blk: parseFloat(acbRow[17].innerText) || 0,
                pf: parseFloat(acbRow[18].innerText) || 0
            };

            let tid = -1;
            if (teamLink) {
                const teamUrlParts = teamLink.href.split('/');
                tid = parseInt(teamUrlParts[teamUrlParts.length - 2]);
                if (!teamsMap.has(tid)) {
                    teamsMap.set(tid, { id: tid, name: teamLink.title || teamLink.innerText.trim(), logoUrl: `https://www.proballers.com/api/getTeamLogo?id=${tid}&width=300` });
                }
            }

            console.log(`✅ [PROCESADO] ${name} | ACB 25-26 | GP: ${fullStats.gp}`);

            players.push({
                internalId, tid, name, pos: profilePos.toUpperCase(),
                age: listAge, hgt: getCleanHeight(cells[3].innerText),
                imgURL: portraitImg,
                born: { year: birthYear, loc: listHomeCountry || "Spain" },
                status: 'Active', stats: [fullStats], injury: { type: "Healthy", gamesRemaining: 0 }
            });

        } catch (err) { console.warn(`⚠️ Error en ${name}`); }
        await sleep(150);
    }

    const output = { league: "ACB 25-26", teams: Array.from(teamsMap.values()), players };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'liga_endesa_final.json'; a.click();
})();