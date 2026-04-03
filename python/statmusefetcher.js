//https://www.statmuse.com/nba
(async function scrapeStatMuse() {
    // 1. Create a nice UI Progress Bar overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.95)', zIndex: '999999', display: 'flex',
        flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    const title = document.createElement('h1');
    title.innerText = '🏀 StatMuse HD Image Scraper';
    title.style.marginBottom = '10px';
    
    const statusText = document.createElement('h3');
    statusText.innerText = 'Initializing...';
    statusText.style.fontWeight = '400';
    statusText.style.color = '#94a3b8';

    const progressContainer = document.createElement('div');
    Object.assign(progressContainer.style, {
        width: '400px', height: '24px', backgroundColor: '#334155', 
        borderRadius: '12px', overflow: 'hidden', marginTop: '20px',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
    });

    const progressBar = document.createElement('div');
    Object.assign(progressBar.style, {
        width: '0%', height: '100%', backgroundColor: '#3b82f6', 
        transition: 'width 0.4s ease', backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)',
        backgroundSize: '1rem 1rem'
    });

    progressContainer.appendChild(progressBar);
    overlay.appendChild(title);
    overlay.appendChild(statusText);
    overlay.appendChild(progressContainer);
    document.body.appendChild(overlay);

    try {
        // 2. Grab all unique team URLs from the Standings table
        const teamNodes = document.querySelectorAll('a[href^="/nba/team/"]');
        const teamUrls = [...new Set(Array.from(teamNodes).map(a => a.href))];

        if (teamUrls.length === 0) {
            statusText.innerText = '❌ Error: No team links found. Make sure you are on the standings page.';
            progressBar.style.backgroundColor = '#ef4444';
            return;
        }

        const playerData = {};
        let completedTeams = 0;

        statusText.innerText = `Found ${teamUrls.length} teams. Scraping player galleries...`;

        // 3. Fetch team pages in small batches to avoid rate limits
        const batchSize = 3; 
        for (let i = 0; i < teamUrls.length; i += batchSize) {
            const batch = teamUrls.slice(i, i + batchSize);

            await Promise.all(batch.map(async (url) => {
                try {
                    const res = await fetch(url);
                    const html = await res.text();
                    
                    // Parse the HTML of the team page in the background
                    const doc = new DOMParser().parseFromString(html, 'text/html');

                    // Find all player links inside the team gallery
                    const playerLinks = doc.querySelectorAll('a[href^="/nba/player/"]');

                    playerLinks.forEach(link => {
                        const img = link.querySelector('img');
                        if (img) {
                            const playerName = img.getAttribute('alt'); // Player name is in the alt tag
                            const rawSrc = img.getAttribute('src');

                            if (playerName && rawSrc) {
                                // Extract the raw HD CDN URL from the ?href= parameter
                                const urlObj = new URL(rawSrc, window.location.origin);
                                const hdImageUrl = urlObj.searchParams.get('href');

                                if (hdImageUrl) {
                                    // Save to our JSON object format
                                    playerData[playerName.trim()] = hdImageUrl;
                                }
                            }
                        }
                    });
                } catch (err) {
                    console.error(`Failed to fetch team: ${url}`, err);
                } finally {
                    completedTeams++;
                    const percent = Math.round((completedTeams / teamUrls.length) * 100);
                    progressBar.style.width = `${percent}%`;
                    statusText.innerText = `Scraping teams... ${completedTeams} / ${teamUrls.length} (${percent}%)`;
                }
            }));

            // Wait 500ms between batches to act like a human and prevent IP bans
            await new Promise(r => setTimeout(r, 500));
        }

        const totalPlayers = Object.keys(playerData).length;
        statusText.innerText = `✅ Finished! Found ${totalPlayers} players. Downloading JSON...`;
        progressBar.style.backgroundColor = '#10b981';

        // 4. Autodownload JSON format
        const jsonString = JSON.stringify(playerData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = 'statmuse_players_hd.json';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // Cleanup
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobUrl);

        // Remove overlay after 3 seconds
        setTimeout(() => { document.body.removeChild(overlay); }, 3500);

    } catch (e) {
        statusText.innerText = '❌ An unexpected error occurred! Check the console.';
        progressBar.style.backgroundColor = '#ef4444';
        console.error(e);
    }
})();