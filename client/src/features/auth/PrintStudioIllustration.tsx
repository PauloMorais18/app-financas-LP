import { Box, Layers3, CircleDollarSign } from "lucide-react";

/** Decorative vector scene: a printer and the work around it, with no account data. */
export default function PrintStudioIllustration() {
  return <div className="login-print-studio" aria-hidden="true">
    <svg className="login-printer-art" viewBox="0 0 480 310" fill="none">
      <defs>
        <linearGradient id="printer-frame" x1="153" y1="62" x2="340" y2="253" gradientUnits="userSpaceOnUse"><stop stopColor="#376fa9"/><stop offset="1" stopColor="#153e73"/></linearGradient>
        <linearGradient id="printer-side" x1="300" y1="90" x2="380" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#d7e4f2"/><stop offset="1" stopColor="#9db6d5"/></linearGradient>
        <linearGradient id="printed-vase" x1="217" y1="158" x2="272" y2="235" gradientUnits="userSpaceOnUse"><stop stopColor="#8dddc9"/><stop offset=".48" stopColor="#51bda4"/><stop offset="1" stopColor="#288f7a"/></linearGradient>
        <linearGradient id="printer-bed" x1="169" y1="213" x2="318" y2="244" gradientUnits="userSpaceOnUse"><stop stopColor="#e7f0fa"/><stop offset="1" stopColor="#bdd1e7"/></linearGradient>
        <pattern id="studio-grid" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .3 -1 .3 240 190)"><path d="M22 0H0V22" stroke="#dbe6f1" strokeWidth="1"/></pattern>
        <clipPath id="vase-clip"><path d="M224 164C225 178 211 186 215 202L220 225Q243 238 267 224L272 202C276 184 260 178 262 164Z"/></clipPath>
      </defs>
      <ellipse cx="247" cy="258" rx="169" ry="38" fill="#e9f0f7"/>
      <path d="M55 222L243 164L432 222L243 284Z" fill="url(#studio-grid)" opacity=".75"/>
      <ellipse cx="247" cy="249" rx="103" ry="20" fill="#b7c9df" opacity=".27"/>
      {/* Filament spool and feeding tube. */}
      <path d="M298 99C328 3 197 5 205 96" stroke="#6b8aac" strokeWidth="3" strokeLinecap="round"/>
      <path d="M316 95L348 87V137L316 145Z" fill="#bccde1"/>
      <ellipse cx="336" cy="102" rx="25" ry="32" fill="#8ca8cc" transform="rotate(-12 336 102)"/>
      <ellipse cx="329" cy="103" rx="25" ry="32" fill="#edf3fa" transform="rotate(-12 329 103)"/>
      <ellipse cx="329" cy="103" rx="18" ry="24" fill="#3f78c1" transform="rotate(-12 329 103)"/>
      <ellipse cx="329" cy="103" rx="14" ry="19" stroke="#83aae0" strokeWidth="1.5" transform="rotate(-12 329 103)"/>
      <ellipse cx="329" cy="103" rx="10" ry="14" stroke="#83aae0" strokeWidth="1.5" transform="rotate(-12 329 103)"/>
      <ellipse cx="329" cy="103" rx="5" ry="7" fill="#edf3fa" transform="rotate(-12 329 103)"/>
      {/* Structure and base. */}
      <path d="M163 79L190 68L338 101L312 113Z" fill="#7296c3"/>
      <path d="M312 113L338 101V231L312 243Z" fill="url(#printer-side)"/>
      <path d="M163 79L312 113V243L163 209V79Z" fill="url(#printer-frame)"/>
      <path d="M176 95L299 123V222L176 194V95Z" fill="#f0f5fa"/>
      <path d="M185 100L190 102V198L185 197V100ZM285 123L290 124V219L285 218V123Z" fill="#aec4df"/>
      <path d="M151 215L189 198L327 229L290 247Z" fill="url(#printer-bed)"/>
      <path d="M151 215L290 247V258L151 226Z" fill="#28578e"/>
      <path d="M290 247L327 229V240L290 258Z" fill="#1b477b"/>
      <path d="M170 216L193 205L306 231L284 241Z" fill="#819fc2"/>
      <path d="M179 216L194 209L296 232L282 238Z" fill="#cbdcf0"/>
      <path d="M175 232V239M302 248V255" stroke="#173e6c" strokeWidth="7" strokeLinecap="round"/>
      {/* Printed object, with visible layer lines. */}
      <path d="M224 164C225 178 211 186 215 202L220 225Q243 238 267 224L272 202C276 184 260 178 262 164Z" fill="url(#printed-vase)"/>
      <g clipPath="url(#vase-clip)" stroke="#b4efdc" strokeWidth=".75" opacity=".55">{Array.from({length:22},(_,i)=><path key={i} d={`M208 ${168+i*3}Q243 ${180+i*3} 280 ${168+i*3}`}/>)}</g>
      <ellipse cx="243" cy="164" rx="19" ry="6" fill="#96e1cb"/><ellipse cx="243" cy="164" rx="13" ry="3.5" fill="#308f7d"/>
      {/* Gantry and print head. */}
      <path d="M178 124L299 152" stroke="#7194be" strokeWidth="5"/>
      <path d="M178 130L299 158" stroke="#c2d2e7" strokeWidth="2"/>
      <path d="M227 123L241 118L260 123L246 129Z" fill="#8aabd3"/>
      <path d="M227 123L246 129V151L227 146Z" fill="#2161c1"/>
      <path d="M246 129L260 123V145L246 151Z" fill="#164a91"/>
      <circle cx="237" cy="137" r="4" fill="#a7c7f4"/><circle cx="237" cy="137" r="2" fill="#28578e"/>
      <path d="M239 150L245 152L243 160L240 159Z" fill="#d6ae69"/>
      <path d="M242 160V163" stroke="#4fb89d" strokeWidth="1.5"/>
      {/* A finished geometric piece beside the printer. */}
      <path d="M348 225L369 214L389 225L368 237Z" fill="#8fb5ec"/>
      <path d="M348 225L368 237V261L348 249Z" fill="#447ed0"/>
      <path d="M368 237L389 225V249L368 261Z" fill="#2460b2"/>
      <path d="M352 232L365 239M352 237L365 244M352 242L365 249" stroke="#8bb2e9" strokeWidth="1"/>
      <path d="M124 218L130 214M358 176L362 169M141 131L136 127" stroke="#8aacd3" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="379" cy="191" r="3" fill="#90cebe"/><circle cx="118" cy="179" r="2" fill="#a9c5e9"/>
    </svg>
    <div className="login-studio-note login-studio-note-cost"><span><CircleDollarSign/></span><div><b>Cada peça conta.</b><small>Custos e resultados à vista</small></div></div>
    <div className="login-studio-note login-studio-note-production"><span><Layers3/></span><div><b>Do projeto à entrega.</b><small>Sua produção organizada</small></div></div>
    <span className="login-studio-caption"><Box/> Feito para o seu ateliê 3D</span>
  </div>;
}
