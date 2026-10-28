import Modal from './AppModal';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { pick, types, isCancel, keepLocalCopy } from '@react-native-documents/picker';
import Sound from 'react-native-sound';
import ShopItemPreview from './ShopItemPreview';
import Medal from '../features/customization/Medal';
import { Celebration, MotionScreen, ThemeBackdrop, celebrate, useReducedMotion } from '../features/customization/ThemeMotion';
import { useCollection, refreshCollection, changeCollection } from '../services/cosmeticCollection';
import { applyCollectionSound, prepareCollectionSound, saveCollectionSound } from '../services/cosmeticSounds';
import { featureApi } from '../features/api';
import { sunrise } from './SunriseUI';
const categories = [['themes','🎨','Themes'],['sounds','🔊','Sounds'],['animations','✨','Animations'],['badges','🏅','Badges'],['bundles','🎁','Bundles'],['inventory','🎒','My Items'],['achievements','🌟','Medals'],['companions','☀️','Companions']];
const reference = () => `collection_${Date.now()}_${Math.random().toString(36).slice(2,14)}`;
const Button = ({ children, onPress, disabled, secondary = false }) => <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
 style={[s.button, secondary && s.secondary, disabled && {opacity:.5}]}><Text style={[s.buttonText,secondary && {color:'#315758'}]}>{children}</Text></TouchableOpacity>;
