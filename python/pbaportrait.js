(async function() {
    console.log("🏀 PBA MEGA SCRAPER: Stats + High-Res Images (Fixed Names)...");
    
    const players = [];
    const rows = document.querySelectorAll('table tbody tr'); 
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    console.log(`Detected ${rows.length} players. Starting deep scrape...`);

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const linkEl = row.querySelector('td a');
        if (!linkEl) continue;

        const playerUrl = linkEl.href;
        // Get the name from the Table Row - This is the most reliable name
        const displayName = linkEl.innerText.trim();
        
        const td = row.querySelectorAll('td');
        const tableStats = {
            games_played: td[2]?.innerText.trim(),
            mins_per_game: td[3]?.innerText.trim(),
            field_goal_pct: td[6]?.innerText.trim(),
            three_point_pct: td[9]?.innerText.trim(),
            free_throw_pct: td[12]?.innerText.trim()
        };

        console.log(`[${i+1}/${rows.length}] Fetching Bio for: ${displayName}...`);

        try {
            const response = await fetch(playerUrl);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            // --- DEEP EXTRACTION ---
            
            // 1. Get the High-Res Image (The one with the 120px style)
            const headshot = doc.querySelector('img[style*="max-width: 120px"]')?.src || 
                             doc.querySelector('.w-100 img')?.src || "N/A";
            
            // 2. Get the real full name from the profile (H2 inside the content div)
            // If it says "Player Profile", we use the name from the table instead.
            let fullName = doc.querySelector('h2.text-center.mb-0')?.innerText.trim();
            if (!fullName || fullName === "Player Profile") {
                fullName = displayName; 
            }

            // 3. Position and Jersey Number
            const posNum = doc.querySelector('.player-position-number')?.innerText.trim() || "N/A";

            // 4. Detailed Stats (PPG, RPG, APG)
            const statNumbers = doc.querySelectorAll('.player-info-lbl.points');
            const ppg = statNumbers[0]?.innerText.trim() || "0.0";
            const rpg = statNumbers[1]?.innerText.trim() || "0.0";
            const apg = statNumbers[2]?.innerText.trim() || "0.0";

            // 5. Bio Info (Height, School)
            const otherInfo = doc.querySelectorAll('.player-info-lbl-other');
            const height = otherInfo[0]?.innerText.trim() || "-";
            const school = otherInfo[1]?.innerText.trim() || "-";

            players.push({
                full_name: fullName,
                image_url: headshot,
                position_number: posNum,
                height: height,
                school: school,
                stats: {
                    ppg: ppg,
                    rpg: rpg,
                    apg: apg,
                    ...tableStats
                },
                profile_url: playerUrl
            });

            console.log(`✅ Success: ${fullName}`);

        } catch (e) {
            console.error(`❌ Failed: ${displayName}`);
            // Fallback if fetch fails
            players.push({
                full_name: displayName,
                image_url: td[1].querySelector('img')?.src,
                stats: tableStats
            });
        }

        // 300ms delay to keep the site happy
        await sleep(300);
    }

    // --- DOWNLOAD JSON ---
    console.log(`\n🎉 FINISHED! Total: ${players.length} players.`);
    const blob = new Blob([JSON.stringify(players, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pba_database_final.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    console.log("📁 File 'pba_database_final.json' has been saved.");
})();