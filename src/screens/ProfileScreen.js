import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { featureApi } from '../features/api';
import { useCollection, refreshCollection } from '../services/cosmeticCollection';
import { MotionScreen, ThemeBackdrop, useThemeMotion } from '../features/customization/ThemeMotion';
import { XpBar } from '../components/ProgressCard';
import Medal from '../features/customization/Medal';
import { SunriseIcon } from '../components/SunriseUI';
const human = value => String(value || '').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const Action = ({ children, onPress }) => <TouchableOpacity accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.actionText}>{children}</Text><Text style={s.actionText}>→</Text></TouchableOpacity>;
export default function ProfileScreen({ userProfile, userId, onCollection, onSettings, onNotes, onMessages }) {
 const own = !userId || userId === (userProfile?.id || userProfile?.email);
 const collection = useCollection(), theme = useThemeMotion();
 const [profile,setProfile]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[attempt,setAttempt]=useState(0),[details,setDetails]=useState(false);
 useEffect(()=>{let alive=true;setBusy(true);setError('');setProfile(null);
  const path=own?'/api/me/profile-card':`/api/community/profiles/${encodeURIComponent(userId)}`;
  Promise.all([featureApi(path),own?refreshCollection().catch(()=>null):Promise.resolve()]).then(([data])=>{if(alive)setProfile(data.profile);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[userId,own,attempt,userProfile?.id,userProfile?.email]);
 const name=profile?.displayName||(own?userProfile?.displayName:'')||'RiseQuester';
 const photo=profile?.photoUrl||(own?userProfile?.photoUrl:null);
 const banner=own?userProfile?.bannerUrl:profile?.bannerUrl;
 const earned=own?collection.achievements.filter(b=>b.earned):profile?.badges||[];
 const displayed=own?earned.filter(b=>(collection.loadout.badgeIds||[]).includes(b.id)):earned;
 const next=own?collection.achievements.filter(b=>!b.earned).sort((a,b)=>(b.progress/b.target)-(a.progress/a.target)).slice(0,2):[];
 const prefs=userProfile?.preferences||{};
 return <View style={s.page}><ThemeBackdrop/><MotionScreen screenKey={userId||'my-profile'}><ScrollView contentContainerStyle={s.content}>
  <LinearGradient colors={theme.design?.gradient||['#255A62','#446C74','#645E91']} style={s.hero}>
   {!!banner&&<Image source={{uri:banner}} resizeMode="cover" accessibilityLabel="Profile banner" style={[StyleSheet.absoluteFill,{borderRadius:30}]}/>}
   {(banner||theme.design?.gradient)&&<View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:banner?'#162A3866':'#203A4BAA',borderRadius:30}]}/>}
   <View style={s.heroTop}>
    {own&&onNotes&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open my notes" accessibilityHint="Create, find and edit your saved notes" onPress={onNotes} style={s.shortcut}><SunriseIcon name="notes" size={24} color="#FFFFFF"/></TouchableOpacity>}
    <Text style={[s.eyebrow,{flex:1}]}>{own?'YOUR LITTLE CORNER OF RISEQUEST':'MEET A RISEQUESTER'}</Text>
    {own&&onMessages&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open buddy messages" onPress={onMessages} style={s.shortcut}><SunriseIcon name="messages" size={24} color="#FFFFFF"/></TouchableOpacity>}
   </View>
   <View style={s.orbit}><Text style={s.stars}>✦</Text><View style={s.avatar}>{photo?<Image source={{uri:photo}} style={s.photo}/>:<Text style={s.initial}>{name[0]?.toUpperCase()}</Text>}</View><Text style={[s.stars,{color:'#B3DCCA',fontSize:35}]}>✧</Text></View>
   <Text style={s.name}>{name}</Text><Text style={s.tagline}>{own?'Every small step is part of your story.':'Growing, one small step at a time.'}</Text>
   {!!profile?.joined&&<Text style={s.joined}>Here since {new Date(`${profile.joined}-02T00:00:00Z`).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Text>}
   {!!displayed.length&&<View style={s.showcase}>{displayed.map(b=><View key={b.id} style={s.featureBadge}><Medal item={b} size={58}/><Text style={s.badgeCaption}>{b.name}</Text></View>)}</View>}
  </LinearGradient>
  {own&&collection.progression&&<View style={s.card}><Text style={s.title}>Level {collection.progression.level} · Your journey</Text><XpBar progress={collection.progression}/></View>}
  {busy&&<ActivityIndicator accessibilityLabel="Loading profile" color="#39786D"/>}
  {!!error&&<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Action onPress={()=>setAttempt(v=>v+1)}>Try again</Action></View>}
  {own&&profile&&<><View style={s.stats}>{[['☀️',profile.stats.wakeDays,'Wake-up days'],['🌱',profile.stats.quests,'Quests finished'],['🔥',profile.stats.bestStreak,'Best day streak']].map(([icon,value,label])=><View key={label} style={s.stat}><Text style={{fontSize:24}}>{icon}</Text><Text style={s.number}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>)}</View>
   <View style={s.wallet}><View><Text style={s.label}>YOUR RISE POINTS</Text><Text style={s.number}>⭐ {collection.balance.toLocaleString()}</Text></View><Text style={s.walletNote}>{collection.inventory.length} treasures{ '\n' }in your collection</Text></View></>}
  {(own?collection.ready:profile)&&<View style={s.card}><View style={s.row}><Text style={s.title}>{own?'Your medal cabinet':'Badge showcase'}</Text><Text style={s.pill}>{earned.length} {own?'earned':'on display'}</Text></View>
   <Text style={s.body}>{own?'Little wins deserve a place to shine. Choose up to three earned badges in My Items for your public showcase.':'A few milestones worth celebrating.'}</Text>
   <View style={s.badges}>{earned.map(b=><View key={b.id} style={s.badge}><Medal item={b} size={72}/><Text style={s.badgeName}>{b.name}</Text><Text style={s.badgeDetail}>{b.description}</Text></View>)}</View>
   {!earned.length&&<View style={s.empty}><Medal item={{id:'first',palette:1,symbol:'leaf',name:'A new beginning'}} size={70}/><Text style={[s.body,{flex:1}]}>{own?'Your first medal is waiting. Complete a quest or wake-up challenge to start your collection.':'This RiseQuester is still arranging their showcase.'}</Text></View>}
   {own&&onNotes&&<Action onPress={onNotes}>My notes</Action>}
   {own&&onCollection&&<Action onPress={onCollection}>Arrange my collection</Action>}
  </View>}
  {own&&next.length>0&&<View style={s.card}><Text style={s.title}>Your next little victories</Text>{next.map(b=><View key={b.id} style={s.goal}><Medal item={b} size={42}/><View style={{flex:1,gap:5}}><Text style={s.badgeName}>{b.name}</Text><Text style={s.body}>{b.progress} of {b.target} · {b.description}</Text><View style={s.track}><View style={[s.fill,{width:`${Math.min(100,b.progress/b.target*100)}%`}]}/></View></View></View>)}</View>}
  {own&&<View style={s.card}><Text style={s.title}>Make yourself at home</Text>{onSettings&&<Action onPress={onSettings}>Edit profile & preferences</Action>}<TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:details}} onPress={()=>setDetails(v=>!v)} style={s.action}><Text style={s.actionText}>My personal settings</Text><Text style={s.actionText}>{details?'−':'+'}</Text></TouchableOpacity>
   {details&&<View style={{gap:8}}>{!!userProfile?.email&&<Text style={s.body}>{userProfile.email}</Text>}<Text style={s.label}>ONLY SHOWN TO YOU</Text>{!!prefs.goals?.length&&<Text style={s.body}>Goals: {prefs.goals.map(human).join(' · ')}</Text>}{!!userProfile?.supportConditions?.length&&<Text style={s.body}>Support areas: {userProfile.supportConditions.map(human).join(' · ')}</Text>}<Text style={s.body}>Gentle motion: {prefs.reducedSensory?'On':'Off'} · Captions: {prefs.captionsEnabled?'On':'Off'}</Text><Text style={s.body}>Reading support: {prefs.dyslexiaFriendly?'On':'Off'} · Layout: {human(prefs.uiDensity||'standard')}</Text></View>}
  </View>}
 </ScrollView></MotionScreen></View>;
}
const s=StyleSheet.create({page:{flex:1},content:{padding:16,paddingBottom:40,gap:16},heroTop:{width:"100%",flexDirection:"row",alignItems:"center",gap:10},shortcut:{width:48,height:48,borderRadius:24,backgroundColor:"#203A4BDD",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#FFFFFF66"},hero:{borderRadius:30,overflow:"hidden",padding:24,alignItems:'center',gap:10},eyebrow:{color:'#EAF5ED',fontSize:10,fontWeight:'800',letterSpacing:1.4,textAlign:'center',backgroundColor:'#203A4BDD',padding:8,borderRadius:12},orbit:{flexDirection:'row',alignItems:'center',gap:22,marginVertical:8},stars:{fontSize:24,color:'#FFDC8A'},avatar:{width:98,height:98,borderRadius:49,borderWidth:4,borderColor:'#FFE9B0',backgroundColor:'#F5BC6C',alignItems:'center',justifyContent:'center'},photo:{width:90,height:90,borderRadius:45},initial:{fontSize:42,fontWeight:'800',color:'#533A35'},name:{fontSize:29,fontWeight:'800',color:'#FFF',textAlign:'center',paddingHorizontal:10},tagline:{fontSize:14,color:'#FFF',lineHeight:22,textAlign:'center',paddingHorizontal:8},joined:{fontSize:12,color:'#FFF',paddingHorizontal:8},showcase:{flexDirection:'row',gap:14,justifyContent:'center',marginTop:10},featureBadge:{alignItems:'center',flex:1,maxWidth:110,gap:5},badgeCaption:{color:'#FFF',fontSize:11,fontWeight:'700',textAlign:'center',backgroundColor:'#203A4BDD',borderRadius:6,padding:4},stats:{flexDirection:'row',gap:10},stat:{flex:1,alignItems:'center',backgroundColor:'#FFFFFFED',padding:14,borderRadius:20,gap:5},number:{fontSize:26,fontWeight:'800',color:'#33304B'},statLabel:{fontSize:11,color:'#5D586A',textAlign:'center'},wallet:{borderRadius:22,padding:20,backgroundColor:'#FFF0CB',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},label:{fontSize:10,fontWeight:'800',letterSpacing:1,color:'#67604E'},walletNote:{color:'#6A5636',fontSize:12,lineHeight:20,textAlign:'right'},card:{backgroundColor:'#FFFFFFF2',borderWidth:1,borderColor:'#ECE5DD',padding:20,borderRadius:24,gap:12},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,justifyContent:'space-between'},title:{fontSize:19,fontWeight:'800',color:'#35324C'},pill:{fontSize:11,color:'#456B60',backgroundColor:'#EAF3EB',padding:7,borderRadius:10,fontWeight:'700'},body:{fontSize:13,lineHeight:20,color:'#625D70'},badges:{flexDirection:'row',flexWrap:'wrap',gap:12,justifyContent:'center'},badge:{width:'45%',alignItems:'center',backgroundColor:'#F7F3FF',borderRadius:20,padding:12,gap:6},badgeName:{fontSize:13,fontWeight:'800',color:'#443B60',textAlign:'center'},badgeDetail:{fontSize:11,lineHeight:16,color:'#625D70',textAlign:'center'},empty:{flexDirection:'row',alignItems:'center',gap:12,padding:12,backgroundColor:'#F3F6EA',borderRadius:18},action:{minHeight:48,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,padding:12,backgroundColor:'#E9F2ED',borderRadius:14},actionText:{fontSize:13,fontWeight:'700',color:'#31685D',flexShrink:1},goal:{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:10},track:{height:7,borderRadius:4,backgroundColor:'#E9E1F3',overflow:'hidden'},fill:{height:7,borderRadius:4,backgroundColor:'#9180CA'},error:{color:'#932F43',fontSize:14}});
