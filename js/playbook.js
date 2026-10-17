// ENDZONE KINGS — playbook data: formations, plays, coverages, team styles, custom plays.
// Coordinates are offense-relative [lateral, depth]: depth > 0 is downfield, lateral < 0 shows on the left of the screen.

export const FORMS = {
  gun:    { name: 'Shotgun',     QB: [0, -4.5], RB: [1.6, -4.9], WR1: [-13, -0.6], WR2: [13, -0.6] },
  trips:  { name: 'Gun Trips',   QB: [0, -4.5], RB: [1.6, -4.9], WR1: [-15, -0.6], WR2: [-8, -1.3] },
  single: { name: 'Singleback',  QB: [0, -1.2], RB: [0, -5.6], WR1: [-13, -0.6], WR2: [12, -0.6] },
  punt:   { name: 'Punt',        QB: [0, -12], RB: [2.5, -5], WR1: [-20, -0.6], WR2: [20, -0.6] },
  fg:     { name: 'Field Goal',  QB: [0, -7], RB: [1.5, -9.5], WR1: [-5, -1], WR2: [5, -1] },
  pistol: { name: 'Pistol',      QB: [0, -3.2], RB: [0, -6.4], WR1: [-13, -0.6], WR2: [13, -0.6] },
  iform:  { name: 'I-Form',      QB: [0, -1.2], RB: [0, -7.2], WR1: [-13, -0.6], WR2: [11, -0.6] },
  empty:  { name: 'Empty',       QB: [0, -4.5], RB: [17, -0.8], WR1: [-14, -0.6], WR2: [-7.5, -1.3] },
  bunch:  { name: 'Gun Bunch',   QB: [0, -4.5], RB: [-1.6, -4.9], WR1: [8, -0.6], WR2: [10, -1.8] },
  spread: { name: 'Spread',      QB: [0, -4.5], RB: [-1.6, -4.9], WR1: [-17, -0.6], WR2: [17, -0.6] },
};
export const PLAY_FORMS = ['gun', 'trips', 'single', 'pistol', 'iform', 'empty', 'bunch', 'spread'];
export const LINE = { C: [0, -0.9], LG: [-1.75, -1.0], RG: [1.75, -1.0] };

export const OFF_CATS = ['Quick', 'Deep', 'Run', 'Play Action', 'Screen', 'Special'];
export const DEF_CATS = ['Man', 'Zone', 'Blitz'];

