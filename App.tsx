import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import { ViewState, Product, TelegramConfig } from './types';
import { INITIAL_PRODUCTS, ADMIN_PASSWORD } from './constants';
import { analyticsService } from './services/analyticsService';
import { 
  X, ChevronRight, CheckCircle, ShieldCheck, ShoppingBag, Lock, Ticket, ChevronLeft, MapPin, Trophy, Briefcase as BriefcaseIcon, MessageCircle, Globe, Award, Send, Phone, Mail, BookOpen, MoreVertical, RefreshCw
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
  const [userIdentifier, setUserIdentifier] = useState<string>('guest');

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('olga_products_v29');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_PRODUCTS;
  });

  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() => {
    try {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { 
      botToken: '8319068202:AAERCkMtwnWXNGHLSN246DQShyaOHDK6z58', 
      chatId: '-1002095569247',
      googleSheetWebhook: 'https://script.google.com/macros/s/AKfycbwKx2SJ0t31ucvLcnhbN1_hbHqYqnpzGRXKdoCYqfPdTI5qgzfbzgzGhVVksLSM0xSQ/exec' // <--- ВСТАВЬ СВОЮ ССЫЛКУ
    };
  });

  const [activeDetailProduct, setActiveDetailProduct] = useState<Product | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [paymentIframeUrl, setPaymentIframeUrl] = useState<string | null>(null);

  // ПОЛУЧЕНИЕ ДОСТУПОВ
  const fetchUserAccess = useCallback(async () => {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!telegramConfig.googleSheetWebhook || !user) return;

    setIsRefreshingAccess(true);
    try {
      const userId = String(user.id);
      const username = user.username || '';
      const url = `${telegramConfig.googleSheetWebhook}?action=getUserAccess&userId=${userId}&username=${username}&_t=${Date.now()}`;
      
      const res = await fetch(url, { redirect: 'follow' });
      const data = await res.json();
      
      if (data.status === 'success' && Array.isArray(data.access)) {
        setUserPurchasedIds(data.access.map((item: any) => String(item).trim().toLowerCase()));
      }
    } catch (e) {
      console.error("Ошибка проверки доступа", e);
    } finally {
      setIsRefreshingAccess(false);
    }
  }, [telegramConfig.googleSheetWebhook]);

  // СИНХРОНИЗАЦИЯ ТОВАРОВ
  const syncWithCloud = useCallback(async () => {
    if (!telegramConfig.googleSheetWebhook) return;
    try {
      const response = await fetch(`${telegramConfig.googleSheetWebhook}?action=getProducts&_t=${Date.now()}`, { redirect: 'follow' });
      const rawData = await response.json();
      if (rawData && Array.isArray(rawData)) {
        const sanitizedData = rawData.filter((item: any) => item.title || item.Title).map((item: any, index: number) => {
          const p: any = {};
          Object.keys(item).forEach(key => { p[key.trim().toLowerCase()] = item[key]; });
          const sectionValue = String(p.section || '').toLowerCase();
          return {
            ...p,
            id: p.id ? String(p.id).trim() : `row-${index + 2}`,
            title: p.title || p.название || 'Товар',
            description: p.description || p.описание || '',
            category: p.category || p.категория || 'Общее',
            price: Number(p.price || 0),
            imageUrl: p.imageurl || '',
            mediaType: p.mediatype === 'video' ? 'video' : 'image',
            section: ['bonus', 'бонусы'].includes(sectionValue) ? 'bonus' : (['portfolio', 'кейсы'].includes(sectionValue) ? 'portfolio' : 'shop'),
            useDetailModal: String(p.usedetailmodal).toLowerCase() === 'true',
            buttonText: p.buttontext || 'Открыть',
            buttonColor: p.buttoncolor || '#6366f1',
            prodamusId: p.prodamusid || '',
            externalLink: p.externallink || '',
            detailFullDescription: p.detailfulldescription || '',
            secretContent: p.secretcontent || '',
            detailButtonText: p.detailbuttontext || 'Оформить заказ'
          };
        });
        setProducts(sanitizedData);
        localStorage.setItem('olga_products_v29', JSON.stringify(sanitizedData));
        fetchUserAccess();
      }
    } catch (e) {}
  }, [telegramConfig.googleSheetWebhook, fetchUserAccess]);

  useLayoutEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    // Определяем, что показать внизу (Ник или ID)
    if (user) {
      setUserIdentifier(user.username ? `@${user.username}` : `ID: ${user.id}`);
      
      // Сразу логируем сессию в таблицу
      fetch(telegramConfig.googleSheetWebhook, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          type: 'session',
          userId: user.id,
          username: user.username || 'no_nick'
        })
      });
    }

    analyticsService.startSession().then(sid => { activeSessionId.current = sid; });
    syncWithCloud();
  }, [telegramConfig.googleSheetWebhook, syncWithCloud]);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
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

  const handleNavigate = (newView: ViewState) => { 
    setActiveDetailProduct(null); setCheckoutProduct(null); setActiveSecretProduct(null); setView(newView); 
    if (newView === 'account') fetchUserAccess();
  };

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
      if (part.startsWith('[[image:')) return <img key={i} src={part.slice(8, -2)} className="w-full rounded-2xl my-4 shadow-sm" />;
      if (part.startsWith('[[video:')) return <MediaRenderer key={i} url={part.slice(8, -2)} type="video" isDetail={true} />;
      return <p key={i} className="mb-2 whitespace-pre-wrap">{part}</p>;
    });
  };

  return (
    <Layout activeView={view} onNavigate={handleNavigate}>
      {view === 'home' && (
        <div className="space-y-4 text-center pb-4 page-transition">
          <div className="relative inline-block mt-2">
            <img src="https://i.imgur.com/bQ8ic2w.png" className="w-44 h-44 mx-auto rounded-[2.5rem] shadow-2xl border-4 border-white object-cover" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Ольга Антонова</h1>
            <p className="text-[14px] font-black text-indigo-600 uppercase tracking-widest leading-none mt-1">РЕШЕНИЯ GETCOURSE & PRODAMUS.XL</p>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-50 text-left space-y-4 mx-2">
             <div className="flex items-center gap-2 group">
               <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 transition-transform group-active:scale-90"><Trophy size={20} className="text-amber-500" /></div>
               <span className="text-[13px] font-bold text-slate-700 leading-snug">Специалист GetCourse и Prodamus.XL</span>
             </div>
          </div>
          <div className="px-2 pt-2">
            <button onClick={() => window.open('https://t.me/Olga_lav', '_blank')} className="w-full bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-xl active:scale-[0.98] transition-all">
              <div className="flex flex-col items-start text-left"><span className="text-[15px] font-black uppercase">Нужна помощь?</span><span className="text-[10px] font-bold opacity-80 uppercase">Связаться в Telegram</span></div>
              <Send size={24} className="opacity-60" />
            </button>
          </div>
        </div>
      )}

      {view === 'portfolio' && (
        <div className="space-y-6 page-transition">
          <div className="flex bg-slate-200/40 p-1 rounded-2xl mx-1">
            <button onClick={() => setPortfolioTab('cases')} className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase transition-all ${portfolioTab === 'cases' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Кейсы</button>
            <button onClick={() => setPortfolioTab('bonuses')} className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase transition-all ${portfolioTab === 'bonuses' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Бонусы</button>
          </div>
          <div className="grid gap-6">
            {products.filter(p => p.section === (portfolioTab === 'cases' ? 'portfolio' : 'bonus')).map(p => (
              <div key={p.id} style={{ backgroundColor: p.cardBgColor }} className="p-5 rounded-[2rem] border border-slate-50 shadow-sm space-y-4">
                <h3 className="text-sm font-bold leading-tight">{p.title}</h3>
                <MediaRenderer url={p.imageUrl} type={p.mediaType} className="w-full aspect-video object-cover rounded-2xl" onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank'))} />
                <button onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank'))} style={{backgroundColor: p.buttonColor}} className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase tracking-widest">{p.buttonText}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'shop' && (
        <div className="space-y-6 page-transition">
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 -mx-5 px-5">
            {['All', ...categories].map(c => (
              <button key={c} onClick={() => setFilter(c)} className={`px-4 py-2 rounded-xl text-[12px] font-bold uppercase border ${filter === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50/50 text-slate-400'}`}>{c === 'All' ? 'Все' : c}</button>
            ))}
          </div>
          <div className="grid gap-6 mt-4">
            {filteredProducts.map(p => (
              <div key={p.id} style={{ backgroundColor: p.cardBgColor }} className="p-5 rounded-[2rem] border border-slate-50 shadow-sm space-y-4">
                <div className="flex justify-between gap-4"><h3 className="text-sm font-bold leading-snug">{p.title}</h3><span className="text-sm font-black text-slate-900">{p.price} ₽</span></div>
                <MediaRenderer url={p.imageUrl} type={p.mediaType} className="w-full aspect-video object-cover rounded-2xl" onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : setCheckoutProduct(p)} />
                <button onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : setCheckoutProduct(p)} style={{backgroundColor: p.buttonColor}} className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase">{p.buttonText}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'account' && (
        <div className="space-y-4 page-transition -mt-2">
          <div className="py-8 text-center px-4 flex flex-col items-center">
             <h2 className="text-[28px] font-black text-slate-900 uppercase">ЛИЧНЫЙ КАБИНЕТ</h2>
             <button onClick={() => fetchUserAccess()} className={`mt-4 flex items-center gap-2 text-[10px] font-black uppercase px-4 py-2 rounded-full border ${isRefreshingAccess ? 'text-indigo-400' : 'text-slate-400'}`}>
               <RefreshCw size={12} className={isRefreshingAccess ? 'animate-spin' : ''} />
               {isRefreshingAccess ? 'Обновляем...' : 'Обновить доступы'}
             </button>
          </div>
          {purchasedProducts.length === 0 ? (
            <div className="bg-white rounded-[3.5rem] p-12 text-center flex flex-col items-center min-h-[400px] justify-center">
              <Lock size={32} className="text-slate-200 mb-5" />
              <h3 className="text-[18px] font-black text-slate-400 uppercase">СПИСОК ПУСТ</h3>
            </div>
          ) : (
            <div className="grid gap-3 px-1">
              {purchasedProducts.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-50 flex items-center gap-4 cursor-pointer" onClick={() => setActiveSecretProduct(p)}>
                  <img src={p.imageUrl} className="w-16 h-16 rounded-2xl object-cover" />
                  <div className="flex-grow"><h3 className="text-sm font-bold text-slate-800 leading-tight">{p.title}</h3><div className="text-[9px] font-black text-indigo-500 uppercase">Изучить материал</div></div>
                  <ChevronRight size={18} className="text-slate-200" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Модальные окна */}
      {activeDetailProduct && (
        <div className="fixed inset-x-0 top-0 bottom-20 z-[4500] bg-white flex flex-col mx-auto max-w-md">
          <div className="p-4 flex items-center justify-between border-b"><button onClick={() => setActiveDetailProduct(null)}><ChevronLeft size={20}/></button><span className="text-[9px] font-black uppercase text-slate-400">ПОДРОБНОСТИ</span><button onClick={() => setActiveDetailProduct(null)}><X size={20}/></button></div>
          <div className="flex-grow overflow-y-auto p-6 space-y-5 pb-32 no-scrollbar"><h2 className="text-[16px] font-black leading-tight uppercase">{activeDetailProduct.title}</h2><MediaRenderer url={activeDetailProduct.imageUrl} type={activeDetailProduct.mediaType} isDetail={true} /><div className="text-slate-600 text-[13px] leading-tight font-medium">{renderRichText(activeDetailProduct.detailFullDescription || activeDetailProduct.description)}</div></div>
          <div className="absolute bottom-6 left-0 right-0 px-6"><button onClick={() => { const p = activeDetailProduct; setActiveDetailProduct(null); p.section === 'shop' ? setCheckoutProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank')) }} style={{backgroundColor: activeDetailProduct.buttonColor}} className="w-full py-5 rounded-2xl text-white font-bold text-[11px] uppercase tracking-widest">{activeDetailProduct.detailButtonText}</button></div>
        </div>
      )}

      {activeSecretProduct && (
        <div className="fixed inset-x-0 top-0 bottom-20 z-[4000] bg-white flex flex-col mx-auto max-w-md">
          <div className="p-4 flex items-center justify-between border-b"><button onClick={() => setActiveSecretProduct(null)}><ChevronLeft size={20}/></button><span className="text-[10px] font-black uppercase text-indigo-500">ВАШ ДОСТУП</span><button onClick={() => setActiveSecretProduct(null)}><X size={20}/></button></div>
          <div className="flex-grow overflow-y-auto p-6 space-y-6 no-scrollbar"><div className="bg-emerald-50 p-4 rounded-2xl flex items-center gap-3"><CheckCircle size={20} className="text-emerald-500" /><p className="text-[12px] font-bold text-emerald-800">Материал разблокирован.</p></div><h2 className="text-xl font-black uppercase">{activeSecretProduct.title}</h2><div className="text-slate-700 text-[15px] leading-relaxed">{activeSecretProduct.secretContent ? renderRichText(activeSecretProduct.secretContent) : 'Контент скоро появится...'}</div></div>
        </div>
      )}

      {checkoutProduct && (
        <div className="fixed inset-0 z-[7000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-6 relative">
            <button onClick={() => setCheckoutProduct(null)} className="absolute top-6 right-6 text-slate-300"><X size={24}/></button>
            <div className="text-center pt-2"><h2 className="text-[9px] font-black uppercase text-indigo-500">ОФОРМЛЕНИЕ ЗАКАЗА</h2><p className="text-md font-bold uppercase">{checkoutProduct.title}</p></div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!agreedToTerms || !agreedToPrivacy || !agreedToMarketing) return;
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
              <input required placeholder="Ваше имя" className="w-full bg-[#f8f9fc] p-4 rounded-2xl text-[15px] font-bold outline-none" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <input required type="email" placeholder="Email" className="w-full bg-[#f8f9fc] p-4 rounded-2xl text-[15px] font-bold outline-none" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              <div className="space-y-3 px-1">
                {[
                  { state: agreedToTerms, setState: setAgreedToTerms, label: 'Принимаю оферту' },
                  { state: agreedToPrivacy, setState: setAgreedToPrivacy, label: 'Согласен с политикой' },
                  { state: agreedToMarketing, setState: setAgreedToMarketing, label: 'Согласен на рассылку' }
                ].map((item, idx) => (
                  <label key={idx} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="hidden" checked={item.state} onChange={() => item.setState(!item.state)} />
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${item.state ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white'}`}>{item.state && <CheckCircle size={14} />}</div>
                    <span className="text-[11px] font-bold text-slate-500">{item.label}</span>
                  </label>
                ))}
              </div>
              <button type="submit" disabled={!agreedToTerms || !agreedToPrivacy || !agreedToMarketing} className={`w-full py-5 rounded-2xl text-[14px] font-black uppercase ${(!agreedToTerms || !agreedToPrivacy || !agreedToMarketing) ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white'}`}>ОПЛАТИТЬ {checkoutProduct.price} ₽</button>
            </form>
          </div>
        </div>
      )}

      {paymentIframeUrl && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col mx-auto max-w-md">
          <div className="p-4 flex items-center justify-between border-b"><span className="text-[10px] font-black uppercase text-slate-400">ОПЛАТА ЗАКАЗА</span><button onClick={() => setPaymentIframeUrl(null)}><X size={24}/></button></div>
          <div className="flex-grow w-full bg-slate-50"><iframe src={paymentIframeUrl} className="w-full h-full border-none" allow="payment" /></div>
        </div>
      )}

      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none opacity-20"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{userIdentifier}</span></div>
    </Layout>
  );
};

export default App;
