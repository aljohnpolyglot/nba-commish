import json

# --- LEAGUE CONTEXT ---
L_3P_AVG = 33.7 
L_FG_AVG = 44.8
L_FT_AVG = 73.5

def calculate_ratings(player, hgt_in):
    s = player['stats'][0] if (player.get('stats') and len(player['stats']) > 0) else {}
    pos = player.get('pos', 'GF')
    gp = s.get('gp', 0)
    mpg = s.get('min', 0)
    ppg = s.get('pts', 0)
    apg = s.get('ast', 0)
    
    # Games Played Weighting
    gp_weight = min(1.0, gp / 20) 
    value_weight = min(1.0, mpg / 22)

    def clamp(val, low=0, high=100):
        return max(low, min(high, int(val)))

    def adjust_for_sample(calc_rating, floor=15):
        return (calc_rating * gp_weight) + (floor * (1 - gp_weight))

    # --- 1. PHYSICALS (Using Inches) ---
    # Formula: (Inches - 67) * 4.1. 
    # This ensures 6'9" (81in) = 57 and 5'8" (68in) = 4
    hgt_rating = (hgt_in - 67) * 4.1
    
    if 'G' in pos:
        spd = 52 + (s.get('stl', 0) * 10) + (value_weight * 10)
        stre = 15 + (hgt_rating * 0.15) + (value_weight * 10)
    elif 'F' in pos:
        spd = 38 + (s.get('stl', 0) * 5) + (value_weight * 10)
        stre = 30 + (hgt_rating * 0.3) + (value_weight * 15)
    else: # Centers
        spd = 22 + (s.get('stl', 0) * 3) + (value_weight * 5)
        stre = 52 + (hgt_rating * 0.5) + (value_weight * 20)

    # --- 2. SHOOTING (33.7% = 50 Rating) ---
    tp_pct = s.get('tpp', 0)
    raw_tp = 50 + (tp_pct - L_3P_AVG) * 4.2
    tp = adjust_for_sample(raw_tp, floor=15)
    raw_ins = 22 + (ppg * 1.7) + (s.get('fgp', 0) - L_FG_AVG)
    ins = adjust_for_sample(raw_ins, floor=20)
    ft = adjust_for_sample(50 + (s.get('ftp', 0) - L_FT_AVG) * 1.4, floor=20)

    # --- 3. SKILLS ---
    pss = adjust_for_sample(apg * 10.5, floor=10)
    reb = adjust_for_sample((s.get('trb', 0) * 5.2) + (hgt_rating * 0.18), floor=15)
    drb = adjust_for_sample(28 + (apg * 3.5), floor=15)

    # --- 4. IQ ---
    raw_oiq = 22 + (ppg * 2.4) + (apg * 2)
    oiq = adjust_for_sample(raw_oiq, floor=15)
    raw_diq = 22 + (s.get('stl', 0) * 16) + (s.get('blk', 0) * 22)
    diq = adjust_for_sample(raw_diq, floor=15)

    endu = (mpg / 30) * 95

    return {
        "hgt": clamp(hgt_rating), "stre": clamp(stre), "spd": clamp(spd),
        "jmp": clamp(spd * 0.82), "endu": clamp(endu), "ins": clamp(ins),
        "dnk": clamp(ins * 1.15 if 'C' in pos else ins * 0.7),
        "fg": clamp(ins * 0.85), "tp": clamp(tp), "ft": clamp(ft),
        "pss": clamp(pss), "reb": clamp(reb), "drb": clamp(drb),
        "oiq": clamp(oiq), "diq": clamp(diq)
    }

def convert_to_bbgm(input_file, output_file):
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: Could not find {input_file}")
        return

    # Teams Sorting
    sorted_teams = sorted(data['teams'], key=lambda x: x['name'])
    id_map = {team['id']: i for i, team in enumerate(sorted_teams)}
    
    bbgm_teams = []
    for i, team in enumerate(sorted_teams):
        parts = team['name'].split(' ')
        region = parts[0]
        name = " ".join(parts[1:]) if len(parts) > 1 else region
        bbgm_teams.append({
            "tid": i, "cid": 0 if i < 14 else 1, "did": i // 7,
            "region": region, "name": name,
            "abbrev": region[:3].upper(), "imgURL": team.get('logoUrl', "")
        })

    # Players Processing
    bbgm_players = []
    for p in data['players']:
        raw_name = p['name'].replace('\xa0', ' ').replace('\n', ' ')
        parts = [x.strip() for x in raw_name.split() if x.strip()]
        if len(parts) >= 2:
            first, last = parts[-1], " ".join(parts[:-1]) 
        else:
            first, last = parts[0], ""

        # --- THE HEIGHT FIX ---
        hgt_cm = p.get('hgt', 190)
        # Convert to integer inches for the BBGM attribute
        hgt_in = int(round(hgt_cm / 2.54))

        # Birth Year Fix
        current_age = p.get('age', 25)
        calc_birth_year = 2026 - current_age

        bbgm_players.append({
            "firstName": first,
            "lastName": last,
            "tid": id_map.get(p.get('tid'), -1),
            "pos": p['pos'] if p.get('pos') and p['pos'] != '-' else "GF",
            "age": current_age,
            "hgt": hgt_in, # NOW IN INCHES (e.g., 82 instead of 208)
            "ratings": [calculate_ratings(p, hgt_in)],
            "imgURL": p.get('imgURL', ""),
            "notes": p.get('notes', ""),
            "college": "", # Removes random college generation
            "born": {"loc": p['born']['loc'], "year": calc_birth_year}
        })

    output_json = {
        "version": 66,
        "startingSeason": 2025,
        "confs": [{"cid": 0, "name": "East"}, {"cid": 1, "name": "West"}],
        "divs": [{"did": 0, "cid": 0, "name": "A"}, {"did": 1, "cid": 0, "name": "B"}, 
                 {"did": 2, "cid": 1, "name": "C"}, {"did": 3, "cid": 1, "name": "D"}],
        "teams": bbgm_teams,
        "players": bbgm_players
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_json, f, indent=2)
    
    print(f"✅ NO MORE GIANTS! File processed: {input_file}")
    print(f"📏 Tim Schneider (208cm) is now {int(round(208/2.54))} inches in the JSON.")

# Run
convert_to_bbgm('b1_data_fixed (1).json', 'bbgm_japan_final.json')