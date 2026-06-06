(async () => {
  const START = "https://en.wikipedia.org/wiki/PBA_season_50_draft";
  const MAX_PAGES = 80;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const abs = href => new URL(href, "https://en.wikipedia.org").href;
  const clean = s => (s || "").replace(/\s+/g, " ").trim();

  const isDraftPage = url =>
    /^https:\/\/en\.wikipedia\.org\/wiki\/(?:PBA_season_\d+_draft|\d{4}_PBA_draft)$/i.test(url);

  async function fetchDoc(url) {
    const html = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.text();
    });
    return new DOMParser().parseFromString(html, "text/html");
  }

  function getTitle(doc) {
    return clean(doc.querySelector("#firstHeading")?.textContent);
  }

  function findDraftLinks(doc) {
    return [...doc.querySelectorAll("a[href^='/wiki/']")]
      .map(a => abs(a.getAttribute("href")).split("#")[0])
      .filter(isDraftPage);
  }

  function headerMap(table) {
    const headerRow = [...table.querySelectorAll("tr")]
      .find(tr => clean(tr.textContent).match(/pick|player|team|school|club|pos/i));

    const headers = [...(headerRow?.children || [])].map(x =>
      clean(x.textContent).toLowerCase()
    );

    const find = (...names) =>
      headers.findIndex(h => names.some(n => h.includes(n)));

    return {
      pick: find("pick", "overall"),
      player: find("player"),
      pos: find("pos", "position"),
      country: find("country", "birth"),
      team: find("team"),
      school: find("school", "club", "college")
    };
  }

  function extractRoundName(table) {
    let el = table.previousElementSibling;
    while (el) {
      if (/^h[2-4]$/i.test(el.tagName)) {
        return clean(el.textContent.replace("[edit]", ""));
      }
      el = el.previousElementSibling;
    }
    return "";
  }

  function extractRowsFromPage(doc, url) {
    const title = getTitle(doc);
    const out = [];

    for (const table of doc.querySelectorAll("table.wikitable")) {
      const map = headerMap(table);
      if (map.pick < 0 || map.player < 0) continue;

      const roundName = extractRoundName(table);

      for (const tr of [...table.querySelectorAll("tr")].slice(1)) {
        const cells = [...tr.children].filter(x => ["TD", "TH"].includes(x.tagName));
        if (!cells.length) continue;

        const val = i => i >= 0 && cells[i] ? clean(cells[i].textContent) : "";

        const row = {
          draft_page: url,
          draft_year_or_season: title,
          round: roundName,
          pick: val(map.pick),
          player: val(map.player),
          pos: val(map.pos),
          country_of_birth: val(map.country),
          team: val(map.team),
          school_club_team: val(map.school)
        };

        if (row.pick && row.player && !/pick|player/i.test(row.player)) {
          out.push(row);
        }
      }
    }

    return out;
  }

  function downloadJSON(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: name
    });

    a.click();
    URL.revokeObjectURL(a.href);
  }

  const queue = [START];
  const seen = new Set();
  const allRows = [];
  const pages = [];
  const failures = [];

  while (queue.length && seen.size < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(url) || !isDraftPage(url)) continue;

    seen.add(url);

    try {
      console.log("Scraping:", url);
      const doc = await fetchDoc(url);

      const rows = extractRowsFromPage(doc, url);
      const links = findDraftLinks(doc).filter(x => !seen.has(x));

      pages.push({
        url,
        title: getTitle(doc),
        rows_found: rows.length,
        links_found: links
      });

      allRows.push(...rows);

      for (const link of links) {
        if (!seen.has(link) && !queue.includes(link)) queue.push(link);
      }

      console.log("Rows:", rows.length, "Next links:", links);
      await sleep(400);
    } catch (e) {
      failures.push({ url, error: String(e) });
      console.warn("FAILED:", url, e);
    }
  }

  const output = {
    source_start_page: START,
    scraped_at: new Date().toISOString(),
    total_pages_scraped: pages.length,
    total_rows: allRows.length,
    pages,
    rows: allRows,
    failures
  };

  console.log(output);
  console.table(allRows.slice(0, 50));

  downloadJSON("pba_draft_all_rows_single.json", output);
})();