const crypto = require('crypto');
const { sealDocument, openDocument } = require('./family');
const ISSUER = 'https://accounts.example.invalid/api/auth';
const CLIENT_ID = 'risequest-mobile';
const CALLBACK = 'https://api.example.invalid/api/auth/golden/callback';
const RESOURCE = 'https://api.example.invalid';
const fail = (status,message,code) => Object.assign(new Error(message),{status,code});
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
function verifyGoldenIdentity(token, nonce, keys, now = Math.floor(Date.now()/1000)) {
  if(typeof token!=='string'||token.length>16000)throw fail(401,'GoldenEpics identity could not be verified.');
  const parts=token.split('.');if(parts.length!==3||parts.some(p=>!/^[a-zA-Z0-9_-]+$/.test(p)))throw fail(401,'Invalid identity.');
  let header,claims;try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch(_){throw fail(401,'Invalid identity.');}
  if(!header||header.crit||!['EdDSA','ES256','RS256'].includes(header.alg)||typeof header.kid!=='string')throw fail(401,'Invalid identity signature.');
  const types={EdDSA:'OKP',ES256:'EC',RS256:'RSA'};
  const matches=keys.filter(k=>k.kid===header.kid&&k.kty===types[header.alg]&&(!k.alg||k.alg===header.alg)&&(!k.use||k.use==='sig')&&(!k.key_ops||k.key_ops.includes('verify')));
  if(matches.length!==1)throw fail(401,'Unknown identity signing key.');
  const jwk=matches[0];if((header.alg==='EdDSA'&&jwk.crv!=='Ed25519')||(header.alg==='ES256'&&jwk.crv!=='P-256'))throw fail(401,'Invalid identity signing key.');
  let valid=false;
  try{const key=crypto.createPublicKey({key:jwk,format:'jwk'});valid=crypto.verify(header.alg==='EdDSA'?null:'sha256',Buffer.from(`${parts[0]}.${parts[1]}`),header.alg==='ES256'?{key,dsaEncoding:'ieee-p1363'}:key,Buffer.from(parts[2],'base64url'));}catch(_){}
  if(!valid)throw fail(401,'Invalid identity signature.');
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==ISSUER||!audience.includes(CLIENT_ID)||(audience.length>1&&claims.azp!==CLIENT_ID)||
    (claims.azp&&claims.azp!==CLIENT_ID)||claims.nonce!==nonce||!Number.isFinite(claims.exp)||claims.exp<=now-5||
    !Number.isFinite(claims.iat)||claims.iat>now+5||claims.iat<now-900||(claims.nbf!=null&&(!Number.isFinite(claims.nbf)||claims.nbf>now+5))||
    typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)throw fail(401,'GoldenEpics identity did not match this sign-in.');
  return claims;
}
async function discovery(request=fetch) {
  const response=await request(`${ISSUER}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok)throw fail(503,'GoldenEpics sign-in is temporarily unavailable.');
  const config=await response.json();
  if(config.issuer!==ISSUER)throw fail(503,'GoldenEpics configuration could not be verified.');
  for(const key of ['authorization_endpoint','token_endpoint','userinfo_endpoint','jwks_uri']){
    const url=new URL(config[key]);if(url.origin!=='https://accounts.example.invalid'||!url.pathname.startsWith('/api/auth/')||url.username||url.password)throw fail(503,'GoldenEpics configuration could not be verified.');
  }
  if(!config.code_challenge_methods_supported?.includes('S256'))throw fail(503,'GoldenEpics secure sign-in is unavailable.');
  return config;
}
async function resolveIdentity(tx, claims, info, flow) {
  if(info.sub!==claims.sub)throw fail(401,'GoldenEpics account verification did not match.');
  const existing=await tx.goldenIdentity.findUnique({where:{subject:claims.sub},include:{user:true}});
  if(existing){
    if(existing.user.disabledAt||existing.user.authProvider==='child')throw fail(403,'This account is unavailable.');
    if(flow.linkUserId&&existing.userId!==flow.linkUserId)throw fail(409,'This GoldenEpics account is linked to another RiseQuest account.');
    return existing.user;
  }
  let user;
  if(flow.linkUserId){
    user=await tx.user.findUnique({where:{id:flow.linkUserId}});
    if(!user||user.disabledAt||user.authProvider==='child')throw fail(403,'Sign in to your RiseQuest account again.');
    if(await tx.goldenIdentity.findUnique({where:{userId:user.id}}))throw fail(409,'A GoldenEpics account is already linked.');
  }else{
    const email=String(info.email||claims.email||'').trim().toLowerCase();
    const verified=info.email?info.email_verified:claims.email_verified;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||![true,'true'].includes(verified))throw fail(401,'A verified GoldenEpics email is required.');
    user=await tx.user.findUnique({where:{id:email}});
    if(user){
      if(user.disabledAt||user.authProvider==='child')throw fail(403,'This account is unavailable.');
      // A verified email from our trusted issuer reconnects to the same account.
      // Never move a previously linked subject or replace another linked identity.
      if(await tx.goldenIdentity.findUnique({where:{userId:user.id}}))throw fail(409,'A different GoldenEpics identity is already linked. Sign in using your existing method.');
    }else{
      if(!require('./agePolicy').canRegister(flow.ageBand,flow.countryCode))throw fail(400,'Select your age and country before creating an account.','AGE_SCREEN_REQUIRED');
      user=await tx.user.create({data:{id:email,name:String(info.name||'RiseQuest User').slice(0,100),authProvider:'goldenepics',profile:{create:{data:{ageBand:flow.ageBand,countryCode:flow.countryCode,ageGroup:flow.ageBand==='adult'?'adult':'teen',preferences:{analyticsOptIn:false}}}}}});
    }
  }
  await tx.goldenIdentity.create({data:{subject:claims.sub,userId:user.id}});
  return user;
}
function registerGoldenAuth(app,{prisma,requireAuth,issueAuthToken,secret}) {
  const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'GoldenEpics sign-in could not finish. Please try again.',...(e.code&&e.status?{code:e.code}:{})});}};
  const start=link=>wrap(async(req,res)=>{
    if(process.env.GOLDENEPICS_AUTH_ENABLED!=='true')throw fail(503,'GoldenEpics sign-in is being connected. Please use another sign-in method for now.');
    if(link&&(!req.auth.issuedAt||Date.now()/1000-req.auth.issuedAt>600))throw fail(401,'Sign in again before linking GoldenEpics.');
    const config=await discovery(),state=random(),pollSecret=random(),verifier=random(),nonce=random(),id=digest(state);
    const flow={verifier,nonce,ageBand:req.body.ageBand,countryCode:req.body.countryCode,linkUserId:link?req.auth.userId:null};
    await prisma.goldenAuthSession.deleteMany({where:{expiresAt:{lt:new Date()}}});
    await prisma.goldenAuthSession.create({data:{id,pollHash:digest(pollSecret),secret:sealDocument(Buffer.from(JSON.stringify(flow)),secret,`golden:${id}`),expiresAt:new Date(Date.now()+15*60000)}});
    const url=new URL(config.authorization_endpoint);
    for(const [k,v] of Object.entries({client_id:CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:'openid profile email',resource:RESOURCE,state,nonce,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(k,v);
    res.json({authorizationUrl:url.toString(),pollSecret,expiresIn:900});
  });
  app.post('/api/auth/golden/start',start(false));
  app.post('/api/auth/golden/link',requireAuth,start(true));
  app.get('/api/auth/golden/callback',async(req,res)=>{
    res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    let row;
    try{
      if(typeof req.query.state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(req.query.state))throw fail(401,'Invalid sign-in state.');
      const id=digest(req.query.state);row=await prisma.goldenAuthSession.findUnique({where:{id}});
      if(!row||row.status!=='PENDING'||row.expiresAt<=new Date())throw fail(401,'Sign-in expired.');
      const claimed=await prisma.goldenAuthSession.updateMany({where:{id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'EXCHANGING'}});
      if(claimed.count!==1)throw fail(401,'Sign-in is already being completed.');
      if(req.query.error)throw fail(400,'GoldenEpics sign-in was canceled.');
      if(typeof req.query.code!=='string'||req.query.code.length>4096)throw fail(400,'Missing authorization code.');
      const flow=JSON.parse(openDocument(row.secret,secret,`golden:${id}`).toString());
      const config=await discovery();
      const response=await fetch(config.token_endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:req.query.code,client_id:CLIENT_ID,redirect_uri:CALLBACK,code_verifier:flow.verifier,resource:RESOURCE})});
      if(!response.ok)throw fail(401,'GoldenEpics verification failed.');
      const tokens=await response.json();
      if(typeof tokens.access_token!=='string'||tokens.access_token.length>16000||tokens.token_type?.toLowerCase()!=='bearer')throw fail(401,'Invalid authorization response.');
      const keysResponse=await fetch(config.jwks_uri,{redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!keysResponse.ok)throw fail(503,'Identity signing keys unavailable.');
      const keys=(await keysResponse.json()).keys;
      if(!Array.isArray(keys)||keys.length>50)throw fail(401,'Invalid signing keys.');
      const claims=verifyGoldenIdentity(tokens.id_token,flow.nonce,keys);
      const infoResponse=await fetch(config.userinfo_endpoint,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${tokens.access_token}`}});
      if(!infoResponse.ok)throw fail(401,'GoldenEpics account could not be verified.');
      const info=await infoResponse.json();
      await prisma.$transaction(async tx=>{
        const user=await resolveIdentity(tx,claims,info,flow);
        await tx.goldenAuthSession.update({where:{id},data:{status:'READY',result:sealDocument(Buffer.from(JSON.stringify({userId:user.id,linked:Boolean(flow.linkUserId)})),secret,`golden-result:${id}`)}});
      },{isolationLevel:'Serializable'});
      res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width"><title>Return to RiseQuest</title><main style="font:20px system-ui;max-width:520px;padding:40px;margin:auto"><h1>You’re ready.</h1><p>Return to RiseQuest to finish signing in.</p></main>');
    }catch(e){
      if(row)await prisma.goldenAuthSession.updateMany({where:{id:row.id,status:'EXCHANGING'},data:{status:'FAILED',result:sealDocument(Buffer.from(JSON.stringify({error:e.status?e.message:'Sign-in could not finish. Please try again.',code:e.code||null})),secret,`golden-result:${row.id}`)}}).catch(()=>{});
      res.status(400).type('html').send('<!doctype html><meta name="viewport" content="width=device-width"><title>Return to RiseQuest</title><main style="font:20px system-ui;max-width:520px;padding:40px;margin:auto"><h1>Sign-in didn’t finish.</h1><p>Return to RiseQuest to see the next step.</p></main>');
    }
  });
  app.post('/api/golden/complete',wrap(async(req,res)=>{
    const pollSecret=req.body.pollSecret;if(typeof pollSecret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(pollSecret))throw fail(400,'Invalid sign-in reference.');
    const row=await prisma.goldenAuthSession.findUnique({where:{pollHash:digest(pollSecret)}});
    if(!row||row.expiresAt<=new Date()||row.status==='CONSUMED')throw fail(401,'Sign-in expired. Please start again.');
    if(['PENDING','EXCHANGING'].includes(row.status))return res.json({status:'pending'});
    const result=JSON.parse(openDocument(row.result,secret,`golden-result:${row.id}`).toString());
    if(row.status==='FAILED')return res.status(400).json(result);
    const user=await prisma.$transaction(async tx=>{
      const claimed=await tx.goldenAuthSession.updateMany({where:{id:row.id,status:'READY',expiresAt:{gt:new Date()}},data:{status:'CONSUMED',result:null}});
      if(claimed.count!==1)throw fail(401,'Sign-in already completed.');
      const account=await tx.user.findUnique({where:{id:result.userId}});
      if(!account||account.disabledAt||account.authProvider==='child')throw fail(403,'Account unavailable.');
      return account;
    });
    res.json({status:'complete',linked:result.linked,token:issueAuthToken(user.id,'goldenepics'),user:{id:user.id,email:user.id,displayName:user.name,role:user.role,authProvider:'goldenepics',photoUrl:user.photoUrl,bannerUrl:user.bannerUrl}});
  }));
}
module.exports={registerGoldenAuth,verifyGoldenIdentity,resolveIdentity,discovery,ISSUER,CLIENT_ID,CALLBACK,RESOURCE};