export default function CosmeticStore({ onPurchaseComplete, onPurchaseStarted, onOpenCompanions, initialCategory = 'themes' }) {
 const collection=useCollection(), reduced=useReducedMotion();
 const [category,setCategory]=useState(initialCategory),[cart,setCart]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true);
 const [preview,setPreview]=useState(null),[checkout,setCheckout]=useState(null),[query,setQuery]=useState('all');
 const [previewRun,setPreviewRun]=useState(0);
 const audio=useRef(null),timer=useRef(null),request=useRef(null),mounted=useRef(true);
 const stop=()=>{clearTimeout(timer.current);audio.current?.stop();audio.current?.release();audio.current=null;};
 useEffect(()=>{mounted.current=true;refreshCollection().catch(e=>{if(mounted.current)setError(e.message);}).finally(()=>{if(mounted.current)setLoading(false);});return()=>{mounted.current=false;stop();};},[]);
 const run=async action=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){if(!(typeof isCancel==='function'&&isCancel(e))&&mounted.current)setError(e.message||'Please try again.');}finally{if(mounted.current)setBusy(false);}};
 const owned=new Set(collection.inventory.map(item=>item.id)),catalog=Object.fromEntries([...collection.catalog,...collection.inventory].map(item=>[item.id,item]));
 const equip=async item=>{
  const slot={themes:'themeId',sounds:'soundId',animations:'animationId',badges:'badgeIds'}[item.type];
  if(!slot)return;
  if(item.type==='sounds')await applyCollectionSound(item);
  let itemId=item.id;
  if(slot==='badgeIds'){
   const previous=collection.loadout.badgeIds||[];
   itemId=previous.includes(item.id)?previous.filter(id=>id!==item.id):[...previous,item.id];
   if(itemId.length>3)throw new Error('Remove a displayed badge before adding another. You can display three.');
  }
  await changeCollection('equip',{slot,itemId});
  setNotice(slot==='badgeIds'?'Displayed badges updated.':`${item.name} equipped.`);
  if(item.type==='animations')celebrate();
 };
 const equipped=item=>collection.loadout[{themes:'themeId',sounds:'soundId',animations:'animationId'}[item.type]]===item.id||(collection.loadout.badgeIds||[]).includes(item.id);
 const chooseFile=async item=>{
  const files=await pick({type:[types.audio]}),file=files[0];if(!file?.uri)return;
  const [copy]=await keepLocalCopy({destination:'documentDirectory',files:[{uri:file.uri,fileName:`collection_${Date.now()}_${String(file.name||'tone').replace(/[^a-z0-9._-]/gi,'_')}`}]});
  if(copy.status!=='success')throw new Error('Could not save this sound.');
  await saveCollectionSound(item,copy.localUri,file.name||item.name);
  if(equipped(item))await applyCollectionSound(item);
  setNotice('Your sound is ready.');
 };
 const play=async item=>{
  stop();const sound=await prepareCollectionSound(item);
  audio.current=new Sound(sound.uri,null,e=>{if(e){setError('Could not play this sound.');stop();return;}audio.current?.play(stop);timer.current=setTimeout(stop,10000);});
 };
 const review=async()=>{onPurchaseStarted?.();const quote=await featureApi('/api/cosmetics/quote',{itemIds:cart});request.current={...quote,key:reference(),expectedAmount:quote.amount};setCheckout(quote);};
 const buy=async()=>{
  const body=request.current;if(!body)return;
  if(collection.requiresParentApproval){await changeCollection('requests',body);setNotice('Your request is ready for your parent in Family profiles.');}
  else{await changeCollection('purchase',body);celebrate();onPurchaseComplete?.();setCategory('inventory');setNotice('Your items are in My Items.');}
  setCart([]);setCheckout(null);request.current=null;
 };
 const add=item=>{setCart(old=>old.includes(item.id)?old:[...old,item.id]);setNotice(`${item.name} added to your cart.`);};
 const items=category==='inventory'?collection.inventory.filter(item=>query==='all'||item.type===query):category==='achievements'?collection.achievements:collection.catalog.filter(item=>item.type===category);
 const renderItem=item=>{
  const isOwned=owned.has(item.id),isEarned=item.category==='earned',inInventory=category==='inventory',displayed=equipped(item);
  return <View key={item.id} style={s.card}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Preview ${item.name}`} onPress={()=>setPreview(item)}>
    {item.type==='badges'?<Medal item={item} size={70} locked={isEarned&&!item.earned&&!isOwned}/>:<ShopItemPreview item={item} size={84}/>}
   </TouchableOpacity>
   <View style={{flex:1,minWidth:150,gap:6}}><Text style={s.heading}>{item.name}</Text><Text style={s.body}>{item.description}</Text>{item.category==='earned'&&!item.earned&&!isOwned&&<Text style={{color:'#7951A3',fontWeight:'800',marginTop:5}}>+{item.xp||0} XP · awarded once</Text>}
    {item.items&&<Text style={s.detail}>{item.items.map(id=>catalog[id]?.name||id).join(' · ')}</Text>}
    {isEarned&&<Text style={s.detail}>{item.earned||isOwned?'Earned':`${item.progress||0} / ${item.target}`}</Text>}
    <View style={s.row}>
     {inInventory&&item.type==='companions'?<Button onPress={onOpenCompanions}>Choose companion</Button>:
      (inInventory||isEarned)&&isOwned&&!item.items?<Button disabled={busy} onPress={()=>run(()=>equip(item))}>{displayed?(item.type==='badges'?'Remove from display':'Equipped'):'Equip'}</Button>:
      item.items&&inInventory?<Text style={s.detail}>Contents are saved individually in My Items.</Text>:
      !isEarned?<Button disabled={busy||isOwned||cart.includes(item.id)} onPress={()=>add(item)}>{isOwned?'Owned':cart.includes(item.id)?'In cart':`${item.price} RP · Add`}</Button>:null}
     {item.type==='sounds'&&isOwned&&<><Button secondary disabled={busy} onPress={()=>run(()=>play(item))}>Listen</Button><Button secondary disabled={busy} onPress={()=>run(()=>chooseFile(item))}>Use my audio</Button></>}
    </View>
   </View>
  </View>;
 };
 return <View style={{flex:1}}><ThemeBackdrop/>
  <View style={s.top}><Text style={s.heading}>⭐ {collection.ready?collection.balance.toLocaleString():'—'} RP</Text><Button secondary disabled={busy||loading} onPress={()=>run(refreshCollection)}>Refresh</Button></View>
<View style={s.categories}>
   {categories.map(([id,icon,label])=><TouchableOpacity key={id} accessibilityRole="tab" accessibilityState={{selected:category===id}} onPress={()=>{stop();id==='companions'?onOpenCompanions?.():setCategory(id);}} style={[s.tab,category===id&&s.activeTab]}><Text style={{fontSize:22}}>{icon}</Text><Text style={{color:sunrise.ink,fontSize:12,textAlign:'center',fontWeight:'700'}}>{label}</Text></TouchableOpacity>)}
  </View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
  {(loading||busy)&&<ActivityIndicator accessibilityLabel="Loading collection"/>}
  <MotionScreen screenKey={category}><ScrollView contentContainerStyle={{padding:14,paddingBottom:100,gap:12}}>
   {category==='inventory'&&<><Text style={s.heading}>Your collection</Text><Text style={s.body}>Keep every item here. Choose one theme, sound and celebration, plus up to three displayed badges.</Text>
    <ScrollView horizontal contentContainerStyle={{gap:8}}>{[['all','','All'],...categories.filter(([id])=>!['inventory','achievements'].includes(id))].map(([id,,name])=><Button key={id} secondary={query!==id} onPress={()=>setQuery(id)}>{name}</Button>)}</ScrollView>
    <Button secondary disabled={busy} onPress={()=>run(()=>changeCollection('equip',{slot:'themeId',itemId:null}))}>Use RiseQuest default theme</Button></>}
   {category==='achievements'&&<Text style={s.body}>Medals celebrate your saved alarm, quest and sleep activity. Your earned medals stay in My Items.</Text>}
   {items.map(renderItem)}{collection.ready&&!items.length&&<Text style={s.body}>Your collection starts here. Earn an achievement or explore the store.</Text>}
  </ScrollView></MotionScreen>
  {!!cart.length&&<View style={s.cart}><Text style={s.heading}>{cart.length} items in cart</Text><View style={s.row}><Button disabled={busy} onPress={()=>run(review)}>Review purchase</Button><Button secondary disabled={busy} onPress={()=>setCart([])}>Clear</Button></View></View>}
  {preview && <Modal visible transparent animationType={reduced?'none':'fade'} onRequestClose={()=>{stop();setPreview(null);}}>
   <View style={s.shade}><MotionScreen screenKey={preview?.id} style={s.modal}><ScrollView contentContainerStyle={{alignItems:'center',gap:14}}>
    {preview&&<><View style={{height:230,width:230,alignItems:'center',justifyContent:'center'}}>{preview.type==='badges'?<Medal item={preview} size={190}/>:<ShopItemPreview item={preview} size={220}/>}{preview.type==='animations'&&<Celebration key={`${preview.id}-${previewRun}`} preview effect={preview.id.replace('anim_','')}/>}</View><Text style={s.heading}>{preview.name}</Text><Text style={s.body}>{preview.description}</Text>
     {preview.type==='animations'&&<Button secondary onPress={()=>setPreviewRun(n=>n+1)}>Replay animation</Button>}
     {preview.type==='themes'&&<Text style={s.detail}>This artwork becomes your app background.</Text>}
     {preview.items&&preview.items.map(id=><Text key={id} style={s.body}>{catalog[id]?.name||id}</Text>)}</>}
    <Button onPress={()=>{stop();setPreview(null);}}>Done</Button>
   </ScrollView></MotionScreen></View>
  </Modal>}
  {checkout && <Modal visible transparent animationType={reduced?'none':'fade'} onRequestClose={()=>{if(!busy)setCheckout(null);}}>
   <View style={s.shade}><View style={s.modal}><Text style={s.heading}>{collection.requiresParentApproval?'Ask your parent':'Review your purchase'}</Text>
    {checkout?.lines.map(line=><Text key={line.id} style={s.body}>{catalog[line.id]?.name} · {line.amount} RP</Text>)}
    <Text style={s.heading}>Total: {checkout?.amount} RP</Text><Text style={s.detail}>{collection.requiresParentApproval?'Your parent reviews the cost and pays from their Rise Points.':'Owned bundle contents are deducted from this total.'}</Text>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button disabled={busy} onPress={()=>run(buy)}>{busy?'Working…':collection.requiresParentApproval?'Send request':`Buy for ${checkout?.amount} RP`}</Button>
    <Button secondary disabled={busy} onPress={()=>setCheckout(null)}>Back</Button>
   </View></View>
  </Modal>}
 </View>;
}
const s=StyleSheet.create({top:{padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#FFFFFFE8'},heading:{fontSize:18,fontWeight:'800',color:sunrise.ink},body:{fontSize:15,lineHeight:21,color:'#514D60'},detail:{fontSize:13,lineHeight:19,color:'#5C5768'},row:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{backgroundColor:'#FFFFFFEF',borderWidth:1,borderColor:'#EBE2D8',borderRadius:22,padding:16,flexDirection:'row',flexWrap:'wrap',gap:14},button:{backgroundColor:sunrise.orange,borderRadius:16,minHeight:44,paddingHorizontal:16,paddingVertical:12,justifyContent:'center',alignItems:'center'},buttonText:{color:sunrise.ink,fontWeight:'700',fontSize:14},secondary:{backgroundColor:'#E8F1ED'},categories:{flexDirection:'row',flexWrap:'wrap',padding:10,gap:8,flexShrink:0,zIndex:1},tab:{width:'22%',flexGrow:1,minHeight:70,borderWidth:1,borderColor:sunrise.border,padding:8,borderRadius:22,alignItems:'center',gap:5,backgroundColor:'#FFFFFFCC'},activeTab:{backgroundColor:sunrise.orangeTint,borderColor:sunrise.orange},error:{color:'#9A253A',padding:12,fontSize:15},notice:{color:'#246459',padding:12,fontSize:14},cart:{padding:14,gap:10,backgroundColor:'#FFF',borderTopWidth:1,borderColor:'#EAE4DA'},shade:{flex:1,backgroundColor:'#24213899',alignItems:'center',justifyContent:'center',padding:20},modal:{flex:0,width:'100%',maxWidth:460,maxHeight:'90%',padding:22,borderRadius:26,backgroundColor:'#FFF9F2',gap:14}});
