import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const dataDir=join(root,'data'); const usersFile=join(dataDir,'users.json')
const email=(process.env.ADMIN_EMAIL||'admin@ride.local').trim().toLowerCase()
const password=process.env.ADMIN_PASSWORD||'RideAdmin#2026!'
const name=process.env.ADMIN_NAME||'Betzabe Admin'
await mkdir(dataDir,{recursive:true})
let users=[]; try{users=JSON.parse(await readFile(usersFile,'utf8'))}catch{}
const salt=randomBytes(16).toString('hex'); const passwordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`
const existing=users.find(user=>user.email===email)
if(existing){Object.assign(existing,{name,phone:'ADMIN',role:'superadmin',passwordHash})}else{users.push({id:randomUUID(),name,email,phone:'ADMIN',role:'superadmin',passwordHash,createdAt:new Date().toISOString()})}
await writeFile(usersFile,JSON.stringify(users,null,2))
console.log(`Superadmin listo: ${email}`)
