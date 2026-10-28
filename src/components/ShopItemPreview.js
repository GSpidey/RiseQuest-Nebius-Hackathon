import React, {useEffect,useState} from 'react';
import {View, Image, StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SunriseIcon, sunrise} from './SunriseUI';
import {getThemeGradient} from '../config/themeCatalog';
import {themeArtwork as themes} from '../features/customization/ThemeMotion';
import Medal from '../features/customization/Medal';
import CompanionAvatar from '../features/companion/CompanionAvatar';
import CosmeticArtwork, {previewIds} from './CosmeticArtwork';
export default function ShopItemPreview({item,size=88}) {
 const [failed,setFailed]=useState(false);
 const uri=item.design?.backgroundUrl;
 useEffect(()=>setFailed(false),[item.id,uri]);
 const palette=item.design?.gradient||getThemeGradient(item.id),source=themes[item.id]||(uri?{uri}:null);
 const bundle=item.items||(item.id==='bundle_starter'?['theme_nature','sound_birds','anim_sparkles','badge_early_bird']:item.id==='bundle_premium'?['theme_zen','sound_motivational','anim_fireworks','badge_streak_master']:null);
 return <View accessible accessibilityLabel={`${item.name} preview`} style={[s.frame,{width:size,height:size}]}>
  {bundle?<View style={s.mosaic}>{bundle.slice(0,4).map(id=><ShopItemPreview key={id} item={{id,name:id,type:id.startsWith('badge_')?'badges':undefined}} size={size*.43}/>)}</View>:
   previewIds.includes(item.id)?<CosmeticArtwork id={item.id} size={size}/>:
   item.type==='badges'||item.id.startsWith('badge_')?<Medal item={item} size={size*.8}/>:
   item.type==='companions'||item.id.startsWith('avatar_')?<CompanionAvatar character={item.id.replace('avatar_','')} size={size*.85} reducedMotion/>:
   source&&!failed?<Image source={source} onError={()=>setFailed(true)} style={s.image} resizeMode="cover"/>:
   <LinearGradient colors={palette} style={s.image}><SunriseIcon name="palette" color="#FFF9E8" size={size*.45}/></LinearGradient>}
  {(item.type==='themes'||item.id.startsWith('theme_'))&&<View style={s.swatches}>{palette.map((c,i)=><View key={i} style={[s.swatch,{backgroundColor:c}]}/>)}</View>}
 </View>;
}
const s=StyleSheet.create({frame:{borderRadius:18,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'#FFF0DB'},image:{width:'100%',height:'100%',alignItems:'center',justifyContent:'center'},mosaic:{flexDirection:'row',flexWrap:'wrap',gap:4,justifyContent:'center',alignItems:'center'},swatches:{position:'absolute',bottom:6,right:6,flexDirection:'row',backgroundColor:'#FFFFFF',padding:3,borderRadius:10,gap:3},swatch:{width:10,height:10,borderRadius:5}});
