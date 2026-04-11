(async function() {
    console.log("🚀 STARTING ULTIMATE SCRAPE...");
    console.log("📊 Target: All Stats + Full Bio + All Pages");
    
    const allPlayers = [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let hasNextPage = true;
    let currentPage = 1;

    while (hasNextPage) {
        console.log(`\n--- 📄 PROCESSING PAGE ${currentPage} ---`);
        
        // 1. Capture the table rows currently visible
        const rows = document.querySelectorAll('table.table-striped tbody tr');
        
        for (let row of rows) {
            const td = row.querySelectorAll('td');
            if (td.length < 20) continue; // Skip header/empty rows

            const playerName = td[1].innerText.trim();
            const playerLinkElement = td[1].querySelector('a');
            const playerUrl = "https://basketball.realgm.com" + playerLinkElement.getAttribute('href');
            
            console.log(`[Page ${currentPage}] 🔍 Fetching Bio for: ${playerName}...`);

            // --- 1. FULL STATS EXTRACTION (From the Table) ---
            const stats = {
                rank: td[0]?.innerText.trim(),
                name: playerName,
                team: td[2]?.innerText.trim(),
                gp:   td[3]?.innerText.trim(),
                mpg:  td[4]?.innerText.trim(),
                ppg:  td[5]?.innerText.trim(),
                fgm:  td[6]?.innerText.trim(),
                fga:  td[7]?.innerText.trim(),
                fgp:  td[8]?.innerText.trim(),
                p3m:  td[9]?.innerText.trim(),
                p3a:  td[10]?.innerText.trim(),
                p3p:  td[11]?.innerText.trim(),
                ftm:  td[12]?.innerText.trim(),
                fta:  td[13]?.innerText.trim(),
                ftp:  td[14]?.innerText.trim(),
                orb:  td[15]?.innerText.trim(),
                drb:  td[16]?.innerText.trim(),
                rpg:  td[17]?.innerText.trim(),
                apg:  td[18]?.innerText.trim(),
                spg:  td[19]?.innerText.trim(),
                bpg:  td[20]?.innerText.trim(),
                tov:  td[21]?.innerText.trim(),
                pf:   td[22]?.innerText.trim(),
                profile_url: playerUrl
            };

            // --- 2. FULL BIO EXTRACTION (From the Profile Page) ---
            let bioData = {};
            try {
                const response = await fetch(playerUrl);
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const profile = doc.querySelector('.profile-box');

                if (profile) {
                    const getVal = (label) => {
                        const paragraphs = Array.from(profile.querySelectorAll('p'));
                        const found = paragraphs.find(p => p.innerText.includes(label));
                        return found ? found.innerText.split(':')[1].trim() : "N/A";
                    };

                    bioData = {
                        image: profile.querySelector('img') ? "https://basketball.realgm.com" + profile.querySelector('img').getAttribute('src') : "N/A",
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
                        high_school: getVal("High School"),
                        college: getVal("College"),
                        twitter: doc.querySelector('a[href*="twitter.com"]')?.href || "N/A"
                    };
                }
            } catch (e) { 
                console.error(`❌ Bio fetch failed for ${playerName}`); 
            }

            // Combine everything
            allPlayers.push({ ...stats, ...bioData });
            
            // Wait 200ms between players to be safe
            await sleep(200); 
        }

        // --- 3. PAGINATION LOGIC (The "Next Button" Loop) ---
        const nextButton = document.querySelector('.page-item.page-next:not(.disabled) a');
        
        if (nextButton) {
            console.log(`➡️ Page ${currentPage} complete. Clicking 'Next'...`);
            nextButton.click();
            currentPage++;
            // IMPORTANT: Wait 4 seconds for the table to change before starting next loop
            await sleep(4000); 
        } else {
            console.log("🏁 REACHED THE FINAL PAGE.");
            hasNextPage = false;
        }
    }

    console.log(`\n✅ DATABASE COMPLETE! Total Players Scraped: ${allPlayers.length}`);
    
    // --- 4. AUTO-DOWNLOAD THE COMPLETE DATA ---
    const blob = new Blob([JSON.stringify(allPlayers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RealGM_NCAA_Full_Database_v2.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    console.log("📁 Your JSON file is downloading...");
})();