const P = (o) => ({ type: 'pass', drop: -7, ...o });
export const OFF_PLAYS = [
  // ---- quick
  P({ id: 'slants', cat: 'Quick', form: 'gun', name: 'Quick Slants', tip: 'Fast inside cuts, beats the blitz',
    routes: { WR1: [[-13, 3], [-9, 9], [-3, 17]], WR2: [[13, 3], [9, 9], [3, 17]], RB: [[5, -3], [13, 0], [21, 2]] } }),
  P({ id: 'curlflat', cat: 'Quick', form: 'gun', name: 'Curl Flat', tip: 'Safe chunk yards vs zone',
    routes: { WR1: [[-13, 11], [-15, 9.5, 'stop']], WR2: [[13, 7], [24, 7.5, 'stop']], RB: [[-6, -2], [-14, 1], [-22, 2]] } }),
  P({ id: 'mesh', cat: 'Quick', form: 'gun', name: 'Mesh', tip: 'Crossers rub off man coverage',
    routes: { WR1: [[-13, 2], [-6, 5], [8, 6], [20, 7]], WR2: [[13, 2], [6, 4], [-8, 5], [-20, 6]], RB: [[4, -3], [2, 4, 'stop']] } }),
  P({ id: 'stick', cat: 'Quick', form: 'trips', name: 'Trips Stick', tip: 'Slot sits at the sticks',
    routes: { WR1: [[-15, 5], [-17, 6, 'stop']], WR2: [[-8, 5], [-7.5, 5.5, 'stop']], RB: [[5, -3], [12, 0], [18, 1]] } }),
  // ---- deep
  P({ id: 'postdig', cat: 'Deep', form: 'gun', name: 'Post Dig', tip: 'Deep shot + crosser',
    routes: { WR1: [[-13, 9], [-7, 26], [-2, 45]], WR2: [[13, 11], [3, 12], [-14, 13]], RB: [[2, 0], [2.5, 4, 'stop']] } }),
  P({ id: 'verts', cat: 'Deep', form: 'gun', name: 'Four Verts', tip: 'Go deep, needs time', drop: -8,
    routes: { WR1: [[-13, 50]], WR2: [[13, 50]], RB: [[-1, 0], [-1.5, 5, 'stop']] } }),
  P({ id: 'smash', cat: 'Deep', form: 'gun', name: 'Smash', tip: 'Corner over a hitch, kills Cover 2',
    routes: { WR1: [[-13, 10], [-20, 20], [-22, 32]], WR2: [[13, 6], [13, 5, 'stop']], RB: [[5, -3], [13, 0], [20, 2]] } }),
  P({ id: 'flood', cat: 'Deep', form: 'trips', name: 'Trips Flood', tip: 'Three levels to one side', drop: -8,
    routes: { WR1: [[-15, 45]], WR2: [[-8, 11], [-20, 12]], RB: [[-4, -3], [-12, 0], [-18, 1]] } }),
  // ---- run
  { id: 'dive', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'HB Dive', tip: 'Downhill up the middle', hand: 0.45,
    routes: { RB: [[0.7, -3], [0.8, 0.5]] } },
  { id: 'toss', cat: 'Run', form: 'single', type: 'run', name: 'HB Toss', tip: 'Bounce it to the edge', pitch: 0.32,
    routes: { RB: [[4, -6], [11, -3], [13, 0.5]] } },
  { id: 'counter', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'HB Stretch', tip: 'Outside zone, cut it up', hand: 0.45,
    routes: { RB: [[-1.1, -3.4], [-6, -2.8], [-10, 0.5]] } },
  { id: 'draw', inside: true, cat: 'Run', form: 'gun', type: 'run', name: 'HB Draw', tip: 'Fake pass, hand it late', hand: 0.85, qbDrop: -6,
    routes: { RB: [[1.4, -4.6], [0.6, -4.4], [0.6, 1]] } },
  { id: 'sneak', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'QB Sneak', tip: 'Short yardage push', qbRun: true,
    routes: { QB: [[0.6, 0.5], [0.6, 3]] } },
  // ---- play action
  P({ id: 'paboot', cat: 'Play Action', form: 'single', name: 'PA Boot', tip: 'Fake the dive, roll out', pa: 0.65, qbPath: [[3, -5], [9, -5]],
    routes: { WR1: [[-13, 8], [0, 12], [14, 14]], WR2: [[12, 10], [19, 22]], RB: [[0.8, -3], [1, -1], [8, 0], [16, 1]] } }),
  P({ id: 'padeep', cat: 'Play Action', form: 'single', name: 'PA Deep Post', tip: 'Sell the run, go over the top', pa: 0.65, drop: -8,
    routes: { WR1: [[-13, 10], [-5, 28], [0, 45]], WR2: [[12, 45]], RB: [[0.8, -3], [0.8, -1.5, 'stop']] }, block: ['RB'] }),
  // ---- screens
  P({ id: 'rbscreen', cat: 'Screen', form: 'gun', name: 'HB Screen', tip: 'Let them rush, dump it off', screen: 1.1, drop: -8,
    routes: { WR1: [[-13, 30]], WR2: [[13, 30]], RB: [[5, -4], [9, -4.5, 'stop']] } }),
  P({ id: 'bubble', cat: 'Screen', form: 'trips', name: 'Bubble Screen', tip: 'Quick throw to the slot, WR blocks', drop: -5,
    routes: { WR2: [[-10, -2.5], [-12, -2.5, 'stop']], RB: [[5, -3], [10, -1, 'stop']] }, block: ['WR1'] }),
  // ---- more quick game
  P({ id: 'hitches', cat: 'Quick', form: 'spread', name: 'Spread Hitches', tip: 'Six yards and turn around', drop: -5,
    routes: { WR1: [[-17, 6], [-16.5, 5, 'stop']], WR2: [[17, 6], [16.5, 5, 'stop']], RB: [[-5, -3], [-3, 3, 'stop']] } }),
  P({ id: 'quickouts', cat: 'Quick', form: 'gun', name: 'Speed Outs', tip: 'Beat soft corners to the sideline', drop: -5,
    routes: { WR1: [[-13, 5], [-21, 5]], WR2: [[13, 5], [21, 5]], RB: [[3, -2], [3, 3, 'stop']] } }),
  P({ id: 'drive', cat: 'Quick', form: 'gun', name: 'Drive', tip: 'Shallow cross under a dig',
    routes: { WR1: [[-13, 2], [-4, 3], [10, 4], [22, 5]], WR2: [[13, 11], [4, 12], [-10, 12]], RB: [[5, -3], [12, 0]] } }),
  P({ id: 'spacing', cat: 'Quick', form: 'bunch', name: 'Bunch Spacing', tip: 'Three short options, spread the zone',
    routes: { WR1: [[8, 5], [7.5, 5, 'stop']], WR2: [[10, 2], [17, 3, 'stop']], RB: [[-4, -2], [-3, 5, 'stop']] } }),
  P({ id: 'whip', cat: 'Quick', form: 'trips', name: 'Slot Whip', tip: 'Slot fakes in, whips back out',
    routes: { WR1: [[-15, 12], [-13, 10, 'stop']], WR2: [[-8, 4], [-4, 5], [-10, 5]], RB: [[5, -3], [13, 1]] } }),
  P({ id: 'rbangle', cat: 'Quick', form: 'gun', name: 'HB Angle', tip: 'Back breaks inside on a linebacker',
    routes: { WR1: [[-13, 14]], WR2: [[13, 14]], RB: [[5, -3], [7, 1], [2, 5]] } }),
  P({ id: 'emptyslant', cat: 'Quick', form: 'empty', name: 'Empty Slants', tip: 'Five out, ball out fast', drop: -5,
    routes: { WR1: [[-14, 2], [-9, 8]], WR2: [[-7.5, 2], [-2, 6]], RB: [[17, 2], [11, 8]] } }),
  // ---- more deep shots
  P({ id: 'dagger', cat: 'Deep', form: 'trips', name: 'Dagger', tip: 'Seam clears it out, dig sits under', drop: -8,
    routes: { WR1: [[-15, 14], [-3, 15]], WR2: [[-8, 30], [-6, 45]], RB: [[5, -3], [12, 0]] } }),
  P({ id: 'sluggo', cat: 'Deep', form: 'spread', name: 'Sluggo', tip: 'Slant and go, sell the slant', drop: -8,
    routes: { WR1: [[-17, 3], [-14, 7], [-15, 18], [-15, 45]], WR2: [[17, 8], [11, 10, 'stop']], RB: [[-1, 0], [-1.5, 4, 'stop']] } }),
  P({ id: 'yankee', cat: 'Deep', form: 'single', name: 'Yankee', tip: 'Deep post plus a deep over route', pa: 0.6, drop: -8,
    routes: { WR1: [[-13, 12], [-6, 30], [-2, 45]], WR2: [[12, 6], [4, 14], [-14, 24]], RB: [[0.8, -3], [0.8, -1.5, 'stop']] }, block: ['RB'] }),
  P({ id: 'wheelpost', cat: 'Deep', form: 'gun', name: 'Wheel Post', tip: 'HB wheel up the sideline under a post', drop: -8,
    routes: { WR1: [[-13, 12], [-6, 28], [-3, 42]], WR2: [[13, 8], [7, 9, 'stop']], RB: [[8, -2], [13, 4], [14, 30]] } }),
  P({ id: 'bunchcorner', cat: 'Deep', form: 'bunch', name: 'Bunch Corner', tip: 'Corner over a flat, high-low the corner',
    routes: { WR1: [[8, 10], [16, 22], [20, 30]], WR2: [[10, 1], [20, 2, 'stop']], RB: [[-4, -2], [-12, 1]] } }),
  P({ id: 'goout', cat: 'Deep', form: 'spread', name: 'Go Comeback', tip: 'Push vertical, break back to the sideline', drop: -8,
    routes: { WR1: [[-17, 16], [-19, 13, 'stop']], WR2: [[17, 45]], RB: [[-5, -3], [-12, 1]] } }),
  P({ id: 'emptyverts', cat: 'Deep', form: 'empty', name: 'Empty Verts', tip: 'Three verticals, nobody stays in', drop: -8,
    routes: { WR1: [[-14, 45]], WR2: [[-7.5, 20], [-5, 45]], RB: [[17, 45]] } }),
  // ---- more runs
  { id: 'power', inside: true, cat: 'Run', form: 'pistol', type: 'run', name: 'Pistol Power', tip: 'Downhill between the guards', hand: 0.5,
    routes: { RB: [[0.2, -4.5], [1.2, -1], [1.4, 2]] } },
  { id: 'iso', inside: true, cat: 'Run', form: 'iform', type: 'run', name: 'I-Form Iso', tip: 'Run right behind the center', hand: 0.55,
    routes: { RB: [[0, -4], [0.3, 0.5]] } },
  { id: 'sweep', cat: 'Run', form: 'iform', type: 'run', name: 'Student Body Sweep', tip: 'Pitch it and race the edge', pitch: 0.32,
    routes: { RB: [[-6, -7], [-13, -4], [-15, 0.5]] } },
  { id: 'readopt', cat: 'Run', form: 'pistol', type: 'run', name: 'QB Keeper', tip: 'Fake the handoff, QB keeps it outside', qbRun: true,
    routes: { QB: [[-1, -3.4], [-6, -3], [-9, 1]], RB: [[1.2, -4.5], [2, 0], [2, 3]] } },
  { id: 'qbdraw', inside: true, cat: 'Run', form: 'spread', type: 'run', name: 'QB Draw', tip: 'Show pass, then QB runs up the gut', qbRun: true,
    routes: { QB: [[0, -6], [0.5, -5.5], [0.8, 2]] } },
  { id: 'trap', inside: true, cat: 'Run', form: 'single', type: 'run', name: 'HB Trap', tip: 'Let the tackle in, run past him', hand: 0.5,
    routes: { RB: [[-0.8, -3], [-1, 0.5]] } },
  { id: 'pinpull', cat: 'Run', form: 'gun', type: 'run', name: 'Outside Zone', tip: 'Press the edge, cut back if it closes', hand: 0.4,
    routes: { RB: [[3, -4.5], [8, -3], [12, 0.5]] } },
  // ---- more play action
  P({ id: 'pacross', cat: 'Play Action', form: 'iform', name: 'PA Crosser', tip: 'Fake iso, crosser behind the linebackers', pa: 0.7,
    routes: { WR1: [[-13, 10], [0, 14], [14, 16]], WR2: [[11, 40]], RB: [[0, -4], [0, -2, 'stop']] }, block: ['RB'] }),
  P({ id: 'paflood', cat: 'Play Action', form: 'pistol', name: 'PA Flood', tip: 'Sell the run, three levels to the right', pa: 0.65, qbPath: [[4, -5], [8, -5]],
    routes: { WR1: [[-13, 10], [2, 14], [14, 18]], WR2: [[13, 40]], RB: [[0.6, -4], [6, -2], [13, 1]] } }),
  P({ id: 'pashot', cat: 'Play Action', form: 'iform', name: 'PA Max Protect', tip: 'Two deep shots, everyone else blocks', pa: 0.7, drop: -9,
    routes: { WR1: [[-13, 45]], WR2: [[11, 12], [4, 28], [0, 45]] }, block: ['RB'] }),
  // ---- more screens
  P({ id: 'tunnel', cat: 'Screen', form: 'spread', name: 'WR Tunnel Screen', tip: 'Receiver comes back inside behind blockers', screen: 0.7, drop: -5,
    routes: { WR1: [[-15, 0.5], [-10, -1.5, 'stop']], WR2: [[17, 20]], RB: [[3, -2], [3, 2, 'stop']] } }),
  P({ id: 'slipscreen', cat: 'Screen', form: 'pistol', name: 'Middle Screen', tip: 'Back leaks out behind the line', screen: 1.0, drop: -8,
    routes: { WR1: [[-13, 25]], WR2: [[13, 25]], RB: [[0.5, -3], [-1, -1.5, 'stop']] } }),
  // ---- special (fakes)
  { id: 'fakepunt', cat: 'Special', form: 'punt', type: 'run', name: 'Fake Punt', tip: 'Punter takes off', qbRun: true,
    routes: { QB: [[6, -9], [11, -2], [12, 8]] } },
  P({ id: 'fakefg', cat: 'Special', form: 'fg', name: 'Fake FG', tip: 'Holder throws it', drop: -8,
    routes: { WR2: [[5, -1], [8, 5], [9, 20]], WR1: [[-5, -1], [-12, 2], [-18, 4]], RB: [[3, -8], [10, -4], [14, 0]] } }),
];
export const KICK_PLAYS = [
  { id: 'fg', cat: 'Special', name: 'Field Goal', tip: 'Kick it through' },
  { id: 'punt', cat: 'Special', name: 'Punt', tip: 'Flip the field' },
  { id: 'xp', cat: 'Special', name: 'Extra Point', tip: 'Kick for 1' },
];

