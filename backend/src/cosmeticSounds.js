// Original synthesized audio, generated locally. No provider calls or third-party recordings.
function synthesizeSound(id) {
  if (!['sound_birds', 'sound_rain', 'sound_motivational'].includes(id)) return null;
  const rate = 22050, seconds = 12, count = rate * seconds, out = Buffer.alloc(44 + count * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24); out.writeUInt32LE(rate*2,28); out.writeUInt16LE(2,32); out.writeUInt16LE(16,34);
  out.write('data',36); out.writeUInt32LE(count*2,40);
  let noise = 18417, smooth = 0;
  const notes = [261.63,329.63,392,523.25,440,392,329.63,523.25];
  for (let i=0;i<count;i++) {
    const t=i/rate, fade=Math.min(1,t/1.5,(seconds-t)/1.5); let value;
    if (id === 'sound_rain') {
      noise=(Math.imul(noise,1664525)+1013904223)|0;
      smooth=.93*smooth+.07*(noise/2147483648);
      value=smooth*.9+.07*Math.sin(2*Math.PI*220*t)*Math.sin(Math.PI*t/3)**2;
    } else if (id === 'sound_birds') {
      const p=t%1.3, envelope=p<.45?Math.sin(Math.PI*p/.45)**2:0;
      value=.16*envelope*Math.sin(2*Math.PI*(1250*p+800*p*p))+.035*Math.sin(2*Math.PI*330*t);
    } else {
      const p=t%.75, frequency=notes[Math.floor(t/.75)%notes.length];
      value=.15*Math.exp(-p*5)*Math.sin(Math.PI*Math.min(1,p/.02)/2)*(Math.sin(2*Math.PI*frequency*t)+.3*Math.sin(4*Math.PI*frequency*t));
    }
    out.writeInt16LE(Math.round(Math.max(-.5,Math.min(.5,value*fade))*32767),44+i*2);
  }
  return out;
}
function registerCosmeticSounds(app, requireAuth) {
 const cache=new Map();
 app.get('/api/cosmetics/sounds/:id', requireAuth, (req,res)=>{
  let bytes=cache.get(req.params.id);
  if(!bytes){bytes=synthesizeSound(req.params.id);if(bytes)cache.set(req.params.id,bytes);}
  if(!bytes)return res.sendStatus(404);
  res.set('Content-Type','audio/wav').set('Cache-Control','private, max-age=86400').send(bytes);
 });
}
module.exports={synthesizeSound,registerCosmeticSounds};
