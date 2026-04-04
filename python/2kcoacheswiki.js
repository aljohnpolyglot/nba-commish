(async () => {
    console.log("🚀 Starting Global Coach Scraper...");

    const delay = ms => new Promise(res => setTimeout(res, ms));
    const allCoachData = [];
    const seenLinks = new Set();

    // 1. Get all Alphabetical navigation links (A, B, C... Z)
    const navLinks = Array.from(document.querySelectorAll('.category-page__alphabet-shortcut a'))
        .map(a => a.href)
        .filter(href => href.includes('from='));

    // Include the current page if it's not already in the list
    if (!navLinks.includes(window.location.href)) navLinks.unshift(window.location.href);

    console.log(`Found ${navLinks.length} alphabet pages to scan.`);

    for (const navUrl of navLinks) {
        console.log(`Scanning alphabet page: ${navUrl}`);
        const navResp = await fetch(navUrl);
        const navHtml = await navResp.text();
        const navDoc = new DOMParser().parseFromString(navHtml, 'text/html');

        // 2. Find all profile links on this page
        const memberLinks = Array.from(navDoc.querySelectorAll('.category-page__member-link'))
            .map(a => a.href)
            // Filter out Category pages (they start with Category:)
            .filter(href => !href.includes('/wiki/Category:'));

        for (const url of memberLinks) {
            if (seenLinks.has(url)) continue;
            seenLinks.add(url);

            try {
                const response = await fetch(url);
                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const infobox = doc.querySelector('.portable-infobox');

                if (!infobox) continue;

                // --- FILTER LOGIC ---
                const teamVal = infobox.querySelector('[data-source="team"] .pi-data-value')?.innerText || "";
                const positionVal = infobox.querySelector('[data-source="position"] .pi-data-value')?.innerText || "";
                const numberVal = infobox.querySelector('[data-source="number"]'); // Players have numbers, coaches don't usually

                // Criteria: 
                // 1. Must NOT be an "All-Time" team
                // 2. Position MUST contain "Coach"
                // 3. Must NOT have a jersey number (common in player profiles)
                const isAllTime = teamVal.toLowerCase().includes("all-time");
                const isCoach = positionVal.toLowerCase().includes("coach");
                const hasNumber = numberVal !== null;

                if (isAllTime || !isCoach || hasNumber) {
                    console.log(`⏭️ Skipping Player/Legend: ${url.split('/').pop()}`);
                    continue;
                }

                // --- DATA EXTRACTION ---
                const coach = {
                    name: infobox.querySelector('[data-source="title1"]')?.innerText.trim() || doc.querySelector('#firstHeading')?.innerText.trim(),
                    image: infobox.querySelector('.pi-image-thumbnail')?.src.split('/revision')[0], // Get high res version
                    url: url
                };

                const dataRows = infobox.querySelectorAll('.pi-data');
                dataRows.forEach(row => {
                    const label = row.querySelector('.pi-data-label')?.innerText.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const value = row.querySelector('.pi-data-value')?.innerText.trim();
                    if (label && value) coach[label] = value;
                });

                allCoachData.push(coach);
                console.log(`✅ Added Coach: ${coach.name}`);

                await delay(150); // Politeness delay

            } catch (err) {
                console.error(`❌ Error scraping ${url}:`, err);
            }
        }
    }

    // 3. Auto-Download the JSON
    const blob = new Blob([JSON.stringify(allCoachData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `active_nba_coaches_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);

    console.log(`🏁 Finished! Scraped ${allCoachData.length} active coaches.`);
})();