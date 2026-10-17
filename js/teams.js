// ENDZONE KINGS — league data. Teams go by city (no real team names/logos) and every player is
// randomly generated, Retro Bowl style. Rosters are seeded so every device generates the same league.

// jersey, pants, helmet, trim (accent), num (number color)
const T = (city, abbr, jersey, pants, helmet, trim, num, conf) => ({ city, name: city, abbr, jersey, pants, helmet, trim, num, conf });
export const TEAMS = [
  T('Arizona', 'ARI', '#97233f', '#ffffff', '#ffffff', '#000000', '#ffffff', 'West'),
  T('Atlanta', 'ATL', '#a71930', '#000000', '#000000', '#a5acaf', '#ffffff', 'East'),
  T('Baltimore', 'BAL', '#241773', '#000000', '#000000', '#9e7c0c', '#ffffff', 'East'),
  T('Buffalo', 'BUF', '#00338d', '#ffffff', '#ffffff', '#c60c30', '#ffffff', 'East'),
  T('Carolina', 'CAR', '#0085ca', '#a5acaf', '#101820', '#101820', '#ffffff', 'East'),
  T('Chicago', 'CHI', '#0b162a', '#ffffff', '#0b162a', '#e64100', '#ffffff', 'West'),
  T('Cincinnati', 'CIN', '#fb4f14', '#000000', '#000000', '#000000', '#ffffff', 'East'),
  T('Cleveland', 'CLE', '#311d00', '#ffffff', '#ff3c00', '#ff3c00', '#ffffff', 'East'),
  T('Dallas', 'DAL', '#003594', '#b0b7bc', '#b0b7bc', '#ffffff', '#ffffff', 'East'),
  T('Denver', 'DEN', '#fb4f14', '#ffffff', '#002244', '#002244', '#ffffff', 'West'),
  T('Detroit', 'DET', '#0076b6', '#b0b7bc', '#b0b7bc', '#ffffff', '#ffffff', 'West'),
  T('Green Bay', 'GB', '#203731', '#ffb612', '#ffb612', '#ffb612', '#ffffff', 'West'),
  T('Houston', 'HOU', '#03202f', '#ffffff', '#03202f', '#a71930', '#ffffff', 'East'),
  T('Indianapolis', 'IND', '#002c5f', '#ffffff', '#ffffff', '#a2aaad', '#ffffff', 'East'),
  T('Jacksonville', 'JAX', '#006778', '#ffffff', '#101820', '#d7a22a', '#ffffff', 'East'),
  T('Kansas City', 'KC', '#e31837', '#ffffff', '#e31837', '#ffb81c', '#ffffff', 'West'),
  T('Las Vegas', 'LV', '#000000', '#a5acaf', '#a5acaf', '#a5acaf', '#ffffff', 'West'),
  T('Los Angeles', 'LA', '#003594', '#ffd100', '#003594', '#ffd100', '#ffffff', 'West'),
  T('San Diego', 'SD', '#0080c6', '#ffffff', '#0080c6', '#ffc20e', '#ffffff', 'West'),
  T('Miami', 'MIA', '#008e97', '#ffffff', '#ffffff', '#fc4c02', '#ffffff', 'East'),
  T('Minnesota', 'MIN', '#4f2683', '#ffffff', '#4f2683', '#ffc62f', '#ffffff', 'West'),
  T('Boston', 'BOS', '#002244', '#c60c30', '#b0b7bc', '#c60c30', '#ffffff', 'East'),
  T('New Orleans', 'NO', '#101820', '#d3bc8d', '#d3bc8d', '#d3bc8d', '#d3bc8d', 'West'),
  T('New York', 'NY', '#0b2265', '#a5acaf', '#0b2265', '#a71930', '#ffffff', 'East'),
  T('New Jersey', 'NJ', '#125740', '#ffffff', '#125740', '#ffffff', '#ffffff', 'East'),
  T('Philadelphia', 'PHI', '#004c54', '#a5acaf', '#004c54', '#a5acaf', '#ffffff', 'East'),
  T('Pittsburgh', 'PIT', '#101820', '#ffb612', '#101820', '#ffb612', '#ffb612', 'East'),
  T('San Francisco', 'SF', '#aa0000', '#b3995d', '#b3995d', '#b3995d', '#ffffff', 'West'),
  T('Seattle', 'SEA', '#002244', '#a5acaf', '#002244', '#69be28', '#ffffff', 'West'),
  T('Tampa Bay', 'TB', '#d50a0a', '#34302b', '#34302b', '#ff7900', '#ffffff', 'East'),
  T('Tennessee', 'TEN', '#0c2340', '#ffffff', '#0c2340', '#4b92db', '#ffffff', 'West'),
  T('Washington', 'WAS', '#5a1414', '#ffb612', '#5a1414', '#ffb612', '#ffffff', 'East'),
];

const FIRST = ['Marcus', 'Jalen', 'Tyler', 'Devin', 'Chris', 'Jordan', 'Darius', 'Andre', 'Malik', 'Josh', 'Caleb', 'Trey', 'Isaiah', 'Brandon', 'DeShawn', 'Cole', 'Logan', 'Zach', 'Tre', 'Mason',
  'Elijah', 'Jaylen', 'Nate', 'Kendall', 'Bryce', 'Austin', 'Derek', 'Xavier', 'Terrell', 'Cameron', 'Hunter', 'Quinton', 'Jamal', 'Owen', 'Dante', 'Rashad', 'Kyle', 'Luke', 'Damon', 'Micah',
  'Jace', 'Rodney', 'Victor', 'Garrett', 'Tavon', 'Keon', 'Blake', 'Corey', 'Desmond', 'Eli', 'Grant', 'Jabari', 'Kobe', 'Lamar', 'Myles', 'Noah', 'Omar', 'Pierce', 'Reggie', 'Shane',
  'Tariq', 'Wyatt', 'Zion', 'Amari', 'Bo', 'Cedric', 'Dillon', 'Emmanuel', 'Frankie', 'Gavin', 'Hakeem', 'Ivan', 'Jarvis', 'Kareem', 'Lance', 'Montez', 'Nico', 'Otis', 'Preston', 'Quincy'];