// defense: man {role: targetRole}, zone {role: [lateral, depth]}, rush [roles], spy [roles]. DL rush unless zoned.
export const DEF_PLAYS = [
  { id: 'cover1', cat: 'Man', name: 'Cover 1 Man', tip: 'Tight man, safety deep', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, deep: ['S'] },
  { id: 'manspy', cat: 'Man', name: 'Man QB Spy', tip: 'LB mirrors the QB', man: { CB1: 'WR1', CB2: 'WR2', S: 'RB' }, spy: ['LB'] },
  { id: 'press', cat: 'Man', name: 'Press Man', tip: 'Jam at the line, risky deep', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, deep: ['S'], press: true },
  { id: 'cover2', cat: 'Zone', name: 'Cover 2', tip: 'Two deep halves, flats covered', zone: { CB1: [-12, 4], CB2: [12, 4], LB: [0, 8], S: [0, 18] } },
  { id: 'cover3', cat: 'Zone', name: 'Cover 3', tip: 'Deep thirds, keep it in front', zone: { CB1: [-13, 15], CB2: [13, 15], S: [0, 19], LB: [0, 7] } },
  { id: 'cover4', cat: 'Zone', name: 'Cover 4', tip: 'Quarters, stops the deep ball', zone: { CB1: [-12, 21], CB2: [12, 21], S: [0, 24], LB: [0, 8] } },
  { id: 'prevent', cat: 'Zone', name: 'Prevent', tip: 'Give up short, never deep', zone: { CB1: [-14, 28], CB2: [14, 28], S: [0, 34], LB: [0, 13], DL2: [0, 7] } },
  { id: 'cover0', cat: 'Blitz', name: 'Cover 0 Blitz', tip: 'Everybody comes, no help', man: { CB1: 'WR1', CB2: 'WR2', S: 'RB' }, rush: ['LB'], press: true },
  { id: 'sblitz', cat: 'Blitz', name: 'Safety Blitz', tip: 'Surprise heat off the edge', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, rush: ['S'] },
  { id: 'firezone', cat: 'Blitz', name: 'Fire Zone', tip: 'LB blitzes, DT drops', zone: { CB1: [-13, 15], CB2: [13, 15], S: [0, 19], DL2: [0, 6] }, rush: ['LB'] },
  { id: 'robber', cat: 'Man', name: 'Cover 1 Robber', tip: 'Man outside, safety lurks for crossers', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, zone: { S: [0, 10] } },
  { id: 'banjo', cat: 'Man', name: 'Bracket WR1', tip: 'Double the best receiver, man elsewhere', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, zone: { S: [-9, 16] } },
  { id: 'spy3', cat: 'Man', name: 'Rush 3 Spy', tip: 'Three rush, tackle spies the QB', man: { CB1: 'WR1', CB2: 'WR2', LB: 'RB' }, spy: ['DL2'], deep: ['S'] },
  { id: 'tampa2', cat: 'Zone', name: 'Tampa 2', tip: 'Mike runs the deep middle', zone: { CB1: [-12, 4], CB2: [12, 4], LB: [0, 15], S: [0, 21] } },
  { id: 'cover3buzz', cat: 'Zone', name: 'Cover 3 Buzz', tip: 'Safety drops to the hook, corners bail', zone: { CB1: [-13, 16], CB2: [13, 16], S: [-5, 9], LB: [3, 7] } },
  { id: 'cover6', cat: 'Zone', name: 'Cover 6', tip: 'Quarters to one side, halves to the other', zone: { CB1: [-12, 20], CB2: [12, 5], S: [3, 19], LB: [0, 8] } },
  { id: 'goalline', cat: 'Zone', name: 'Goal Line', tip: 'Everyone tight, stop the push', zone: { CB1: [-9, 3], CB2: [9, 3], S: [0, 5] }, rush: ['LB'] },
  { id: 'nickelblitz', cat: 'Blitz', name: 'Nickel Blitz', tip: 'Corner comes off the edge', man: { CB1: 'WR1', S: 'WR2', LB: 'RB' }, rush: ['CB2'] },
  { id: 'doublea', cat: 'Blitz', name: 'Double A Gap', tip: 'Linebacker and safety shoot the middle', man: { CB1: 'WR1', CB2: 'WR2' }, rush: ['LB', 'S'], press: true },
  { id: 'zoneblitz', cat: 'Blitz', name: 'Zone Blitz', tip: 'End drops into coverage, safety blitzes', zone: { CB1: [-13, 15], CB2: [13, 15], DL3: [6, 6], LB: [0, 12] }, rush: ['S'] },
];

