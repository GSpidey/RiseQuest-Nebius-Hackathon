import React from 'react';
import {View,Text,TouchableOpacity,StyleSheet} from 'react-native';
import {useThemeMotion} from '../features/customization/ThemeMotion';
import LinearGradient from 'react-native-linear-gradient';
export function XpBar({progress,compact=false}) {
 const {design}=useThemeMotion();
 if(!progress)return null;
 return <View style={{gap:6}}><View style={s.xpRow}><Text style={s.xpLabel}>{progress.currentXp.toLocaleString()} / {progress.neededXp.toLocaleString()} XP</Text><Text style={s.xpLabel}>{progress.remainingXp.toLocaleString()} to Lv. {progress.nextLevel}</Text></View><View accessibilityRole="progressbar" accessibilityValue={{min:0,max:progress.neededXp,now:progress.currentXp,text:`${progress.remainingXp} XP to level ${progress.nextLevel}`}} style={[s.track,compact&&{height:7}]}><LinearGradient colors={design?.gradient?.slice(0,2)||['#8F67E8','#4EBFAF']} start={{x:0,y:0}} end={{x:1,y:0}} style={{height:'100%',width:`${progress.percent}%`,borderRadius:8}}/></View></View>;
}
export default function ProgressCard({progress,points,loginStreak=0,onWallet,onProgress}) {
 return <View style={s.card}><View style={s.row}>
  <TouchableOpacity accessibilityRole="button" onPress={onProgress} style={s.level}><Text style={{fontSize:22}}>✦</Text><View><Text style={s.small}>YOUR JOURNEY</Text><Text style={s.value}>Level {progress.level}</Text></View></TouchableOpacity>
  <View style={s.metric}><Text style={s.value}>🔥 {loginStreak}</Text><Text style={s.caption}>Login streak</Text></View>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${points??'Loading'} Rise Points. Open wallet`} onPress={onWallet} style={s.metric}><Text style={s.value}>⭐ {points==null?'—':points.toLocaleString()}</Text><Text style={s.caption}>Rise Points</Text></TouchableOpacity>
 </View><XpBar progress={progress} compact/></View>;
}
const s=StyleSheet.create({card:{marginTop:12,padding:14,gap:12,backgroundColor:'#FFFDF8',borderRadius:22,borderWidth:1,borderColor:'#EAE0F1'},row:{flexDirection:'row',alignItems:'center',gap:8},level:{flex:1.3,flexDirection:'row',alignItems:'center',gap:7},small:{fontSize:9,fontWeight:'800',letterSpacing:.8,color:'#78639C'},value:{fontSize:16,fontWeight:'900',color:'#343047'},metric:{flex:1,alignItems:'center',paddingVertical:5},caption:{fontSize:10,color:'#6B6476',marginTop:3},xpRow:{flexDirection:'row',justifyContent:'space-between',gap:8},xpLabel:{fontSize:10,color:'#746B83',fontWeight:'600'},track:{height:9,borderRadius:8,backgroundColor:'#EBE4F5',overflow:'hidden'}});