const LAST = ['Jackson', 'Williams', 'Johnson', 'Carter', 'Brooks', 'Mitchell', 'Harris', 'Coleman', 'Reed', 'Bennett', 'Hayes', 'Price', 'Sanders', 'Foster', 'Bryant', 'Griffin', 'Wallace', 'Barnes', 'Russell', 'Hamilton',
  'Graham', 'Sullivan', 'Wright', 'Turner', 'Parker', 'Collins', 'Stewart', 'Morris', 'Rogers', 'Cooper', 'Howard', 'Ward', 'Peterson', 'Gray', 'James', 'Watson', 'Kelly', 'Butler', 'Simmons', 'Jenkins',
  'Perry', 'Powell', 'Long', 'Patterson', 'Hughes', 'Flores', 'Washington', 'Henderson', 'Ross', 'Ellis', 'Holmes', 'Kennedy', 'Wells', 'Cole', 'Daniels', 'Payne', 'Pierce', 'Burke', 'Dixon', 'Fields',
  'Grant', 'Hart', 'Knox', 'Lane', 'Mack', 'Nash', 'Owens', 'Pruitt', 'Quarles', 'Rhodes', 'Shaw', 'Tate', 'Vance', 'Webb', 'Young', 'Zeller', 'Abbott', 'Boone', 'Crane', 'Dorsey',
  'Easley', 'Fontaine', 'Gaines', 'Holloway', 'Ingram', 'Jeter', 'Kincaid', 'Lockett', 'Mercer', 'Nwosu', 'Okafor', 'Pugh', 'Ramsey', 'Slater', 'Thorne', 'Underwood', 'Vaughn', 'Whitfield', 'Yates', 'Booker'];

export const POS_LABEL = { QB: 'QB', C: 'C', LG: 'LG', RG: 'RG', WR1: 'WR', WR2: 'WR', RB: 'HB', DL1: 'DE', DL2: 'DT', DL3: 'DE', LB: 'MLB', CB1: 'CB', CB2: 'CB', S: 'FS' };
const ORDER = ['QB', 'RB', 'WR1', 'WR2', 'C', 'LG', 'RG', 'DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S'];
const NUMS = { QB: [1, 19], RB: [20, 39], WR1: [10, 19], WR2: [80, 89], C: [50, 79], LG: [60, 79], RG: [60, 79], DL1: [90, 99], DL2: [90, 99], DL3: [90, 99], LB: [40, 59], CB1: [20, 39], CB2: [20, 39], S: [20, 49] };
// which ratings matter for each spot (used for OVR)
const KEYS = { QB: ['acc', 'arm'], RB: ['spd', 'elu'], WR1: ['spd', 'hands'], WR2: ['spd', 'hands'], C: ['blk'], LG: ['blk'], RG: ['blk'], DL1: ['rush', 'tkl'], DL2: ['rush', 'tkl'], DL3: ['rush', 'tkl'], LB: ['tkl', 'spd'], CB1: ['cov', 'spd'], CB2: ['cov', 'spd'], S: ['cov', 'tkl'] };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clampR = v => Math.max(40, Math.min(99, Math.round(v)));

const cache = {};
export function getRoster(ti) {
  if (cache[ti]) return cache[ti];
  const r = rng(9001 + ti * 7919);
  const tier = 66 + r() * 18; // team quality
  const used = new Set();
  const players = {};
  for (const role of ORDER) {
    const base = tier + (r() - 0.5) * 16;
    const rate = (k) => clampR(base + (r() - 0.45) * 14 + (KEYS[role].includes(k) ? 4 : -12));
    const p = {
      role, pos: POS_LABEL[role],
      first: FIRST[(r() * FIRST.length) | 0], last: LAST[(r() * LAST.length) | 0],
      spd: rate('spd'), hands: rate('hands'), acc: rate('acc'), arm: rate('arm'), elu: rate('elu'),
      blk: rate('blk'), rush: rate('rush'), tkl: rate('tkl'), cov: rate('cov'),
      age: 22 + ((r() * 12) | 0),
    };
    let [a, b] = NUMS[role], n;
    do { n = a + ((r() * (b - a + 1)) | 0); } while (used.has(n));
    used.add(n); p.num = n;
    p.ovr = clampR(KEYS[role].reduce((s, k) => s + p[k], 0) / KEYS[role].length + 2);
    p.name = `${p.first[0]}. ${p.last}`;
    players[role] = p;
  }
  const avg = (rs) => Math.round(rs.reduce((s, k) => s + players[k].ovr, 0) / rs.length);
  const off = avg(['QB', 'QB', 'RB', 'WR1', 'WR2', 'C', 'LG', 'RG']);
  const def = avg(['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S']);
  cache[ti] = { players, order: ORDER, off, def, ovr: Math.round((off + def) / 2) };
  return cache[ti];
}

export const teamOvr = ti => getRoster(ti).ovr;