// ---------------- team playbook styles ----------------
export const OFF_STYLES = {
  air:      { name: 'Air Raid',       plays: ['slants', 'curlflat', 'mesh', 'stick', 'hitches', 'quickouts', 'drive', 'spacing', 'emptyslant', 'rbangle', 'postdig', 'verts', 'smash', 'flood', 'dagger', 'sluggo', 'emptyverts', 'bunchcorner', 'goout', 'draw', 'qbdraw', 'toss', 'pinpull', 'bubble', 'rbscreen', 'tunnel', 'padeep', 'paflood'], weight: { Quick: 3, Deep: 3, Run: 1, 'Play Action': 1, Screen: 1.5 } },
  ground:   { name: 'Smashmouth',     plays: ['dive', 'toss', 'counter', 'sneak', 'draw', 'power', 'iso', 'sweep', 'trap', 'readopt', 'pinpull', 'paboot', 'padeep', 'pacross', 'paflood', 'pashot', 'yankee', 'slants', 'curlflat', 'hitches', 'whip', 'smash', 'wheelpost', 'rbscreen', 'slipscreen'], weight: { Quick: 1.2, Deep: 0.8, Run: 4, 'Play Action': 2, Screen: 0.8 } },
  west:     { name: 'West Coast',     plays: ['slants', 'curlflat', 'mesh', 'stick', 'drive', 'spacing', 'whip', 'rbangle', 'quickouts', 'smash', 'postdig', 'dagger', 'wheelpost', 'bunchcorner', 'dive', 'toss', 'counter', 'pinpull', 'power', 'paboot', 'pacross', 'rbscreen', 'bubble', 'tunnel', 'slipscreen'], weight: { Quick: 3.5, Deep: 1.2, Run: 2, 'Play Action': 1.5, Screen: 1.5 } },
  balanced: { name: 'Balanced',       plays: ['slants', 'curlflat', 'mesh', 'hitches', 'drive', 'spacing', 'emptyslant', 'postdig', 'verts', 'flood', 'dagger', 'sluggo', 'yankee', 'goout', 'dive', 'toss', 'counter', 'draw', 'sneak', 'power', 'iso', 'sweep', 'readopt', 'qbdraw', 'trap', 'paboot', 'padeep', 'pacross', 'pashot', 'rbscreen', 'tunnel', 'bubble'], weight: { Quick: 2, Deep: 1.5, Run: 2.5, 'Play Action': 1.2, Screen: 1 } },
};
export const DEF_STYLES = {
  pressure: { name: 'Pressure 4-3', plays: ['cover1', 'press', 'robber', 'manspy', 'cover3', 'cover2', 'cover3buzz', 'goalline', 'cover0', 'sblitz', 'firezone', 'nickelblitz', 'doublea', 'zoneblitz'], weight: { Man: 2, Zone: 1.5, Blitz: 3 } },
  zone:     { name: 'Bend Don’t Break', plays: ['cover2', 'cover3', 'cover4', 'tampa2', 'cover3buzz', 'cover6', 'prevent', 'goalline', 'cover1', 'robber', 'spy3', 'firezone', 'zoneblitz'], weight: { Man: 1, Zone: 4, Blitz: 1 } },
  lockdown: { name: 'Lockdown Man', plays: ['cover1', 'press', 'manspy', 'robber', 'banjo', 'spy3', 'cover3', 'cover2', 'tampa2', 'goalline', 'cover0', 'sblitz', 'nickelblitz', 'doublea'], weight: { Man: 4, Zone: 1.5, Blitz: 1.5 } },
};
const OFF_STYLE_KEYS = Object.keys(OFF_STYLES), DEF_STYLE_KEYS = Object.keys(DEF_STYLES);
const SIG_NAMES = ['Special', 'Express', 'Heater', 'Thunder', 'Dagger', 'Haymaker', 'Lightning', 'Crown'];

