import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import RiseQuestDialog from './RiseQuestDialog';
import Medal from '../features/customization/Medal';
import { Celebration } from '../features/customization/ThemeMotion';

// A scrollable custom panel: checkbox choices are not restricted by native Alert button limits.
export default function WelcomePanel({ visible, bonus=0, canStartTrial=false, onComplete, onSkip }) {
 const [trial,setTrial]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const finish=async(startTrial)=>{if(busy)return;setBusy(true);setError('');try{await onComplete(startTrial);}catch(e){setError(e.message||'Could not finish. Please try again.');}finally{setBusy(false);}};
 return <RiseQuestDialog visible={visible} title="Your next chapter starts here." description="Your profile is ready. Make yourself at home."
  artwork={<><Medal item={{id:'welcome',symbol:'sun',palette:0,name:'A bright beginning'}} size={110}/><Celebration preview/></>}
  busy={busy} error={error} confirmLabel={trial&&canStartTrial?'Start my trial & continue':'Let’s begin'} onConfirm={()=>finish(trial&&canStartTrial)} onClose={onSkip} showCancel={false}>
  {bonus>0&&<View style={{padding:18,borderRadius:20,backgroundColor:'#FFF0CB',gap:6,alignItems:'center'}}><Text style={{fontSize:30,fontWeight:'900',color:'#795017'}}>+{bonus} Rise Points</Text><Text style={{fontSize:14,lineHeight:20,color:'#725537',textAlign:'center'}}>Your welcome gift is already in your wallet. Save it or explore your collection.</Text></View>}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{['Alarms & routines','Quests & small steps','Companions','Medals & themes'].map(label=><Text key={label} style={{padding:9,borderRadius:12,backgroundColor:'#EDF3ED',fontSize:12,color:'#3D685B'}}>✓ {label}</Text>)}</View>
  {canStartTrial&&<TouchableOpacity accessibilityRole="checkbox" aria-checked={trial} aria-disabled={busy} accessibilityState={{checked:trial,disabled:busy}} accessibilityLabel="Start my free 7-day Premium trial" disabled={busy} onPress={()=>setTrial(v=>!v)} style={{flexDirection:'row',gap:12,padding:16,borderRadius:18,borderWidth:2,borderColor:trial?'#7462C3':'#DED7EB',backgroundColor:trial?'#EFE7FF':'#FFF'}}>
   <View style={{width:26,height:26,borderRadius:7,borderWidth:2,borderColor:'#7462C3',backgroundColor:trial?'#7462C3':'#FFF',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontWeight:'900'}}>{trial?'✓':''}</Text></View>
   <View style={{flex:1,gap:7}}><Text style={{fontSize:15,fontWeight:'800',color:'#46396E'}}>Try Premium free for 7 days</Text><Text style={{fontSize:13,lineHeight:20,color:'#625A72'}}>Adaptive games, Luna & Nova, voice choices and an ad-free experience. No card needed; no automatic charge or renewal.</Text></View>
  </TouchableOpacity>}
  {!!error&&<TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onSkip} style={{padding:12}}><Text style={{textAlign:'center',color:'#366A5D',fontWeight:'700'}}>Continue for now</Text></TouchableOpacity>}
 </RiseQuestDialog>;
}
