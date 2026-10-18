// ENDZONE KINGS — announcer script. Every line is pre-recorded in ONE deep male voice (assets/vo), so the
// announcer sounds the same on every device. A line is a list of variants; a variant is a list of pieces:
// plain text = a recorded phrase, '$name' = player last name, '$city' / '$city2' = team, '$yds' = "N yards",
// '$n' / '$n2' = a number, '$pen' = penalty name. Variants whose pieces aren't recorded get skipped, so every
// line keeps at least one variant with no names in it. Lines marked hype get the louder, faster read.
export const VO = {
  td: { hype: 1, v: [['Touchdown!', '$city!'], ["He's in! He is in!", 'Touchdown,', '$name!'], ["Nobody's catching him! Gone! Touchdown!"], ['Six points!', '$name', 'takes it to the house!'], ['Oh my goodness!', '$name!', 'Touchdown!'], ["Can't stop him! Touchdown!"], ['Touchdown! Are you kidding me?']] },
  fg: { v: [['The kick is up... and it is good!'], ['Right down the middle! Three points!'], ['He drills it! Good!']] },
  fgMiss: { v: [['No good! He missed it!'], ['Wide! The kick is no good!']] },
  sack: { hype: 1, v: [['Sacked! Brought down in the backfield!'], ['Sack!', '$name', 'gets home!'], ['And the quarterback goes down!'], ['$name', 'with the sack! What a rush!']] },
  first: { v: [['First down,', '$name!'], ['Moves the chains!'], ['And that is a first down!'], ['$name', 'picks up the first!'], ['Keep it moving! First down!']] },
  big: { hype: 1, v: [['Big play!', '$name', 'for', '$yds!'], ['What a run by', '$name!', '$yds!'], ['Look at him go!', '$yds!'], ['$name', 'breaks free! Big gain!']] },
  mid: { v: [['Nice gain!', '$name', 'for', '$yds!'], ['$name', 'fights for', '$yds!'], ['Good pickup!', '$yds!']] },
  small: { v: [['$name,', '$yds.'], ['$name', 'grinds out', '$yds.']] },
  loss: { v: [['Stuffed in the backfield!'], ['Nowhere to go! Dropped for a loss!'], ['Blown up behind the line!']] },
  inc: { v: [['Incomplete!'], ['Pass falls incomplete!'], ['Off the fingertips! Incomplete!'], ['Just out of reach!']] },
  pbu: { hype: 1, v: [['Broken up! Great coverage!'], ['Knocked away!'], ['He got a hand on it!'], ['No chance! Swatted away!']] },
  xp: { v: [['Extra point is good!'], ['And the P A T is good!']] },
  xpMiss: { v: [['Oh! The extra point is no good!']] },
  two: { hype: 1, v: [['They go for two... and they get it!']] },
  twoMiss: { v: [['Two point try... no good! Stopped!']] },
  to: { hype: 1, v: [['Change of possession!'], ['Turnover! The other guys get it!']] },
  downs: { hype: 1, v: [['They come up short! Turnover on downs!']] },
  safety: { hype: 1, v: [['Safety! Two points! Oh, that is a backbreaker!']] },
  half: { v: [["And that's the half! What a first half of football!"]] },
  ot: { hype: 1, v: [["We're going to overtime, folks! Next score wins!"]] },
  punt: { v: [['Booming punt!'], ['He gets all of that one!']] },
  tb: { v: [['Touchback!']] },
  pen: { v: [['Flag on the play!', '$pen!'], ["Oh, we've got a flag!", '$pen!'], ['Laundry on the field!', '$pen!'], ['Flag on the play!']] },
  oob: { v: [['$name', 'pushed out of bounds!'], ['$name', 'gets out of bounds!']] },
  fumbleBy: { hype: 1, v: [['Oh! Fumble by', '$city!', 'And', '$city2', 'recovers it!'], ["It's out! Fumble!", '$city2', 'comes up with the football!'], ["It's out! Fumble! Turnover!"]] },
  fumbleKeep: { v: [['Fumble! But', '$city', 'falls on it! Huge recovery!'], ['Fumble! But they fall on it! Huge recovery!']] },
  fumbleLoose: { hype: 1, v: [['Fumble! The ball is loose!']] },
  pick: { hype: 1, v: [['Intercepted!', '$name', 'picks it off!'], ['Intercepted! Picked off!'], ['Picked! What a play on the ball!']] },
  broken: { hype: 1, v: [['Breaks the tackle!'], ['Shakes him off!'], ['He will not go down!']] },
  onehand: { hype: 1, v: [['One hand! Are you kidding me?'], ['What a grab, one hand!'], ['He snags it with one hand!']] },
  annOn: { v: [["Announcer is on. Let's go!"]] },
  welcome: { hype: 1, v: [['Welcome to', '$city!', "Tonight it's", '$city2', 'against', '$city!', "Let's play some football!"], ['Welcome in, everybody! Big one tonight! Let\'s play some football!']] },
  htLead: { v: [["That's halftime.", '$city', 'leads it', '$n', 'to', '$n2.', 'Stay with us.'], ["That's halftime. Stay with us."]] },
  htTie: { v: [["That's halftime. All tied up at", '$n.', 'Stay with us.'], ["That's halftime. Stay with us."]] },
};
// spoken form of each penalty
export const PEN_SAY = { 'FALSE START': 'False start', 'DELAY OF GAME': 'Delay of game', 'OFFSIDES': 'Offside', 'HOLDING': 'Holding', 'OFFENSIVE PASS INTERFERENCE': 'Offensive pass interference', 'PASS INTERFERENCE': 'Pass interference', 'DEFENSIVE HOLDING': 'Defensive holding', 'ROUGHING THE PASSER': 'Roughing the passer', 'FACEMASK': 'Facemask' };
// file name for a recorded piece
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
