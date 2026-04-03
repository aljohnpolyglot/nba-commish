(async function() {
    console.log("🚀 Starting Mega Scrape (Pages + Bio Extraction)...");
    
    const allPlayers = [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    // Find all numeric page links (1, 2, 3...)
    const pageLinks = Array.from(document.querySelectorAll('.pagination .page-item a'))
                           .filter(a => !isNaN(parseInt(a.innerText)));

    console.log(`Detected ${pageLinks.length} total pages.`);

    for (let i = 0; i < pageLinks.length; i++) {
        const pageNum = i + 1;
        console.log(`\n--- PROCESSING PAGE ${pageNum} ---`);
        
        // Click the page button
        pageLinks[i].click();
        
        // Wait for AJAX to update the table
        await sleep(3000);

        const rows = document.querySelectorAll('table.table-striped tbody tr');
        console.log(`Found ${rows.length} players on Page ${pageNum}.`);

        for (let row of rows) {
            const td = row.querySelectorAll('td');
            if (td.length < 20) continue;

            const playerName = td[1].innerText.trim();
            const playerUrl = "https://basketball.realgm.com" + td[1].querySelector('a').getAttribute('href');
            
            console.log(`Extracting: ${playerName}...`);

            let bioData = {};
            try {
                const response = await fetch(playerUrl);
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const profile = doc.querySelector('.profile-box');

                if (profile) {
                    const getVal = (txt) => {
                        const p = Array.from(profile.querySelectorAll('p')).find(el => el.innerText.includes(txt));
                        return p ? p.innerText.split(':')[1].trim() : "N/A";
                    };

                    bioData = {
                        image: profile.querySelector('img') ? "https://basketball.realgm.com" + profile.querySelector('img').getAttribute('src') : "",
                        position: profile.querySelector('.feature')?.innerText || "N/A",
                        height: getVal("Height"),
                        weight: getVal("Weight"),
                        born: getVal("Born"),
                        hometown: getVal("Hometown"),
                        nationality: getVal("Nationality"),
                        nba_status: getVal("Current NBA Status"),
                        agent: getVal("Agent"),
                        draft: getVal("NBA Draft"),
                        pre_draft: getVal("Pre-Draft Team"),
                        high_school: getVal("High School")
                    };
                }
            } catch (e) { console.log(`[Bio Error for ${playerName}]`); }

            allPlayers.push({
                rank: td[0].innerText.trim(),
                name: playerName,
                team: td[2].innerText.trim(),
                gp: td[3].innerText.trim(),
                mpg: td[4].innerText.trim(),
                ppg: td[5].innerText.trim(),
                fgm: td[6].innerText.trim(),
                fga: td[7].innerText.trim(),
                fgp: td[8].innerText.trim(),
                p3m: td[9].innerText.trim(),
                p3a: td[10].innerText.trim(),
                p3p: td[11].innerText.trim(),
                ftm: td[12].innerText.trim(),
                fta: td[13].innerText.trim(),
                ftp: td[14].innerText.trim(),
                orb: td[15].innerText.trim(),
                drb: td[16].innerText.trim(),
                rpg: td[17].innerText.trim(),
                apg: td[18].innerText.trim(),
                spg: td[19].innerText.trim(),
                bpg: td[20].innerText.trim(),
                tov: td[21].innerText.trim(),
                pf: td[22].innerText.trim(),
                ...bioData
            });
            
            // Safety delay to prevent RealGM from blocking your browser
            await sleep(150); 
        }
    }

    console.log(`\n✅ DATABASE COMPLETE! Scraped ${allPlayers.length} total players.`);
    
    // Auto-Download JSON
    const blob = new Blob([JSON.stringify(allPlayers, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'euroleague_full_database.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    console.log("📁 File 'euroleague_full_database.json' is downloading...");
})();