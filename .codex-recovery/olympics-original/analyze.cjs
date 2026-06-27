const fs = require('fs');

fetch('https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json')
  .then(res => res.json())
  .then(data => {
    const players = data.players.filter(p => p.ratings && p.ratings.length > 0)
      .map(p => {
         const lat = p.ratings[p.ratings.length - 1];
         return {
           name: (p.firstName || p.name) + ' ' + (p.lastName || ''),
           pss: lat.pss || 0,
           str: lat.stre || 0,
           hgt: lat.hgt || 0,
           ovr: lat.ovr || 0
         }
      });
    
    // log first 3 objects
    console.log("FIRST 3 P:");
    console.log(data.players.slice(0,3).map(p => ({ first: p.firstName, last: p.lastName, ratings: p.ratings })));

    const results = players.map(p => {
       const score = p.pss * 0.60 + p.str * 0.25 + p.hgt * 0.15;
       const baseDistance = 52.0 + (score / 99) * 26.0;
       const finalDistance = baseDistance * 0.92;
       return { name: p.name, distance: finalDistance, ovr: p.ovr };
    }).sort((a,b) => b.distance - a.distance);
    
    console.log("JAVELIN TOP 10:");
    results.slice(0,10).forEach(r => console.log(`${r.name}: ${r.distance.toFixed(2)}m (OVR: ${r.ovr})`));
  })
  .catch(err => console.error(err));
