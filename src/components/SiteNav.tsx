import logo from '../assets/ts-gubbarnas-dundertips.png';

export function SiteNav({ page }: { page: string }) {
  return <nav className="site-nav" aria-label="Huvudnavigation">
    <a className="site-brand" href="#kupong" aria-label="TS-Gubbarnas Dundertips – veckans kupong"><img src={logo} alt="TS-Gubbarnas Dundertips"/></a>
    <div>{[['coupon','kupong','Veckans kupong'],['results','resultat','Resultat & ära'],['leagues','ligatabeller','Ligatabeller']].map(([id,hash,label]) => <a key={id} href={`#${hash}`} aria-current={page === id ? 'page' : undefined}>{label}</a>)}</div>
  </nav>;
}
