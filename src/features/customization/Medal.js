import React, {useEffect,useId,useState} from 'react';
import {Image} from 'react-native';
import badgeArtwork from './badgeArtwork';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
const palettes = [['#FFC83D','#E98325','#91520C'],['#7ADDC5','#259F93','#135D60'],['#B49AFF','#7651D0','#443071'],['#80D6FF','#397EC7','#234C78'],['#FFA8C2','#D85185','#843456']];
const symbols = {
 star: 'm50 29 6 13 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2Z',
 sun: 'M34 53a16 16 0 0 1 32 0H34Zm16-30v8m-24 3 6 6m42-6-6 6M31 63h38',
 flame: 'M51 27c4 17 18 17 16 30-3 21-34 20-35 0-1-9 6-16 10-20 0 10 3 11 5 10 5-3 5-13 4-20Z',
 flag: 'M37 72V28m1 1c13-8 17 11 30 2v26c-13 9-17-10-30-2',
 crown: 'm28 37 10 9 12-17 12 17 10-9-6 26H34Zm8 34h28',
 leaf: 'M69 30C43 25 26 38 34 59s40 15 35-29ZM31 72l28-31',
 bolt: 'M55 25 31 53h17l-3 23 25-32H53Z',
 moon: 'M59 29a23 23 0 1 0 13 35 24 24 0 0 1-13-35Z',
};
export default function Medal({ item = {}, size = 80, locked = false }) {
 const [failed,setFailed]=useState(false), unique=useId().replace(/[^a-zA-Z0-9]/g,'');
 useEffect(()=>setFailed(false),[item.id]);
 if(badgeArtwork[item.id]&&!failed)return <Image onError={()=>setFailed(true)} source={badgeArtwork[item.id]} resizeMode="contain" style={{width:size,height:size*1.1,opacity:locked?.38:1}} accessible accessibilityLabel={`${item.name||'Medal'}${locked?', locked':''}`}/>;
 const index = item.palette ?? (item.id === 'badge_streak_master' ? 2 : 0), colors = palettes[index % palettes.length];
 const gradient = `medal${unique}`;
 return <Svg width={size} height={size*1.1} viewBox="0 0 100 110" accessible accessibilityLabel={`${item.name || 'Medal'}${locked ? ', locked' : ''}`} opacity={locked ? .45 : 1}>
  <Defs><LinearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={colors[0]}/><Stop offset="1" stopColor={colors[1]}/></LinearGradient></Defs>
  <Path d="m26 64-6 42 21-10 12 12 7-42M58 67l3 41 14-13 20 7-18-43" fill={colors[1]}/>
  <Circle cx="50" cy="49" r="42" fill={`url(#${gradient})`} stroke={colors[2]} strokeWidth="3"/>
  <Circle cx="50" cy="49" r="34" fill="none" stroke="#FFF4CA" strokeWidth="2" strokeDasharray="3 4"/>
  <Path d={symbols[item.symbol] || (item.id === 'badge_early_bird' ? symbols.sun : symbols.star)} fill="#FFF7D9" stroke={colors[2]} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
  <Path d="m20 15 3-9 3 9 9 3-9 3-3 9-3-9-9-3Zm62 56 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" fill="#FFE7A2"/>
 </Svg>;
}

