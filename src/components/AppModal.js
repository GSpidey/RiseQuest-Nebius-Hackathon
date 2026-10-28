import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, BackHandler, Keyboard, Modal as NativeModal, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {dialogQueue, AppAlert} from '../services/dialogQueue';
import {MotionScreen, ThemeBackdrop, useReducedMotion, useThemeMotion} from '../features/customization/ThemeMotion';
import {SunriseIcon, sunrise} from './SunriseUI';
const ModalDepth=createContext(0);
export {AppAlert};

export function DialogSurface({value,onAction,onDismiss,busy=false,error,children,artwork}) {
 const theme=useThemeMotion();
 const destructive=value.buttons.some(b=>b.style==='destructive');
 const icon=destructive?'shield':/point|reward|complete|saved|success|logged|welcome/i.test(value.title)?'star':/error|failed|unavailable|permission/i.test(value.title)?'support':'today';
 return <View style={s.shade} accessibilityViewIsModal importantForAccessibility="yes">
  <MotionScreen screenKey={value.id||value.title} style={s.card}>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} bounces={false}>
    <LinearGradient colors={theme.design?.gradient||['#FFE2AA','#FFF1DB','#DCF3EC']} style={s.art}>
     <View style={s.orbit}/><View style={s.sun}/><View style={s.artTile}>{artwork||<SunriseIcon name={icon} size={48} color={destructive?'#A02E4B':'#805019'}/>}</View>
     <View style={s.spark}><SunriseIcon name="sparkles" size={23} color="#B77916"/></View>
    </LinearGradient>
    <Text accessibilityRole="header" style={s.title}>{value.title}</Text>
    {!!value.description&&<Text style={s.body}>{value.description}</Text>}{children}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={s.actions}>{value.buttons.map((button,index)=><TouchableOpacity key={index} accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} onPress={()=>onAction(index)} style={[s.button,button.style==='cancel'&&s.secondary,button.style==='destructive'&&s.destructive,busy&&{opacity:.6}]}>
     <Text style={[s.buttonText,button.style==='destructive'&&{color:'#FFFFFF'}]}>{busy&&button.style!=='cancel'?'Working…':button.text||'OK'}</Text>
    </TouchableOpacity>)}</View>
   </ScrollView>
  </MotionScreen>
 </View>;
}
function DialogHost({depth,active=true}) {
 const key=useRef({}).current,[value,setValue]=useState(null);
 useEffect(()=>active?dialogQueue.register(key,depth,setValue):undefined,[active,depth,key]);
 useEffect(()=>{if(!value)return;Keyboard.dismiss();AccessibilityInfo.announceForAccessibility(value.title);const sub=BackHandler.addEventListener('hardwareBackPress',()=>dialogQueue.dismiss(value.id));return()=>sub.remove();},[value]);
 if(!active||!value)return null;
 const choose=index=>{try{const result=dialogQueue.choose(value.id,index);if(result?.catch)result.catch(()=>AppAlert.alert('Please try again','That action could not be completed.'));}catch(_){AppAlert.alert('Please try again','That action could not be completed.');}};
 return <DialogSurface value={value} onAction={choose}/>;
}
export function AppSurface({children}) {
 return <View style={{flex:1}}>{children}<DialogHost depth={0}/></View>;
}
export default function AppModal({children,visible=true,onRequestClose,animationType='slide',...props}) {
 const depth=useContext(ModalDepth)+1,reduced=useReducedMotion();
 return <NativeModal {...props} visible={visible} animationType={reduced?'none':animationType} onRequestClose={()=>{const current=dialogQueue.active();if(current){dialogQueue.dismiss(current.id);return;}onRequestClose?.();}}>
  <ModalDepth.Provider value={depth}><View style={{flex:1}}>{!props.transparent&&<ThemeBackdrop/>}{children}<DialogHost depth={depth} active={visible}/></View></ModalDepth.Provider>
 </NativeModal>;
}
const s=StyleSheet.create({shade:{...StyleSheet.absoluteFillObject,zIndex:10000,elevation:100,backgroundColor:'#252438A8',padding:22,alignItems:'center',justifyContent:'center'},card:{flex:0,flexBasis:'auto',width:'100%',maxWidth:440,maxHeight:'90%',borderRadius:30,backgroundColor:sunrise.background,borderWidth:1,borderColor:'#FFF3DC',overflow:'hidden'},content:{padding:22,gap:16},art:{height:120,borderRadius:22,alignItems:'center',justifyContent:'center',overflow:'hidden'},orbit:{position:'absolute',width:160,height:62,borderRadius:40,backgroundColor:'#FFFFFF70',transform:[{rotate:'-18deg'}]},sun:{position:'absolute',width:55,height:55,borderRadius:30,backgroundColor:'#FFCA50',right:25,top:15},artTile:{width:86,height:86,borderRadius:28,backgroundColor:'#FFF9F2E6',alignItems:'center',justifyContent:'center',transform:[{rotate:'-5deg'}]},spark:{position:'absolute',left:30,bottom:18},title:{fontSize:25,fontWeight:'800',color:sunrise.ink,textAlign:'center'},body:{fontSize:16,lineHeight:24,color:sunrise.muted,textAlign:'center'},actions:{gap:10},button:{minHeight:50,padding:15,borderRadius:18,backgroundColor:sunrise.orange,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'800',color:sunrise.ink,textAlign:'center'},secondary:{backgroundColor:'#E7F3ED'},destructive:{backgroundColor:'#A02E4B'},error:{color:'#A02E4B',fontSize:14,lineHeight:21}});
