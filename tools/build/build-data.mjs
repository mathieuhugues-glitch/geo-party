import fs from 'fs';
import * as d3 from 'd3-geo';
const OUT='/workspace/geo-party/data';
fs.mkdirSync(OUT,{recursive:true});
const C=fs.readFileSync('/workspace/geo-party/tools/countries.txt','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const [c,n,cap,ft,st,ct,mt]=l.split('|');return {c,n,cap,ft:+ft,st:+st,ct:+ct,mt:+mt};});
const g10=JSON.parse(fs.readFileSync('ne_10m_admin_0_countries.geojson'));
const places=JSON.parse(fs.readFileSync('ne_10m_populated_places_simple.geojson')).features.map(f=>f.properties);
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
const CAP_ALIAS={DK:'København',AD:'Andorra',KI:'Tarawa',GD:"Saint George's",AG:"Saint John's"};
const CAP_COORD={XK:[42.6629,21.1655],PW:[7.5006,134.6242],NR:[-0.5477,166.9209],PS:[31.9038,35.2034]};
const EXTRA_FEATS={CY:['Northern Cyprus','Cyprus No Mans Area','Akrotiri Sovereign Base Area','Dhekelia Sovereign Base Area'],SO:['Somaliland'],KZ:[]};
const CLIP={US:[-125,24,-66,50],FR:[-6,41,10,52],NL:[3,50,8,54],NO:[4,57,32,72],ES:[-10,35.5,5,44.5],PT:[-10,36.5,-6,42.5],CL:[-76,-56,-66,-17],EC:[-82,-6,-75,2],AU:[112,-44,154,-10],NZ:[165,-48,179,-34],ZA:[16,-35,33,-22],YE:[42,12,52.5,19.5],CO:[-80,-5,-66,13],GB:[-9,49.8,2,61],IN:[68,6,98,37.5],EG:[24,21.5,37,32]};
const SHIFT=new Set(['RU','FJ']);
// cities blacklist: places that are debatable capitals / seats of government
const CITY_BLACK=new Set(['The Hague','Putrajaya','Abidjan','Cotonou','Colombo','Sucre','La Paz','Cetinje','Lobamba','Bujumbura','Tel Aviv-Yafo','Tel Aviv','Quezon City','Ciudad de la Paz','Melekeok','Koror','Kotte']);
const CITY_OVR={MR:['Nouadhibou','Kiffa','Rosso'],BT:['Phuntsholing','Paro','Punakha'],MV:['Addu City','Kulhudhuffushi'],BH:['Muharraq','Riffa','Hamad Town'],BN:['Seria','Kuala Belait','Tutong'],TL:['Baucau','Maliana'],FJ:['Nadi','Lautoka','Labasa'],GY:['Linden','New Amsterdam','Bartica'],SR:['Lelydorp','Nieuw Nickerie'],BS:['Freeport'],NA:['Walvis Bay','Swakopmund','Rundu'],BW:['Francistown','Maun','Serowe'],GM:['Serekunda','Brikama'],LR:['Gbarnga','Buchanan'],CF:['Berbérati','Bambari','Bouar'],MU:['Curepipe','Vacoas'],LS:['Maputsoe','Mafeteng'],GW:['Bafatá','Gabú'],PG:['Lae','Mount Hagen','Madang'],TT:['San Fernando','Chaguanas','Arima'],GA:['Port-Gentil','Franceville','Oyem'],GQ:['Bata','Ebebiyín'],BF:['Bobo-Dioulasso','Koudougou','Banfora'],GN:['Nzérékoré','Kankan','Labé'],TJ:['Khujand','Kulob','Bokhtar'],KG:['Osh','Jalal-Abad','Karakol'],LA:['Luang Prabang','Pakse','Savannakhet'],JO:['Irbid','Aqaba','Zarqa'],TD:['Moundou','Sarh','Abéché'],BI:['Ngozi','Muyinga'],AU:['Sydney','Melbourne','Perth','Brisbane'],TR:['Istanbul','Izmir','Antalya','Bursa'],CA:['Toronto','Montreal','Vancouver','Calgary'],BR:['Rio de Janeiro','São Paulo','Salvador','Belo Horizonte'],NG:['Lagos','Kano','Ibadan'],CH:['Zurich','Geneva','Basel','Lausanne'],MM:['Yangon','Mandalay','Mawlamyine'],US:['New York','Los Angeles','Chicago','Philadelphia'],CN:['Shanghai','Guangzhou','Shenzhen','Chongqing'],IN:['Mumbai','Kolkata','Bangalore','Chennai'],PK:['Karachi','Lahore','Faisalabad','Rawalpindi'],NZ:['Auckland','Christchurch','Queenstown','Dunedin'],KZ:['Almaty','Shymkent','Karaganda'],MA:['Casablanca','Marrakesh','Fez','Tangier'],VN:['Ho Chi Minh City','Da Nang','Haiphong'],TZ:['Dar es Salaam','Arusha','Mwanza'],AE:['Dubai','Sharjah','Al Ain'],SA:['Jeddah','Mecca','Medina','Dammam'],NL:['Rotterdam','Utrecht','Eindhoven'],DE:['Munich','Hamburg','Frankfurt','Cologne'],IT:['Milan','Naples','Turin','Venice'],ES:['Barcelona','Seville','Valencia'],RU:['Saint Petersburg','Novosibirsk','Yekaterinburg'],JP:['Osaka','Kyoto','Yokohama'],KR:['Busan','Incheon','Daegu'],CI:['Bouaké','San-Pédro','Daloa'],GB:['Manchester','Birmingham','Edinburgh','Liverpool'],FR:['Marseille','Lyon','Nice','Bordeaux'],PL:['Kraków','Gdańsk','Wrocław'],SE:['Gothenburg','Malmö','Uppsala'],NO:['Bergen','Trondheim','Stavanger'],FI:['Turku','Tampere','Oulu'],DK:['Aarhus','Odense','Aalborg'],EC:['Guayaquil','Cuenca','Manta'],CM:['Douala','Garoua','Bamenda'],BZ:['Belize City','San Ignacio','Orange Walk'],MW:['Blantyre','Mzuzu','Zomba'],AR:['Córdoba','Rosario','Mendoza'],CO:['Medellín','Cali','Cartagena'],MX:['Guadalajara','Monterrey','Puebla'],EG:['Alexandria','Giza','Luxor'],IL:[],KE:['Mombasa','Kisumu','Nakuru'],TH:['Chiang Mai','Phuket','Pattaya'],PH:['Cebu City','Davao','Zamboanga'],TW:['Kaohsiung','Taichung','Tainan'],MY:['George Town','Johor Bahru','Kota Kinabalu'],KH:['Siem Reap','Battambang','Sihanoukville'],IR:['Mashhad','Isfahan','Shiraz'],IQ:['Basra','Mosul','Erbil'],SY:['Aleppo','Homs','Latakia'],LB:['Tripoli','Sidon','Tyre'],GE:['Batumi','Kutaisi','Rustavi'],UA:['Kharkiv','Odesa','Lviv'],BY:['Gomel','Brest','Vitebsk'],CY:['Limassol','Larnaca','Paphos'],MT:['Mdina','Sliema','Birkirkara'],BA:['Banja Luka','Mostar','Tuzla'],HR:['Split','Rijeka','Dubrovnik'],AL:['Durrës','Shkodër','Vlorë'],GR:['Thessaloniki','Patras','Heraklion'],BG:['Plovdiv','Varna','Burgas'],RO:['Cluj-Napoca','Timișoara','Constanța'],RS:['Novi Sad','Niš','Kragujevac'],SK:['Košice','Žilina','Prešov'],CZ:['Brno','Ostrava','Plzeň'],HU:['Debrecen','Szeged','Pécs'],AT:['Salzburg','Graz','Innsbruck'],BE:['Antwerp','Ghent','Bruges'],PT:['Porto','Coimbra','Faro'],IE:['Cork','Galway','Limerick'],IS:['Akureyri','Keflavík','Hafnarfjörður'],LT:['Kaunas','Klaipėda','Šiauliai'],LV:['Daugavpils','Liepāja','Jūrmala'],EE:['Tartu','Narva','Pärnu'],SI:['Maribor','Celje','Koper'],MK:['Bitola','Ohrid','Kumanovo'],ME:['Nikšić','Budva','Kotor'],XK:['Prizren','Peja','Mitrovica'],MD:['Tiraspol','Bălți','Cahul'],AZ:['Ganja','Sumqayit','Lankaran'],AM:['Gyumri','Vanadzor','Vagharshapat'],CU:['Santiago de Cuba','Camagüey','Varadero'],JM:['Montego Bay','Spanish Town','Ocho Rios'],DO:['Santiago de los Caballeros','Punta Cana','La Romana'],HT:['Cap-Haïtien','Gonaïves','Les Cayes'],PE:['Arequipa','Cusco','Trujillo'],CL:['Valparaíso','Concepción','Antofagasta'],VE:['Maracaibo','Valencia','Barquisimeto'],UY:['Punta del Este','Salto','Colonia del Sacramento'],PY:['Ciudad del Este','Encarnación','Luque'],CR:['Limón','Liberia','Puntarenas'],ET:['Dire Dawa','Gondar','Bahir Dar'],GH:['Kumasi','Tamale','Takoradi'],SN:['Touba','Thiès','Saint-Louis'],AO:['Huambo','Lobito','Benguela'],ZW:['Bulawayo','Victoria Falls','Mutare'],UG:['Entebbe','Gulu','Jinja'],RW:['Butare','Gisenyi','Musanze'],DZ:['Oran','Constantine','Annaba'],TN:['Sfax','Sousse','Djerba'],LY:['Benghazi','Misrata','Sabha'],SD:['Omdurman','Port Sudan','Kassala'],SO:['Hargeisa','Kismayo','Berbera'],CD:['Lubumbashi','Goma','Kisangani'],CG:['Pointe-Noire','Dolisie','Owando'],MG:['Toamasina','Mahajanga','Toliara'],OM:['Salalah','Sohar','Nizwa'],QA:['Al Wakrah','Al Khor','Dukhan'],AF:['Kandahar','Herat','Mazar-i-Sharif'],BD:['Chittagong','Khulna','Sylhet'],NP:['Pokhara','Biratnagar','Lalitpur'],UZ:['Samarkand','Bukhara','Namangan'],MN:['Erdenet','Darkhan','Choibalsan'],KP:['Hamhung','Kaesong','Chongjin'],IS2:[]};
// manual coordinates for override cities missing from NE (lat,lon) - only used to ensure distance from capital is not tiny; not displayed
const CNT_SUB={};
function featsFor(code){
  let fs_=g10.features.filter(f=>f.properties.ISO_A2_EH===code && !['Clipperton Island','Indian Ocean Territories','Coral Sea Islands','Ashmore and Cartier Islands','Brazilian Island','Baykonur Cosmodrome'].includes(f.properties.ADMIN));
  for(const a of (EXTRA_FEATS[code]||[])) fs_.push(...g10.features.filter(f=>f.properties.ADMIN===a));
  if(code==='KZ') fs_.push(...g10.features.filter(f=>f.properties.ADMIN==='Baykonur Cosmodrome'));
  return fs_;
}
function polys(geom){return geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiPolygon'?geom.coordinates:[];}
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return a/2;}
function dp(pts,tol){ // Douglas-Peucker, closed ring
  if(pts.length<4) return pts;
  const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;
  const st=[[0,pts.length-1]];
  while(st.length){const [a,b]=st.pop();let md=0,mi=-1;const [x1,y1]=pts[a],[x2,y2]=pts[b];const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;
    for(let i=a+1;i<b;i++){const [x,y]=pts[i];let t=L?((x-x1)*dx+(y-y1)*dy)/L:0;t=Math.max(0,Math.min(1,t));const ex=x1+t*dx-x,ey=y1+t*dy-y;const d=ex*ex+ey*ey;if(d>md){md=d;mi=i;}}
    if(md>tol*tol&&mi>0){keep[mi]=1;st.push([a,mi],[mi,b]);}}
  return pts.filter((_,i)=>keep[i]);
}
function ringsToPath(rings,fmt){let s='';for(const r of rings){s+='M'+r.map(p=>fmt(p[0])+' '+fmt(p[1])).join('L')+'Z';}return s.replace(/L/g,' ').replace(/ -/g,'-');}
// ---------- shapes ----------
const shapes={}; const info={};
for(const ct of C){
  const feats=featsFor(ct.c);
  if(!feats.length){console.error('NO FEATURE',ct.c);continue;}
  const p0=feats[0].properties; info[ct.c]={sub:p0.SUBREGION,cont:p0.CONTINENT,reg:p0.REGION_UN};
  if(!ct.st) continue;
  let P=[];for(const f of feats) P.push(...polys(f.geometry));
  if(SHIFT.has(ct.c)) P=P.map(poly=>poly.map(r=>r.map(([x,y])=>[x<0?x+360:x,y])));
  const clip=CLIP[ct.c];
  if(clip) P=P.filter(poly=>{const r=poly[0];let sx=0,sy=0;for(const [x,y] of r){sx+=x;sy+=y;}sx/=r.length;sy/=r.length;return sx>=clip[0]&&sx<=clip[2]&&sy>=clip[1]&&sy<=clip[3];});
  // generic: majors and nearby minors (approx area in deg^2 * cos lat)
  const A=P.map(poly=>{const r=poly[0];let sy=0;for(const p of r)sy+=p[1];sy/=r.length;return Math.abs(ringArea(r))*Math.cos(sy*Math.PI/180);});
  const tot=A.reduce((a,b)=>a+b,0);
  const maj=P.filter((_,i)=>A[i]>=0.01*tot);
  let bb=[1e9,1e9,-1e9,-1e9];for(const poly of maj)for(const [x,y] of poly[0]){bb[0]=Math.min(bb[0],x);bb[1]=Math.min(bb[1],y);bb[2]=Math.max(bb[2],x);bb[3]=Math.max(bb[3],y);}
  const ex=0.15*Math.hypot(bb[2]-bb[0],bb[3]-bb[1])+0.05;
  P=P.filter((poly,i)=>{if(A[i]>=0.01*tot)return true;const r=poly[0];let sx=0,sy=0;for(const [x,y] of r){sx+=x;sy+=y;}sx/=r.length;sy/=r.length;return sx>=bb[0]-ex&&sx<=bb[2]+ex&&sy>=bb[1]-ex&&sy<=bb[3]+ex;});
  let fb=[1e9,1e9,-1e9,-1e9];for(const poly of P)for(const [x,y] of poly[0]){fb[0]=Math.min(fb[0],x);fb[1]=Math.min(fb[1],y);fb[2]=Math.max(fb[2],x);fb[3]=Math.max(fb[3],y);}
  const cx=(fb[0]+fb[2])/2, cy=(fb[1]+fb[3])/2;
  const proj=d3.geoAzimuthalEqualArea().rotate([-cx,-cy]).scale(1000).translate([0,0]);
  let R=[];for(const poly of P)for(const r of poly) R.push(r.map(p=>proj(p)));
  let xb=[1e9,1e9,-1e9,-1e9];for(const r of R)for(const [x,y] of r){xb[0]=Math.min(xb[0],x);xb[1]=Math.min(xb[1],y);xb[2]=Math.max(xb[2],x);xb[3]=Math.max(xb[3],y);}
  const w=xb[2]-xb[0],h=xb[3]-xb[1],s=1000/Math.max(w,h);
  const ox=(1000-w*s)/2, oy=(1000-h*s)/2;
  R=R.map(r=>dp(r.map(([x,y])=>[(x-xb[0])*s+ox,(y-xb[1])*s+oy]),1.2)).filter(r=>r.length>=4&&Math.abs(ringArea(r))>2);
  shapes[ct.c]=ringsToPath(R,v=>Math.round(v));
}
// ---------- capitals & cities ----------
const out=[];
function hav(a,b,c,d){const R=6371,t=x=>x*Math.PI/180;const dl=t(c-a),dn=t(d-b);const h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const report=[];
for(const ct of C){
  let lat,lon;
  if(CAP_COORD[ct.c]) [lat,lon]=CAP_COORD[ct.c];
  else{const nm=norm(CAP_ALIAS[ct.c]||ct.cap);const m=places.filter(x=>x.iso_a2===ct.c&&(norm(x.name)===nm||norm(x.nameascii||'')===nm)).sort((a,b)=>b.adm0cap-a.adm0cap||b.pop_max-a.pop_max)[0];
    if(!m){console.error('NO CAPITAL',ct.c,ct.cap);continue;} lat=m.latitude;lon=m.longitude;}
  let cities=CITY_OVR[ct.c];
  if(!cities){
    cities=places.filter(x=>x.iso_a2===ct.c&&x.pop_max>=30000&&!CITY_BLACK.has(x.name)&&norm(x.name)!==norm(ct.cap)&&hav(lat,lon,x.latitude,x.longitude)>40)
      .sort((a,b)=>b.pop_max-a.pop_max).map(x=>x.name).filter((v,i,a)=>a.indexOf(v)===i).slice(0,3);
  }
  cities=cities.filter(x=>norm(x)!==norm(ct.cap)&&!CITY_BLACK.has(x));
  if(ct.ct) report.push(ct.c+' '+ct.cap+' :: '+cities.join(', '));
  out.push({c:ct.c,n:ct.n,cap:ct.cap,lat:+lat.toFixed(4),lon:+lon.toFixed(4),ft:ct.ft,st:ct.st,ct:ct.ct,mt:ct.mt,sub:info[ct.c]?.sub,cont:info[ct.c]?.cont,cities});
}
fs.writeFileSync('cities_report.txt',report.join('\n'));
fs.writeFileSync(OUT+'/geo-data.js','// Generated by tools/build-data.mjs from Natural Earth (public domain) + curated lists\nwindow.GEO_DATA='+JSON.stringify({countries:out,shapes})+';\n');
// ---------- world map (Mercator, 50m) ----------
const g50=JSON.parse(fs.readFileSync('ne_50m_admin_0_countries.geojson'));
const W=2000, LAT_TOP=83, LAT_BOT=-57;
const my=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const Y0=my(LAT_TOP), H=Math.round((Y0-my(LAT_BOT))*W/(2*Math.PI));
const pj=([lon,lat])=>[(lon+180)/360*W,(Y0-my(Math.max(LAT_BOT-5,Math.min(LAT_TOP+3,lat))))*W/(2*Math.PI)];
let md='';
for(const f of g50.features){if(f.properties.ADMIN==='Antarctica')continue;
  const R=[];for(const poly of polys(f.geometry))for(const r of poly){const q=dp(r.map(pj),0.35);if(q.length>=4&&Math.abs(ringArea(q))>0.15)R.push(q);}
  md+=ringsToPath(R,v=>(Math.round(v*10)/10).toString());}
fs.writeFileSync(OUT+'/worldmap.js','// Generated from Natural Earth 1:50m admin-0 (public domain), Mercator\nwindow.WORLD_MAP='+JSON.stringify({w:W,h:H,latTop:LAT_TOP,latBot:LAT_BOT,d:md})+';\n');
console.log('countries',out.length,'shapes',Object.keys(shapes).length,'geo-data KB',(fs.statSync(OUT+'/geo-data.js').size/1024)|0,'map KB',(fs.statSync(OUT+'/worldmap.js').size/1024)|0,'H',H);
