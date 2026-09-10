import { useEffect, useState } from 'react'
import { CarFront, MapPin, Navigation } from 'lucide-react'

type Spark = { id:number; x:number; y:number }

/** Interacciones inspiradas en los componentes gratuitos de React Bits:
 * Click Spark, Spotlight Card, Aurora y Floating Lines, adaptadas a Ride. */
export function ReactBitsEffects({ scene = 'panel' }: { scene?: 'auth' | 'panel' }){
  const [sparks,setSparks]=useState<Spark[]>([])
  useEffect(()=>{void import('../motion-effects.css')},[])
  useEffect(()=>{
    let id=0
    const move=(event:PointerEvent)=>{
      document.documentElement.style.setProperty('--ride-pointer-x',`${event.clientX}px`)
      document.documentElement.style.setProperty('--ride-pointer-y',`${event.clientY}px`)
    }
    const click=(event:MouseEvent)=>{
      const next={id:++id,x:event.clientX,y:event.clientY}
      setSparks(current=>[...current.slice(-4),next])
      window.setTimeout(()=>setSparks(current=>current.filter(item=>item.id!==next.id)),620)
    }
    const magneticSelector='.passenger-sidebar nav button,.driver-sidebar nav button,.admin-sidebar .nav-group button,.passenger-mobile-nav button,.driver-mobile-nav button'
    const spotlightSelector='.feature-card,.start-ride-card,.active-trip,.request-form,.quote-card,.settings-card,.account-settings-form,.driver-status-card,.driver-summary article,.driver-request-list article,.vehicle-list article,.document-list article,.admin-card,.metric-strip article,.admin-metrics article,.user-row,.trip-row,.driver-row,.queue-row'
    const magnet=(event:PointerEvent)=>{
      const button=(event.target as Element | null)?.closest<HTMLButtonElement>(magneticSelector)
      if(!button)return
      const rect=button.getBoundingClientRect()
      const x=(event.clientX-(rect.left+rect.width/2))*.16
      const y=(event.clientY-(rect.top+rect.height/2))*.2
      button.style.setProperty('--ride-magnet-x',`${x.toFixed(1)}px`)
      button.style.setProperty('--ride-magnet-y',`${y.toFixed(1)}px`)
      button.classList.add('ride-magnetic-active')
    }
    const release=(event:PointerEvent)=>{
      const button=(event.target as Element | null)?.closest<HTMLButtonElement>(magneticSelector)
      if(!button||button.contains(event.relatedTarget as Node | null))return
      button.style.removeProperty('--ride-magnet-x');button.style.removeProperty('--ride-magnet-y')
      button.classList.remove('ride-magnetic-active')
    }
    const spotlight=(event:PointerEvent)=>{
      const card=(event.target as Element | null)?.closest<HTMLElement>(spotlightSelector)
      if(!card)return
      const rect=card.getBoundingClientRect()
      card.style.setProperty('--ride-card-x',`${event.clientX-rect.left}px`)
      card.style.setProperty('--ride-card-y',`${event.clientY-rect.top}px`)
      card.classList.add('ride-spotlight-active')
      if(!card.querySelector(':scope > .bits-card-glow')){
        const glow=document.createElement('span');glow.className='bits-card-glow';glow.setAttribute('aria-hidden','true');card.append(glow)
      }
    }
    const spotlightOut=(event:PointerEvent)=>{
      const card=(event.target as Element | null)?.closest<HTMLElement>(spotlightSelector)
      if(!card||card.contains(event.relatedTarget as Node | null))return
      card.classList.remove('ride-spotlight-active')
    }
    window.addEventListener('pointermove',move,{passive:true});window.addEventListener('click',click)
    document.addEventListener('pointermove',magnet,{passive:true});document.addEventListener('pointerout',release,{passive:true})
    document.addEventListener('pointermove',spotlight,{passive:true});document.addEventListener('pointerout',spotlightOut,{passive:true})
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('click',click);document.removeEventListener('pointermove',magnet);document.removeEventListener('pointerout',release);document.removeEventListener('pointermove',spotlight);document.removeEventListener('pointerout',spotlightOut);document.querySelectorAll('.bits-card-glow').forEach((glow)=>glow.remove())}
  },[])
  return <div className={`react-bits-layer bits-scene-${scene}`} aria-hidden="true"><div className="bits-aurora"/><div className="bits-orb orb-a"/><div className="bits-orb orb-b"/>{scene==='auth'&&<div className="bits-journey"><svg viewBox="0 0 1200 620" preserveAspectRatio="none"><path className="bits-road-shadow" d="M-30 500C170 390 205 560 390 448S680 230 805 330 1005 440 1235 175"/><path className="bits-road" d="M-30 500C170 390 205 560 390 448S680 230 805 330 1005 440 1235 175"/></svg><span className="bits-waypoint waypoint-a"><Navigation size={17}/></span><span className="bits-waypoint waypoint-b"><MapPin size={18}/></span><span className="bits-moving-car"><CarFront size={22}/></span><i className="bits-signal signal-a"/><i className="bits-signal signal-b"/></div>}{sparks.map(s=><span className="bits-click-spark" style={{left:s.x,top:s.y}} key={s.id}>{Array.from({length:8},(_,i)=><i style={{'--spark-i':i} as React.CSSProperties} key={i}/>)}</span>)}</div>
}
