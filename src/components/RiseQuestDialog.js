import React from 'react';
import AppModal, {AppAlert, DialogSurface} from './AppModal';
export default function RiseQuestDialog({visible,title,description,artwork,children,confirmLabel='Continue',onConfirm,onClose,busy=false,error,cancelLabel='Maybe later',showCancel=true,destructive=false}) {
 const buttons=[{text:confirmLabel,style:destructive?'destructive':'default'},...(showCancel?[{text:cancelLabel,style:'cancel'}]:[])];
 return <AppModal visible={visible} transparent animationType="fade" onRequestClose={()=>{if(!busy)onClose?.();}}>
  <DialogSurface value={{title,description,buttons}} busy={busy} error={error} artwork={artwork} onAction={index=>index===0?onConfirm?.():onClose?.()}>{children}</DialogSurface>
 </AppModal>;
}
export function useRiseQuestDialog(){return {alert:AppAlert.alert,dialog:null};}
