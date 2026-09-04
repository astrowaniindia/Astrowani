// The interactive preview shown on a feature's own screen.
//
// It is a DEMO, not the feature. Everything it touches is component-local state that dies
// with the screen — nothing is saved, no wallet or coupon is involved, and the wheel's
// result is chosen here on the device because it awards nothing. When these go live, the
// real surfaces will own their own state and talk to the server; this file does not become
// that. Delete a branch here as each feature ships.
//
// Kept separate from the screens so FeatureIntroScreen stays generic — it renders whatever
// the catalogue points at, with no per-feature code of its own.

import React, {useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';

import DeepakStreak from './DeepakStreak';
import RashiChakra from './RashiChakra';
import ChartCompleteness from './ChartCompleteness';
import KalpavrikshaTree from './KalpavrikshaTree';
import MalaCounter from './MalaCounter';
import {GAME} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

// Illustrative wedges. The live version gets these, and the winning index, from the server.
const DEMO_WEDGES = [
  {short: '5% OFF', text: 'A 5% discount on your next consultation'},
  {short: '10% OFF', text: 'A 10% discount on any astro report'},
  {short: '5% OFF', text: 'A 5% discount on a remedy item'},
  {short: '20% OFF', text: 'A 20% discount on your next consultation', rare: true},
  {short: '5% OFF', text: 'A 5% discount on any astro report'},
  {short: '15% OFF', text: 'A 15% discount on a gemstone'},
  {short: '10% OFF', text: 'A 10% discount on your next consultation'},
  {short: '50% OFF', text: 'Half off one astro report', rare: true},
  {short: '5% OFF', text: 'A 5% discount on a remedy item'},
  {short: '10% OFF', text: 'A 10% discount on a puja booking'},
  {short: '5% OFF', text: 'A 5% discount on your next consultation'},
  {short: '25% OFF', text: 'A 25% discount on any remedy', rare: true},
];

function StreakDemo() {
  const [days, setDays] = useState(['lit', 'lit', 'lit', 'grace', 'pending', 'off', 'off']);
  const [count, setCount] = useState(4);
  return (
    <DeepakStreak
      days={days}
      streakCount={count}
      onLightToday={() => {
        setDays(d => d.map(x => (x === 'pending' ? 'today' : x)));
        setCount(c => c + 1);
      }}
    />
  );
}

function ChakraDemo() {
  const [idx, setIdx] = useState(null);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(false);
  return (
    <RashiChakra
      segments={DEMO_WEDGES}
      resultIndex={idx}
      resultText={idx !== null ? DEMO_WEDGES[idx].text : ''}
      busy={busy}
      available={!used}
      size={moderateScale(196)}
      onSpin={() => {
        setBusy(true);
        setTimeout(() => {
          setBusy(false);
          setIdx(Math.floor(Math.random() * DEMO_WEDGES.length));
        }, 420);
      }}
      onSettled={() => setUsed(true)}
    />
  );
}

// The chart and the tree take REAL data from the screen, because both can be shown
// truthfully today — the profile is already loaded and the referral count already has an
// endpoint. Everything else is illustrative.
function ChartDemo({profile}) {
  return <ChartCompleteness profile={profile} size={moderateScale(200)} />;
}

function TreeDemo({referredCount = 0}) {
  return (
    <View style={{alignItems: 'center'}}>
      <KalpavrikshaTree count={referredCount} width={moderateScale(240)} />
      <Text style={styles.treeStat}>
        {referredCount} {referredCount === 1 ? 'friend' : 'friends'} joined · ₹
        {referredCount * 50} earned
      </Text>
    </View>
  );
}

function MalaDemo() {
  const [beads, setBeads] = useState(0);
  const [rounds, setRounds] = useState(0);
  return (
    <MalaCounter
      count={beads}
      rounds={rounds}
      mantra="Om Namah Shivaya"
      size={moderateScale(240)}
      onAdvance={() => setBeads(b => Math.min(108, b + 1))}
      onReset={() => {
        setRounds(r => r + 1);
        setBeads(0);
      }}
    />
  );
}

export default function FeatureDemo({id, profile, referredCount}) {
  switch (id) {
    case 'streak':
      return <StreakDemo />;
    case 'chakra':
      return <ChakraDemo />;
    case 'chart':
      return <ChartDemo profile={profile} />;
    case 'tree':
      return <TreeDemo referredCount={referredCount} />;
    case 'mala':
      return <MalaDemo />;
    default:
      return null;
  }
}

// Whether this feature's demo is showing the customer's own data or an illustration. The
// screen says which, because a made-up number presented as yours is the kind of small lie
// that costs trust when someone notices.
export const DEMO_USES_REAL_DATA = {chart: true, tree: true};

const styles = StyleSheet.create({
  treeStat: {
    marginTop: verticalScale(4),
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: GAME.textSoft,
  },
});
