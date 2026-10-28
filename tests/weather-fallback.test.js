const test=require('node:test'),assert=require('node:assert/strict');
function service(){delete require.cache[require.resolve('../backend/src/services/weather')];return require('../backend/src/services/weather');}
test('bad primary key falls back; duplicate requests share work and cache',async()=>{
 const original=global.fetch,old=process.env.OPENWEATHER_API_KEY;process.env.OPENWEATHER_API_KEY='fixture';let calls=[];
 global.fetch=async(url)=>{calls.push(url);return String(url).includes('openweathermap')?{ok:false,status:401,text:async()=>''}:{ok:true,json:async()=>({current:{temperature_2m:12.3,wind_speed_10m:10,relative_humidity_2m:80,weather_code:2}})};};
 try{const {getCurrentWeather}=service(),args={lat:0,lon:0};const rows=await Promise.all([getCurrentWeather(args),getCurrentWeather(args)]);assert.equal(rows[0].temperature,12);assert.equal(rows[0].apparentTemperature,null);assert.equal(calls.length,2);await getCurrentWeather(args);assert.equal(calls.length,2);}finally{global.fetch=original;if(old===undefined)delete process.env.OPENWEATHER_API_KEY;else process.env.OPENWEATHER_API_KEY=old;}
});
test('invalid response cannot become zero degrees and invalid coordinates never fetch',async()=>{
 const original=global.fetch,old=process.env.OPENWEATHER_API_KEY;delete process.env.OPENWEATHER_API_KEY;let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>({current:{temperature_2m:null}})};};
 try{const api=service();await assert.rejects(api.getCurrentWeather({lat:0,lon:0}),/could not refresh/);await assert.rejects(api.getCurrentWeather({lat:91,lon:0}),/Invalid/);assert.equal(calls,1);}finally{global.fetch=original;if(old!==undefined)process.env.OPENWEATHER_API_KEY=old;}
});
test('metric and imperial wind units are consistent across providers',async()=>{
 const original=global.fetch;process.env.OPENWEATHER_API_KEY='fixture';global.fetch=async()=>({ok:true,json:async()=>({main:{temp:21},wind:{speed:10}})});
 try{const api=service();assert.equal((await api.getCurrentWeatherOpenWeather({lat:0,lon:0})).windSpeed,36);assert.equal((await api.getCurrentWeatherOpenWeather({lat:0,lon:0,units:'imperial'})).windSpeed,10);}finally{global.fetch=original;delete process.env.OPENWEATHER_API_KEY;}
});