function h32(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return (n ^ (n >>> 16)) >>> 0; }

export function teamStyle(ti) {
  const h = h32(ti + 17);
  return { off: OFF_STYLE_KEYS[h % OFF_STYLE_KEYS.length], def: DEF_STYLE_KEYS[(h >>> 8) % DEF_STYLE_KEYS.length], sig: SIG_NAMES[(h >>> 16) % SIG_NAMES.length] };
}

// each team's signature play: a mirrored / re-depthed version of a play from its style
export function signaturePlay(ti, abbr, city) {
  const st = teamStyle(ti), list = OFF_STYLES[st.off].plays.map(id => OFF_PLAYS.find(p => p.id === id)).filter(p => p.type === 'pass' && p.cat !== 'Screen');
  const base = list[h32(ti * 7 + 3) % list.length];
  const flip = h32(ti) % 2 ? -1 : 1, deep = 1 + ((h32(ti * 13) % 5) - 2) * 0.06;
  const routes = {};
  for (const [k, pts] of Object.entries(base.routes)) routes[k] = pts.map(w => [w[0] * (k === 'RB' ? 1 : 1), w[1] > 2 ? w[1] * deep : w[1], ...(w[2] ? [w[2]] : [])]);
  if (flip < 0) { const a = routes.WR1, b = routes.WR2; if (a && b && base.form === 'gun') { routes.WR1 = b.map(w => [-w[0], w[1], ...w.slice(2)]); routes.WR2 = a.map(w => [-w[0], w[1], ...w.slice(2)]); } }
  return { ...base, id: 'sig_' + abbr, name: `${city} ${st.sig}`, tip: `${abbr} signature play`, signature: true, routes };
}

