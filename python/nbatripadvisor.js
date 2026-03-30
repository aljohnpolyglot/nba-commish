(async () => {
    window.NBA_MEGA_DATA = [];
    
    // THE LEGENDARY CHAIN LIST (60+ Brands)
    const chains = [
        "Chipotle Mexican Grill", "Olive Garden", "The Cheesecake Factory", "Texas Roadhouse", "Buffalo Wild Wings",
        "P.F. Chang's", "Red Lobster", "Outback Steakhouse", "Applebee's", "TGI Fridays", "Chili's Grill & Bar",
        "IHOP", "Denny's", "Panera Bread", "Chick-fil-A", "Taco Bell", "Shake Shack", "Five Guys", "In-N-Out Burger",
        "Panda Express", "Wingstop", "Raising Cane's", "Zaxby's", "Jersey Mike's Subs", "Jimmy John's", "Firehouse Subs",
        "Culver's", "Whataburger", "Waffle House", "Cracker Barrel", "BJ's Restaurant & Brewhouse", "Red Robin",
        "LongHorn Steakhouse", "Carrabba's Italian Grill", "Bonefish Grill", "Yard House", "The Capital Grille",
        "Ruth's Chris Steak House", "Morton's The Steakhouse", "Fleming's Prime Steakhouse", "Fogo de Chão",
        "California Pizza Kitchen", "Maggiano's Little Italy", "Chuy's", "On The Border",
        "Hooters", "Dave & Buster's", "Miller's Ale House", "Bubba Gump Shrimp Co.", "Hard Rock Cafe",
        "Rainforest Cafe", "Benihana", "Mastro's Steakhouse", "Ocean Prime", 
        "Del Frisco's Double Eagle Steakhouse", "STK Steakhouse", "Old Spaghetti Factory", "Potbelly Sandwich Shop",
        "Jason's Deli", "McAlister's Deli", "Schlotzsky's", "Mellow Mushroom", "Marco's Pizza"
    ];

    // THE 30 NBA CITIES (Verified Geo-URLs)
    const nbaCities = [
        { team: "Hawks", city: "Atlanta", url: "https://www.tripadvisor.com.ph/Restaurants-g60898-Atlanta_Georgia.html" },
        { team: "Celtics", city: "Boston", url: "https://www.tripadvisor.com.ph/Restaurants-g60745-Boston_Massachusetts.html" },
        { team: "Nets", city: "Brooklyn", url: "https://www.tripadvisor.com.ph/Restaurants-g60827-Brooklyn_New_York.html" },
        { team: "Hornets", city: "Charlotte", url: "https://www.tripadvisor.com.ph/Restaurants-g49022-Charlotte_North_Carolina.html" },
        { team: "Bulls", city: "Chicago", url: "https://www.tripadvisor.com.ph/Restaurants-g35805-Chicago_Illinois.html" },
        { team: "Cavaliers", city: "Cleveland", url: "https://www.tripadvisor.com.ph/Restaurants-g50207-Cleveland_Ohio.html" },
        { team: "Mavericks", city: "Dallas", url: "https://www.tripadvisor.com.ph/Restaurants-g55711-Dallas_Texas.html" },
        { team: "Nuggets", city: "Denver", url: "https://www.tripadvisor.com.ph/Restaurants-g33388-Denver_Colorado.html" },
        { team: "Pistons", city: "Detroit", url: "https://www.tripadvisor.com.ph/Restaurants-g42139-Detroit_Michigan.html" },
        { team: "Warriors", city: "San Francisco", url: "https://www.tripadvisor.com.ph/Restaurants-g60713-San_Francisco_California.html" },
        { team: "Rockets", city: "Houston", url: "https://www.tripadvisor.com.ph/Restaurants-g56003-Houston_Texas.html" },
        { team: "Pacers", city: "Indianapolis", url: "https://www.tripadvisor.com.ph/Restaurants-g37209-Indianapolis_Indiana.html" },
        { team: "Lakers/Clippers", city: "Los Angeles", url: "https://www.tripadvisor.com.ph/Restaurants-g32655-Los_Angeles_California.html" },
        { team: "Grizzlies", city: "Memphis", url: "https://www.tripadvisor.com.ph/Restaurants-g55197-Memphis_Tennessee.html" },
        { team: "Heat", city: "Miami", url: "https://www.tripadvisor.com.ph/Restaurants-g34438-Miami_Florida.html" },
        { team: "Bucks", city: "Milwaukee", url: "https://www.tripadvisor.com.ph/Restaurants-g60097-Milwaukee_Wisconsin.html" },
        { team: "Timberwolves", city: "Minneapolis", url: "https://www.tripadvisor.com.ph/Restaurants-g43323-Minneapolis_Minnesota.html" },
        { team: "Pelicans", city: "New Orleans", url: "https://www.tripadvisor.com.ph/Restaurants-g60864-New_Orleans_Louisiana.html" },
        { team: "Knicks", city: "New York City", url: "https://www.tripadvisor.com.ph/Restaurants-g60763-New_York_City_New_York.html" },
        { team: "Thunder", city: "Oklahoma City", url: "https://www.tripadvisor.com.ph/Restaurants-g51560-Oklahoma_City_Oklahoma.html" },
        { team: "Magic", city: "Orlando", url: "https://www.tripadvisor.com.ph/Restaurants-g34515-Orlando_Florida.html" },
        { team: "76ers", city: "Philadelphia", url: "https://www.tripadvisor.com.ph/Restaurants-g60795-Philadelphia_Pennsylvania.html" },
        { team: "Suns", city: "Phoenix", url: "https://www.tripadvisor.com.ph/Restaurants-g31310-Phoenix_Arizona.html" },
        { team: "Blazers", city: "Portland", url: "https://www.tripadvisor.com.ph/Restaurants-g52332-Portland_Oregon.html" },
        { team: "Kings", city: "Sacramento", url: "https://www.tripadvisor.com.ph/Restaurants-g32999-Sacramento_California.html" },
        { team: "Spurs", city: "San Antonio", url: "https://www.tripadvisor.com.ph/Restaurants-g60956-San_Antonio_Texas.html" },
        { team: "Raptors", city: "Toronto", url: "https://www.tripadvisor.com.ph/Restaurants-g155019-Toronto_Ontario.html" },
        { team: "Jazz", city: "Salt Lake City", url: "https://www.tripadvisor.com.ph/Restaurants-g60922-Salt_Lake_City_Utah.html" },
        { team: "Wizards", city: "Washington DC", url: "https://www.tripadvisor.com.ph/Restaurants-g28970-Washington_DC_District_of_Columbia.html" }
    ];

    console.log("%c 🏀 NBA MEGA CHAIN HUNTER: ACTIVATED ", "background: #c9082a; color: white; font-size: 22px; font-weight: bold; padding: 10px;");

    // UI Setup
    const ui = document.createElement('div');
    ui.id = "mega-ui";
    ui.style = "position:fixed;top:10px;left:10px;z-index:10000;background:#111;color:#00ff00;padding:20px;border:3px solid #c9082a;border-radius:12px;font-family:monospace;width:300px;box-shadow:0 0 30px rgba(201,8,42,0.6);";
    ui.innerHTML = `
        <div style="font-weight:bold;font-size:16px;border-bottom:2px solid #c9082a;padding-bottom:10px;margin-bottom:10px;color:white">NBA MEGA SCRAPER</div>
        City: <span id="m-city" style="color:#00ff00">-</span><br>
        Brand: <span id="m-brand" style="color:#00ff00">-</span><br>
        Total: <span id="m-total" style="color:white">0</span><br>
        Status: <span id="m-status" style="color:#aaa">Starting...</span><br><br>
        <button id="m-dl" style="width:100%;background:#c9082a;color:white;border:none;padding:10px;cursor:pointer;font-weight:bold;border-radius:5px;">DOWNLOAD DATA NOW</button>
        <div style="font-size:9px;color:#666;margin-top:10px;">This will take approx 1 hour to complete.</div>
    `;
    document.body.appendChild(ui);

    const downloadData = () => {
        const blob = new Blob([JSON.stringify(window.NBA_MEGA_DATA, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `nba_mega_chains_${window.NBA_MEGA_DATA.length}.json`;
        a.click();
    };

    document.getElementById('m-dl').onclick = downloadData;

    for (let loc of nbaCities) {
        document.getElementById('m-city').innerText = loc.city;
        
        for (let brand of chains) {
            document.getElementById('m-brand').innerText = brand;
            document.getElementById('m-status').innerText = "Fetching...";
            
            const searchUrl = `${loc.url}?q=${encodeURIComponent(brand)}`;
            
            try {
                const res = await fetch(searchUrl);
                const html = await res.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const cards = doc.querySelectorAll('[data-automation="restaurantCard"]');

                cards.forEach((card) => {
                    const nameEl = card.querySelector('.mtnKn.OgHoE');
                    const name = nameEl?.innerText.replace(/^\d+\.\s+/, '').trim();

                    // Validation: Match brand to name roughly
                    const firstWord = brand.split(' ')[0].toLowerCase();
                    if (name && name.toLowerCase().includes(firstWord)) {
                        
                        const imgEl = card.querySelector('img[src*="photo-o"]') || card.querySelector('img[src*="dynamic-media"]');
                        const infoContainer = card.querySelector('.biqBm');
                        const infoSpans = infoContainer ? Array.from(infoContainer.querySelectorAll('span')) : [];
                        
                        const rating = card.querySelector('[data-automation="bubbleRatingValue"] span')?.innerText || "N/A";
                        const reviews = card.querySelector('[data-automation="bubbleReviewCount"] span')?.innerText || "0";
                        
                        const forbidden = ["Menu", "Reserve", "Order", "Closed", "Open", "Sponsored", rating];
                        const cuisine = infoSpans.find(s => {
                            const txt = s.innerText.trim();
                            return txt.length > 2 && !txt.includes('$') && !txt.includes('₱') && !txt.includes('review') && !forbidden.some(word => txt.includes(word));
                        })?.innerText || "N/A";

                        const price = infoSpans.find(s => s.innerText.includes('₱') || s.innerText.includes('$'))?.innerText || "N/A";

                        window.NBA_MEGA_DATA.push({
                            nba_team: loc.team,
                            city: loc.city,
                            brand: brand,
                            name: name,
                            image: imgEl?.src || imgEl?.srcset?.split(' ')[0] || "No Image",
                            rating: rating,
                            reviews: reviews.replace(/[()]/g, '').trim(),
                            cuisine: cuisine,
                            price: price,
                            link: "https://www.tripadvisor.com.ph" + card.querySelector('a')?.getAttribute('href')
                        });
                    }
                });

                document.getElementById('m-total').innerText = window.NBA_MEGA_DATA.length;

            } catch (e) { console.error(`Failed: ${brand} in ${loc.city}`); }
            
            // Random stealth delay to avoid 403 blocks
            const wait = Math.floor(Math.random() * 1000) + 1800;
            document.getElementById('m-status').innerText = `Cooldown (${wait}ms)`;
            await new Promise(r => setTimeout(r, wait));
        }
    }

    document.getElementById('m-status').innerText = "DONE!";
    downloadData();
})();