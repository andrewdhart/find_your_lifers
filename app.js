let apiKey=null
let map
let marker=null
let startPoint=null

let lifeSpecies=new Set()

function saveKey(){

let key=document.getElementById("apikeyInput").value.trim()

if(!key){
alert("Enter API key")
return
}

localStorage.setItem("ebirdKey",key)
startApp()

}

function changeKey(){

localStorage.removeItem("ebirdKey")
location.reload()

}

function startApp(){

apiKey=localStorage.getItem("ebirdKey")

document.getElementById("apikeyScreen").style.display="none"
document.getElementById("app").style.display="block"

initMap()
loadCachedLifeList()

}

if(localStorage.getItem("ebirdKey")){
startApp()
}

function initMap(){

map=L.map("map").setView([40.23,-111.66],9)

L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{maxZoom:19}
).addTo(map)

map.on("click",function(e){

startPoint=e.latlng

if(marker) map.removeLayer(marker)

marker=L.marker(e.latlng).addTo(map)

})

}

function importLifeList(){

let file=document.getElementById("lifeFile").files[0]

if(!file){
alert("Select your eBird CSV first")
return
}

let reader=new FileReader()

reader.onload=function(e){

let csv=e.target.result

localStorage.setItem("lifeCSV",csv)

parseLifeList(csv)

alert("Life list imported!")

}

reader.readAsText(file)

}

function clearLifeList(){

localStorage.removeItem("lifeCSV")
lifeSpecies.clear()

alert("Life list cleared")

}

function loadCachedLifeList(){

let csv=localStorage.getItem("lifeCSV")

if(csv){
parseLifeList(csv)
}

}

function parseLifeList(csv){

lifeSpecies.clear()

let rows=csv.split("\n")

for(let i=1;i<rows.length;i++){

let c=rows[i].split(",")

if(c.length<5) continue

let category=c[2]
let sciName=c[4]

if(category==="species"){
lifeSpecies.add(sciName.trim())
}

}

}

function haversine(lat1,lon1,lat2,lon2){

let R=6371

let dLat=(lat2-lat1)*Math.PI/180
let dLon=(lon2-lon1)*Math.PI/180

let a=
Math.sin(dLat/2)**2+
Math.cos(lat1*Math.PI/180)*
Math.cos(lat2*Math.PI/180)*
Math.sin(dLon/2)**2

let c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))

return R*c

}

async function findBirds(){

if(lifeSpecies.size===0){
alert("Import your life list first")
return
}

if(!startPoint){
alert("Click the map to choose a starting point")
return
}

let radius=document.getElementById("radius").value

let url=`https://api.ebird.org/v2/data/obs/geo/recent?lat=${startPoint.lat}&lng=${startPoint.lng}&dist=${radius}&back=7&maxResults=1000`

let data=await fetch(url,{
headers:{"X-eBirdApiToken":apiKey}
}).then(r=>r.json())

let seen=new Set()
let birds=[]

for(let o of data){

if(lifeSpecies.has(o.sciName)) continue
if(seen.has(o.sciName)) continue

seen.add(o.sciName)

let d=haversine(
startPoint.lat,
startPoint.lng,
o.lat,
o.lng
)

birds.push({
name:o.comName,
loc:o.locName,
dist:d
})

}

birds.sort((a,b)=>a.dist-b.dist)

let list=document.getElementById("results")
list.innerHTML=""

for(let b of birds){

let li=document.createElement("li")

li.innerHTML=`<b>${b.name}</b><br>${b.dist.toFixed(1)} km • ${b.loc}`

list.appendChild(li)

}

}