export function teamPlaybook(ti, team) {
  const st = teamStyle(ti);
  const off = OFF_STYLES[st.off].plays.slice();
  if (!off.includes('fakepunt')) off.push('fakepunt');
  if (!off.includes('fakefg')) off.push('fakefg');
  return { style: st, offName: OFF_STYLES[st.off].name, defName: DEF_STYLES[st.def].name, off, def: DEF_STYLES[st.def].plays.slice(), sig: team ? signaturePlay(ti, team.abbr, team.city) : null };
}

// ---------------- custom plays ----------------
const num = (v, a, b, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanCustom(def) {
  if (!def || typeof def !== 'object') return null;
  const id = String(def.id || '').replace(/[^a-z0-9_]/gi, '').slice(0, 24);
  if (!id.startsWith('c_')) return null;
  const name = String(def.name || 'My Play').replace(/[<>]/g, '').slice(0, 22) || 'My Play';
  if (def.side === 'def') {
    const roles = ['DL1', 'DL2', 'DL3', 'LB', 'CB1', 'CB2', 'S'], tgts = ['WR1', 'WR2', 'RB', 'QB'];
    const out = { id, name, side: 'def', cat: 'Custom', tip: 'Your custom defense', man: {}, zone: {}, rush: [], spy: [], deep: [] };
    for (const r of roles) {
      const a = def.assign && def.assign[r]; if (!a) continue;
      if (a.t === 'rush') out.rush.push(r);
      else if (a.t === 'man' && tgts.includes(a.who)) { if (a.who === 'QB') out.spy.push(r); else out.man[r] = a.who; }
      else if (a.t === 'zone') out.zone[r] = [num(a.x, -24, 24), num(a.z, 1, 35, 8)];
      else if (a.t === 'deep') out.deep.push(r);
    }
    return out;
  }
  const form = FORMS[def.form] && def.form !== 'punt' && def.form !== 'fg' ? def.form : (def.special && FORMS[def.form] ? def.form : 'gun');
  const type = def.type === 'run' ? 'run' : 'pass';
  const routes = {};
  for (const r of ['WR1', 'WR2', 'RB', 'QB']) {
    const pts = def.routes && def.routes[r];
    if (!Array.isArray(pts) || !pts.length) continue;
    routes[r] = pts.slice(0, 6).map(w => [num(w[0], -25, 25), num(w[1], -12, 55), ...(w[2] === 'stop' ? ['stop'] : [])]);
  }
  const out = { id, name, side: 'off', cat: def.special ? 'Special' : 'Custom', form, type, tip: 'Your custom play', routes, drop: -7, custom: true };
  if (type === 'run') {
    if (def.carrier === 'QB') out.qbRun = true; else out.hand = num(def.hand, 0.3, 1.2, 0.5);
  }
  if (def.pa) out.pa = 0.65;
  return out;
}
