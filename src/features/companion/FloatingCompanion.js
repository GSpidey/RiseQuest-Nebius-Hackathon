import React from 'react';
import {TouchableOpacity,View,Text} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import CompanionAvatar from './CompanionAvatar';
import {ListeningGlow} from './VoiceControls';
import {useVoiceConversation,stopVoiceConversation} from './voiceConversation';
export default function FloatingCompanion({navigationHeight,character,reducedMotion,onPress}) {
 const insets=useSafeAreaInsets(),voice=useVoiceConversation();
 return <View style={{position:'absolute',right:8+insets.right,bottom:navigationHeight+insets.bottom+18}}>
  <ListeningGlow active={voice.active&&voice.phase==='listening'} reducedMotion={reducedMotion} compact><TouchableOpacity accessibilityRole="button" accessibilityLabel={voice.active?`Voice chat ${voice.phase}. Open your companion`:'Open your companion'} onPress={onPress}
   style={{backgroundColor:'#FFF9EEDD',borderRadius:24,padding:3,elevation:4,borderWidth:voice.active?2:0,borderColor:'#2CB8A1'}}>
   <CompanionAvatar character={character} size={66} reducedMotion={reducedMotion} speaking={voice.phase==='speaking'}/>
  </TouchableOpacity></ListeningGlow>
  {voice.active&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop voice conversation" onPress={()=>stopVoiceConversation()} style={{minHeight:44,backgroundColor:'#217F77',borderRadius:14,justifyContent:'center',alignItems:'center',marginTop:4,paddingHorizontal:8}}><Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'800'}}>■ Stop</Text></TouchableOpacity>}
 </View>;
}
