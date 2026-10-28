const {validateTheme,imageProviders,generateImage}=require('../src/themeStudio');
const theme={name:'Cloud Garden',description:'Soft garden colors',price:350,design:{gradient:['#88AA77','#447766'],backgroundUrl:'https://api.example.invalid/uploads/themes/'+ 'a'.repeat(64)+'.jpg',backgroundOpacity:.22,motion:'petals'}};
test('theme schema preserves readable surfaces and bounded motion/opacity',()=>{expect(validateTheme(theme).design.surface).toBe('#FFFFFF');for(const design of [{backgroundOpacity:1},{backgroundUrl:'https://evil.invalid/image.jpg'},{gradient:['red','blue']},{motion:'script'}])expect(()=>validateTheme({...theme,design:{...theme.design,...design}})).toThrow();});
test('retired Nebius image models are never selected by default',()=>{expect(imageProviders({NEBIUS_API_KEY:'test',OPENAI_API_KEY:'test'}).map(p=>p.name)).toEqual(['openai']);});
test('explicit Nebius endpoint precedes fallback and cannot send keys to unrelated hosts',()=>{const env={NEBIUS_IMAGE_ENDPOINT:'https://images.nebius.cloud/v1/images/generations',NEBIUS_IMAGE_MODEL:'dedicated-flux',NEBIUS_API_KEY:'test',OPENAI_API_KEY:'test'};expect(imageProviders(env).map(p=>p.name)).toEqual(['nebius','openai']);expect(()=>imageProviders({...env,NEBIUS_IMAGE_ENDPOINT:'https://evil.invalid'})).toThrow();});
test('explicit Nebius failure falls back, while ambiguous outcome does not double-generate',async()=>{
 const saved=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 const env={NEBIUS_IMAGE_ENDPOINT:'https://images.nebius.cloud/v1/images/generations',NEBIUS_IMAGE_MODEL:'configured',NEBIUS_API_KEY:'test',OPENAI_API_KEY:'test'};
 const request=jest.fn(async url=>url.endsWith('/moderations')?{ok:true,json:async()=>({results:[{flagged:false}]})}:url.includes('nebius.cloud')?{ok:false,json:async()=>({error:{code:'model_not_found'}})}:{ok:true,json:async()=>({data:[{b64_json:'aGVsbG8='}]})});
 try{expect((await generateImage('A peaceful garden',request,env)).provider).toBe('openai');expect(request.mock.calls.length).toBe(3);
 const unknown=jest.fn(async url=>{if(url.endsWith('/moderations'))return {ok:true,json:async()=>({results:[{flagged:false}]})};throw Error('timeout');});await expect(generateImage('A peaceful garden',unknown,env)).rejects.toThrow(/did not finish/);expect(unknown.mock.calls.length).toBe(2);
 }finally{if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved;}
});
