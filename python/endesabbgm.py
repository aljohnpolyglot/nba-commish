import json

# --- CONTEXTO LIGA ENDESA (ACB) ---
L_3P_AVG = 34.5
L_FG_AVG = 46.0
L_FT_AVG = 77.0

def calculate_ratings(player, hgt_in):
    s = player['stats'][0] if (player.get('stats') and len(player['stats']) > 0) else {}
    pos = player.get('pos', 'GF')
    gp = s.get('gp', 0)
    mpg = s.get('min', 0)
    ppg = s.get('pts', 0)
    apg = s.get('ast', 0)
    
    # ACB tiene menos partidos (34), así que confiamos con 8 partidos jugados
    gp_weight = min(1.0, gp / 8) 
    value_weight = min(1.0, mpg / 20)

    def clamp(val, low=0, high=100):
        return max(low, min(high, int(val)))

    def adjust_for_sample(calc_rating, floor=15):
        return (calc_rating * gp_weight) + (floor * (1 - gp_weight))

    # FISICO (NBA SCALE)
    hgt_rating = (hgt_in - 67) * 4.1
    
    if 'G' in pos:
        spd, stre = 52 + (s.get('stl', 0) * 10), 15 + (hgt_rating * 0.15)
    elif 'F' in pos:
        spd, stre = 38 + (s.get('stl', 0) * 5), 30 + (hgt_rating * 0.3)
    else: 
        spd, stre = 22 + (s.get('stl', 0) * 3), 52 + (hgt_rating * 0.5)

    # TIRO
    raw_tp = 50 + (s.get('tpp', 0) - L_3P_AVG) * 4.2
    tp = adjust_for_sample(raw_tp, floor=15)
    
    # En ACB anotar 20 puntos es de súper estrella
    raw_ins = 25 + (ppg * 2.2) + (s.get('fgp', 0) - L_FG_AVG)
    ins = adjust_for_sample(raw_ins, floor=20)
    
    ft = adjust_for_sample(50 + (s.get('ftp', 0) - L_FT_AVG) * 1.4, floor=20)

    # SKILLS
    pss = adjust_for_sample(apg * 11.5, floor=10)
    reb = adjust_for_sample((s.get('trb', 0) * 5.5) + (hgt_rating * 0.18), floor=15)
    drb = adjust_for_sample(28 + (apg * 3.5), floor=15)

    # IQ
    oiq = adjust_for_sample(22 + (ppg * 2.6) + (apg * 2.5), floor=15)
    diq = adjust_for_sample(22 + (s.get('stl', 0) * 16) + (s.get('blk', 0) * 22), floor=15)
    endu = (mpg / 25) * 95

    return {
        "hgt": clamp(hgt_rating), "stre": clamp(stre), "spd": clamp(spd),
        "jmp": clamp(spd * 0.82), "endu": clamp(endu), "ins": clamp(ins),
        "dnk": clamp(ins * 1.15 if 'C' in pos else ins * 0.7),
        "fg": clamp(ins * 0.85), "tp": clamp(tp), "ft": clamp(ft),
        "pss": clamp(pss), "reb": clamp(reb), "drb": clamp(drb),
        "oiq": clamp(oiq), "diq": clamp(diq)
    }

def convert_to_bbgm(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sorted_teams = sorted(data['teams'], key=lambda x: x['name'])
    id_map = {team['id']: i for i, team in enumerate(sorted_teams)}
    
    bbgm_teams = []
    for i, team in enumerate(sorted_teams):
        parts = team['name'].split(' ')
        bbgm_teams.append({
            "tid": i, "cid": i % 2, "did": i % 2,
            "region": parts[0], "name": " ".join(parts[1:]) if len(parts) > 1 else parts[0],
            "abbrev": parts[0][:3].upper(), "imgURL": team.get('logoUrl', "")
        })

    bbgm_players = []
    for p in data['players']:
        raw_name = p['name'].replace('\xa0', ' ').replace('\n', ' ')
        parts = [x.strip() for x in raw_name.split() if x.strip()]
        first, last = (parts[-1], " ".join(parts[:-1])) if len(parts) >= 2 else (parts[0], "")

        # ALTURA EN PULGADAS (FIX DUMBMATTER)
        hgt_cm = p.get('hgt', 195)
        hgt_in = int(round(hgt_cm / 2.54))

        bbgm_players.append({
            "firstName": first, "lastName": last,
            "tid": id_map.get(p.get('tid'), -1),
            "pos": p['pos'] if p.get('pos') and p['pos'] != '-' else "GF",
            "age": p['age'], "hgt": hgt_in,
            "ratings": [calculate_ratings(p, hgt_in)],
            "imgURL": p.get('imgURL', ""),
            "college": "",
            "born": {"loc": p['born']['loc'], "year": p['born']['year']}
        })

    output_json = {
        "version": 66, "startingSeason": 2025,
        "confs": [{"cid": 0, "name": "East"}, {"cid": 1, "name": "West"}],
        "divs": [{"did": 0, "cid": 0, "name": "A"}, {"did": 1, "cid": 0, "name": "B"}],
        "teams": bbgm_teams, "players": bbgm_players
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_json, f, indent=2)
    print(f"✅ Roster ACB 25-26 filtrado y calibrado con éxito.")

# Ejecutar
convert_to_bbgm('liga_endesa_final.json', 'bbgm_spain_liga_endesa.json')