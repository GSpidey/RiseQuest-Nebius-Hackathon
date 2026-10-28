// One queue preserves every action, including alerts with more than three choices.
export function createDialogQueue() {
 let sequence=0, queue=[], hosts=new Map();
 const top=()=>[...hosts.values()].sort((a,b)=>b.depth-a.depth||b.order-a.order)[0];
 const emit=()=>{const owner=top();hosts.forEach(h=>h.update(h===owner?queue[0]||null:null));};
 const remove=id=>{if(queue[0]?.id!==id)return null;const value=queue.shift();emit();return value;};
 return {
  register(key,depth,update){hosts.set(key,{depth,update,order:++sequence});emit();return()=>{hosts.delete(key);emit();};},
  alert(title,message,buttons,options={}) {queue.push({id:++sequence,title:String(title||''),description:String(message||''),buttons:buttons?.length?buttons:[{text:'OK'}],options});emit();},
  choose(id,index){const current=queue[0];if(current?.id!==id||!current.buttons[index])return;remove(id);return current.buttons[index].onPress?.();},
  dismiss(id){const current=queue[0];if(current?.id!==id)return false;if(current.options.cancelable){remove(id);current.options.onDismiss?.();}return true;},
  active(){return queue[0]||null;},
 };
}
export const dialogQueue=createDialogQueue();
export const AppAlert={alert:(...args)=>dialogQueue.alert(...args)};
