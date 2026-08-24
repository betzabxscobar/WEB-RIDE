import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const dataDir=join(root,'data'); const usersFile=join(dataDir,'users.json'); const credentialsFile=join(dataDir,'credenciales-administrativas.txt')
const accounts=[
  {name:'Betzabe Escobar',email:'betzabxscobar@gmail.com',role:'superadmin'},
  {name:'Andrés Zurita',email:'dandreszurtaf23@gmail.com',role:'superadmin'},
  {name:'Alex Yánez',email:'alexyanez1119@gmail.com',role:'admin'},
  {name:'Mayuri Remache',email:'mayuriremache0@gmail.com',role:'admin'},
  {name:'Javier Conforme',email:'javierconforme18@gmail.com',role:'admin'},
]
const passwordFor=()=>`Ride-${randomBytes(9).toString('base64url')}!`
const hashPassword=(password)=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`}
await mkdir(dataDir,{recursive:true})
let users=[];try{users=JSON.parse(await readFile(usersFile,'utf8'))}catch{}
const credentials=[]
for(const account of accounts){
  const password=passwordFor(); const existing=users.find(user=>user.email===account.email)
  const values={...account,phone:'ADMIN',mustChangePassword:true,passwordHash:hashPassword(password),passwordChangedAt:null}
  if(existing)Object.assign(existing,values);else users.push({id:randomUUID(),...values,createdAt:new Date().toISOString()})
  credentials.push(`${account.role.toUpperCase()} | ${account.email} | ${password}`)
}
await writeFile(usersFile,JSON.stringify(users,null,2))
await writeFile(credentialsFile,`CREDENCIALES TEMPORALES DE RIDE\nGeneradas: ${new Date().toISOString()}\nDeben entregarse por separado y eliminarse después del primer acceso.\n\n${credentials.join('\n')}\n`)
console.log(`Cuentas administrativas creadas. Credenciales guardadas localmente en: ${credentialsFile}`)
