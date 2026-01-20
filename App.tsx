import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import { ViewState, Product, TelegramConfig } from './types';
import { INITIAL_PRODUCTS } from './constants';
import { analyticsService } from './services/analyticsService';
import { 
  X, ChevronRight, CheckCircle, ShieldCheck, ShoppingBag, Lock, ChevronLeft, Trophy, Send, RefreshCw
} from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('home');
  const [portfolioTab, setPortfolioTab] = useState<'cases' | 'bonuses'>('cases');
  const [userPurchasedIds, setUserPurchasedIds] = useState<string[]>([]); 
  const [isRefreshingAccess, setIsRefreshingAccess] = useState(false);
  const activeSessionId = useRef<string>('');
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [agreedToMarketing, setAgreedToMarketing] = useState(false);

  const [activeSecretProduct, setActiveSecretProduct] = useState<Product | null>(null);
  const [userIdentifier, setUserIdentifier] = useState<string>('Загрузка...');

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('olga_products_v30');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_PRODUCTS;
  });

  const [telegramConfig] = useState<TelegramConfig>({ 
    botToken: '8319068202:AAERCkMtwnWXNGHLSN246DQShyaOHDK6z58', 
    chatId: '-1002095569247',
    googleSheetWebhook: 'https://script.google.com/macros/s/AKfycbwjqWiQj18fDBOtE16UaYQN08Z6TRUBHHIyvKgCvGrua5xPX6wRlLHnzotpTpAMGWL1/exec' 
  });

  const [activeDetailProduct, setActiveDetailProduct] = useState<Product | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [paymentIframeUrl, setPaymentIframeUrl] = useState<string | null>(null);

  // 1. ФУНКЦИЯ ЛОГИРОВАНИЯ СЕССИИ (Для Sessions)
  const logSession = useCallback(() => {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    if (user && telegramConfig.googleSheetWebhook) {
      setUserIdentifier(user.username ? `@${user.username}` : `ID: ${user.id}`);
      
      fetch(telegramConfig.googleSheetWebhook, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          type: 'session',
          page: view,
          userId: String(user.id),
          username: user.username || 'no_nick',
          utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct'
        })
      });
    } else {
      setUserIdentifier('Guest / Web');
    }
  }, [telegramConfig.googleSheetWebhook, view]);

  // 2. ПРОВЕРКА ДОСТУПА (Для Permissions)
  const fetchUserAccess = useCallback(async () => {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!telegramConfig.googleSheetWebhook || !user) return;

    setIsRefreshingAccess(true);
    try {
      const url = `${telegramConfig.googleSheetWebhook}?action=getUserAccess&userId=${user.id}&username=${user.username || ''}`;
      const res = await fetch(url, { redirect: 'follow' });
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.access)) {
        setUserPurchasedIds(data.access.map((item: any) => String(item).trim().toLowerCase()));
      }
    } catch (e) {
      console.error("Access error:", e);
    } finally {
      setIsRefreshingAccess(false);
    }
  }, [telegramConfig.googleSheetWebhook]);

  // 3. СИНХРОНИЗАЦИЯ КАТАЛОГА
  const syncWithCloud = useCallback(async () => {
    if (!telegramConfig.googleSheetWebhook) return;
    try {
      const response = await fetch(`${telegramConfig.googleSheetWebhook}?action=getProducts`, { redirect: 'follow' });
      const rawData = await response.json();
      if (rawData && Array.isArray(rawData)) {
        const sanitizedData = rawData.map((item: any, index: number) => {
          const p: any = {};
          Object.keys(item).forEach(key => { p[key.trim().toLowerCase()] = item[key]; });
          return {
            ...p,
            id: p.id ? String(p.id).trim() : `row-${index + 2}`,
            title: p.title || 'Товар',
            price: Number(p.price || 0),
            imageUrl: p.imageurl || '',
            mediaType: p.mediatype === 'video' ? 'video' : 'image',
            section: String(p.section).toLowerCase().includes('bonus') ? 'bonus' : (String(p.section).toLowerCase().includes('portfolio') ? 'portfolio' : 'shop'),
            useDetailModal: String(p.usedetailmodal).toLowerCase() === 'true',
            buttonText: p.buttontext || 'Открыть',
            buttonColor: p.buttoncolor || '#6366f1',
            prodamusId: p.prodamusid || '',
            externalLink: p.externallink || '',
            detailFullDescription: p.detailfulldescription || '',
            secretContent: p.secretcontent || '',
            detailButtonText: p.detailbuttontext || 'Оформить'
          };
        });
        setProducts(sanitizedData);
        localStorage.setItem('olga_products_v30', JSON.stringify(sanitizedData));
        fetchUserAccess();
      }
    } catch (e) {}
  }, [telegramConfig.googleSheetWebhook, fetchUserAccess]);

  useLayoutEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    tg?.ready();
    setTimeout(logSession, 500); // Даем время API Telegram загрузиться
    syncWithCloud();
  }, [syncWithCloud, logSession]);

  const [filter, setFilter] = useState<string>('All');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const purchasedProducts = useMemo(() => {
    return products.filter(p => {
      const pid = String(p.id).trim().toLowerCase();
      return userPurchasedIds.some(accessId => accessId === 'all' || accessId === pid);
    });
  }, [products, userPurchasedIds]);

  const filteredProducts = useMemo(() => products.filter(p => p.section === 'shop' && (filter === 'All' || p.category === filter)), [products, filter]);
  const categories = useMemo(() => Array.from(new Set(products.filter(p => p.section === 'shop').map(p => p.category))).filter(Boolean), [products]);

  const MediaRenderer: React.FC<{ url: string; type: 'image' | 'video'; className?: string; onClick?: () => void; isDetail?: boolean }> = ({ url, type, className, onClick, isDetail }) => {
    if (!url) return null;
    if (url.includes('rutube.ru') || url.includes('youtube.com')) {
      let embedUrl = url.replace('/video/', '/play/embed/').replace('watch?v=', 'embed/');
      return <div className={`relative w-full aspect-video bg-black overflow-hidden ${isDetail ? 'rounded-2xl' : 'rounded-xl'}`}><iframe src={embedUrl} className="w-full h-full border-none" allowFullScreen></iframe></div>;
    }
    return type === 'video' ? <video src={url} className={isDetail ? 'w-auto rounded-2xl' : className} autoPlay muted loop playsInline onClick={onClick} /> : <img src={url} className={isDetail ? 'w-auto rounded-2xl' : className} alt="" onClick={onClick} />;
  };

  const renderRichText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[\[(?:image|video):.*?\]\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('[[image:')) return <img key={i} src={part.slice(8, -2)} className="w-full rounded-2xl my-4" />;
      if (part.startsWith('[[video:')) return <MediaRenderer key={i} url={part.slice(8, -2)} type="video" isDetail={true} />;
      return <p key={i} className="mb-2 whitespace-pre-wrap">{part}</p>;
    });
  };

  return (
    <Layout activeView={view} onNavigate={(v) => { setView(v); if(v==='account') fetchUserAccess(); }}>
      {view === 'home' && (
        <div className="space-y-4 text-center pb-4 page-transition">
          <img src="https://i.imgur.com/bQ8ic2w.png" className="w-44 h-44 mx-auto rounded-[2.5rem] shadow-2xl border-4 border-white object-cover mt-2" />
          <h1 className="text-3xl font-black text-slate-900 uppercase">Ольга Антонова</h1>
          <p className="text-[14px] font-black text-indigo-600 uppercase tracking-widest mt-1">РЕШЕНИЯ GETCOURSE & PRODAMUS</p>
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-50 text-left mx-2 flex items-center gap-3">
             <Trophy size={20} className="text-amber-500" />
             <span className="text-[13px] font-bold text-slate-700">Специалист по автоматизации</span>
          </div>
          <div className="px-2 pt-2">
            <button onClick={() => window.open('https://t.me/Olga_lav', '_blank')} className="w-full bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-xl">
              <span className="text-[15px] font-black uppercase">Связаться в Telegram</span>
              <Send size={24} />
            </button>
          </div>
        </div>
      )}

      {view === 'portfolio' && (
        <div className="space-y-6 page-transition">
          <div className="flex bg-slate-200/40 p-1 rounded-2xl mx-1">
            <button onClick={() => setPortfolioTab('cases')} className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase ${portfolioTab === 'cases' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Кейсы</button>
            <button onClick={() => setPortfolioTab('bonuses')} className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase ${portfolioTab === 'bonuses' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Бонусы</button>
          </div>
          <div className="grid gap-6">
            {products.filter(p => p.section === (portfolioTab === 'cases' ? 'portfolio' : 'bonus')).map(p => (
              <div key={p.id} className="p-5 rounded-[2rem] bg-white border border-slate-50 shadow-sm space-y-4">
                <h3 className="text-sm font-bold">{p.title}</h3>
                <MediaRenderer url={p.imageUrl} type={p.mediaType} className="w-full aspect-video object-cover rounded-2xl" onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank'))} />
                <button onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank'))} style={{backgroundColor: p.buttonColor}} className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase">{p.buttonText}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'shop' && (
        <div className="space-y-6 page-transition">
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-1">
            {['All', ...categories].map(c => (
              <button key={c} onClick={() => setFilter(c)} className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase border ${filter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>{c === 'All' ? 'Все' : c}</button>
            ))}
          </div>
          <div className="grid gap-6">
            {filteredProducts.map(p => (
              <div key={p.id} className="p-5 rounded-[2rem] bg-white border border-slate-50 shadow-sm space-y-4">
                <div className="flex justify-between gap-4"><h3 className="text-sm font-bold leading-snug">{p.title}</h3><span className="text-sm font-black">{p.price} ₽</span></div>
                <MediaRenderer url={p.imageUrl} type={p.mediaType} className="w-full aspect-video object-cover rounded-2xl" onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : setCheckoutProduct(p)} />
                <button onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : setCheckoutProduct(p)} style={{backgroundColor: p.buttonColor}} className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase">{p.buttonText}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'account' && (
        <div className="space-y-4 page-transition">
          <div className="py-8 text-center flex flex-col items-center">
             <h2 className="text-[24px] font-black text-slate-900 uppercase">МОИ ДОСТУПЫ</h2>
             <button onClick={() => fetchUserAccess()} className="mt-4 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase px-4 py-2 rounded-full border border-slate-100">
               <RefreshCw size={12} className={isRefreshingAccess ? 'animate-spin' : ''} />
               {isRefreshingAccess ? 'Обновляем...' : 'Проверить доступ'}
             </button>
          </div>
          {purchasedProducts.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center flex flex-col items-center border border-slate-50 min-h-[300px] justify-center">
              <Lock size={32} className="text-slate-200 mb-4" />
              <p className="text-xs font-bold text-slate-400 uppercase">Пока здесь ничего нет</p>
            </div>
          ) : (
            <div className="grid gap-3 px-1">
              {purchasedProducts.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-[2rem] border border-slate-50 flex items-center gap-4 cursor-pointer" onClick={() => setActiveSecretProduct(p)}>
                  <img src={p.imageUrl} className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-grow"><h3 className="text-sm font-bold text-slate-800">{p.title}</h3><div className="text-[9px] font-black text-indigo-500 uppercase">Открыть материал</div></div>
                  <ChevronRight size={18} className="text-slate-200" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      {activeDetailProduct && (
        <div className="fixed inset-0 z-[5000] bg-white flex flex-col">
          <div className="p-4 flex items-center justify-between border-b">
            <button onClick={() => setActiveDetailProduct(null)}><ChevronLeft size={20}/></button>
            <span className="text-[10px] font-black uppercase text-slate-400">Описание</span>
            <button onClick={() => setActiveDetailProduct(null)}><X size={20}/></button>
          </div>
          <div className="flex-grow overflow-y-auto p-6 space-y-5 pb-24">
            <h2 className="text-lg font-black uppercase">{activeDetailProduct.title}</h2>
            <MediaRenderer url={activeDetailProduct.imageUrl} type={activeDetailProduct.mediaType} isDetail={true} />
            <div className="text-slate-600 text-[14px] leading-relaxed">{renderRichText(activeDetailProduct.detailFullDescription || activeDetailProduct.description)}</div>
          </div>
          <div className="p-6 border-t"><button onClick={() => { const p = activeDetailProduct; setActiveDetailProduct(null); p.section === 'shop' ? setCheckoutProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank')) }} style={{backgroundColor: activeDetailProduct.buttonColor}} className="w-full py-5 rounded-2xl text-white font-bold text-[11px] uppercase">{activeDetailProduct.detailButtonText}</button></div>
        </div>
      )}

      {activeSecretProduct && (
        <div className="fixed inset-0 z-[6000] bg-white flex flex-col">
          <div className="p-4 flex items-center justify-between border-b">
            <button onClick={() => setActiveSecretProduct(null)}><ChevronLeft size={20}/></button>
            <span className="text-[10px] font-black text-indigo-500 uppercase">Секретный раздел</span>
            <button onClick={() => setActiveSecretProduct(null)}><X size={20}/></button>
          </div>
          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            <h2 className="text-xl font-black uppercase">{activeSecretProduct.title}</h2>
            <div className="prose prose-slate">{renderRichText(activeSecretProduct.secretContent)}</div>
          </div>
        </div>
      )}

      {checkoutProduct && (
        <div className="fixed inset-0 z-[7000] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-6 relative">
            <button onClick={() => setCheckoutProduct(null)} className="absolute top-6 right-6 text-slate-300"><X size={24}/></button>
            <h2 className="text-center text-sm font-bold uppercase">{checkoutProduct.title}</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!agreedToTerms || !agreedToPrivacy) return;
              const tg = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
              const order = await analyticsService.logOrder({
                productTitle: checkoutProduct.title, price: checkoutProduct.price, productId: checkoutProduct.id,
                customerName, customerEmail, customerPhone: '---', utmSource: 'direct', agreedToMarketing,
                userId: tg?.id || 'unknown', tgUsername: tg?.username || 'unknown'
              } as any);
              let paymentUrl = checkoutProduct.prodamusId?.startsWith('http') ? checkoutProduct.prodamusId : 'https://antol.payform.ru/';
              paymentUrl += `${paymentUrl.includes('?') ? '&' : '?'}order_id=${order.id}&customer_email=${encodeURIComponent(customerEmail)}`;
              setPaymentIframeUrl(paymentUrl);
              setCheckoutProduct(null);
            }} className="space-y-4">
              <input required placeholder="Ваше имя" className="w-full bg-slate-50 p-4 rounded-xl text-sm font-bold outline-none" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <input required type="email" placeholder="Email" className="w-full bg-slate-50 p-4 rounded-xl text-sm font-bold outline-none" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-500 font-bold">
                  <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} /> Принимаю оферту
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-500 font-bold">
                  <input type="checkbox" checked={agreedToPrivacy} onChange={e => setAgreedToPrivacy(e.target.checked)} /> Согласен с политикой
                </label>
              </div>
              <button type="submit" disabled={!agreedToTerms || !agreedToPrivacy} className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black text-[12px] uppercase disabled:bg-slate-200">ОПЛАТИТЬ {checkoutProduct.price} ₽</button>
            </form>
          </div>
        </div>
      )}

      {paymentIframeUrl && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
          <div className="p-4 flex items-center justify-between border-b"><span className="text-[10px] font-black uppercase">Оплата</span><button onClick={() => setPaymentIframeUrl(null)}><X size={24}/></button></div>
          <iframe src={paymentIframeUrl} className="w-full h-full border-none" allow="payment" />
        </div>
      )}

      {/* ПОДВАЛ С ИДЕНТИФИКАТОРОМ */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none opacity-50">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white/80 px-3 py-1 rounded-full border border-slate-100 shadow-sm">
          {userIdentifier}
        </span>
      </div>
    </Layout>
  );
};

export default App;
