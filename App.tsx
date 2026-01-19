
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import { ViewState, Product, TelegramConfig } from './types';
import { INITIAL_PRODUCTS, ADMIN_PASSWORD } from './constants';
import { analyticsService } from './services/analyticsService';
import { 
  X, ChevronRight, CheckCircle, ShieldCheck, ShoppingBag, Lock, Ticket, ChevronLeft, MapPin, Trophy, Briefcase as BriefcaseIcon, MessageCircle, Globe, Award, Send
} from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('home');
  const [portfolioTab, setPortfolioTab] = useState<'cases' | 'bonuses'>('cases');
  const [isSyncing, setIsSyncing] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [userPurchasedIds, setUserPurchasedIds] = useState<string[]>([]); 
  const [promoCode, setPromoCode] = useState('');
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [agreedToMarketing, setAgreedToMarketing] = useState(false);

  // Реактивное состояние для пользователя Telegram
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
      googleSheetWebhook: 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec'
    };
  });

  const [activeDetailProduct, setActiveDetailProduct] = useState<Product | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [paymentIframeUrl, setPaymentIframeUrl] = useState<string | null>(null);

  const fetchUserAccess = useCallback(async (forcedId?: string) => {
    const targetId = forcedId || userIdentifier;
    if (!telegramConfig.googleSheetWebhook || targetId === 'guest') return;
    try {
      const res = await fetch(`${telegramConfig.googleSheetWebhook}?action=getUserAccess&sheet=Permissions&userId=${encodeURIComponent(targetId.trim())}&_t=${Date.now()}`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.access)) {
        setUserPurchasedIds(data.access.map(item => String(item).trim().toLowerCase()));
      }
    } catch (e) {}
  }, [userIdentifier, telegramConfig.googleSheetWebhook]);

  const syncWithCloud = useCallback(async (showLoading = false) => {
    if (!telegramConfig.googleSheetWebhook) return;
    if (showLoading) setIsSyncing(true);
    try {
      const response = await fetch(`${telegramConfig.googleSheetWebhook}?action=getProducts&sheet=Catalog&_t=${Date.now()}`, { redirect: 'follow' });
      const rawData = await response.json();
      if (rawData && Array.isArray(rawData)) {
        const sanitizedData = rawData
          .filter((item: any) => (item.title || item.Title || item.название))
          .map((item: any, index: number) => {
            const p: any = {};
            Object.keys(item).forEach(key => { p[key.trim().toLowerCase()] = item[key]; });
            let gallery = [];
            try { gallery = typeof (p.detailgallery) === 'string' ? JSON.parse(p.detailgallery) : (p.detailgallery || []); } catch (e) {}
            return {
              ...p,
              id: p.id ? String(p.id).trim() : `row-${index + 2}`,
              title: p.title || p.название || 'Товар',
              description: p.description || p.описание || '',
              category: p.category || p.категория || 'Общее',
              price: Number(p.price || 0),
              imageUrl: p.imageurl || '',
              mediaType: p.mediatype === 'video' ? 'video' : 'image',
              section: (['bonus', 'bonuses', 'бонусы'].includes(String(p.section).toLowerCase())) ? 'bonus' : (['portfolio', 'кейсы'].includes(String(p.section).toLowerCase())) ? 'portfolio' : 'shop',
              useDetailModal: String(p.usedetailmodal).toLowerCase() === 'true',
              buttonText: p.buttontext || 'Выбрать',
              buttonColor: p.buttoncolor || '#6366f1',
              titleColor: p.titlecolor || '#1e293b',
              cardBgColor: p.cardbgcolor || '#ffffff',
              prodamusId: p.prodamusid || '',
              externalLink: p.externallink || '',
              detailFullDescription: p.detailfulldescription || '',
              detailGallery: gallery,
              secretContent: p.secretcontent || '',
              allowedPromo: p.allowedpromo || '',
              detailButtonText: p.detailbuttontext || p.buttontext || 'Оформить заказ'
            };
          });
        setProducts(sanitizedData);
        localStorage.setItem('olga_products_v29', JSON.stringify(sanitizedData));
        fetchUserAccess();
      }
    } catch (e) {} finally { if (showLoading) setIsSyncing(false); }
  }, [telegramConfig.googleSheetWebhook, fetchUserAccess]);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    let detectedId = 'guest';

    if (tg) { 
      tg.ready(); 
      tg.expand(); 
      
      // Попытка 1: Стандартный объект
      const user = tg.initDataUnsafe?.user;
      if (user) {
        detectedId = user.username ? `@${user.username}` : String(user.id);
      } 
      // Попытка 2: Если первый пуст, парсим initData
      else if (tg.initData) {
        try {
          const params = new URLSearchParams(tg.initData);
          const userObj = JSON.parse(params.get('user') || '{}');
          if (userObj.username) detectedId = `@${userObj.username}`;
          else if (userObj.id) detectedId = String(userObj.id);
        } catch(e) {}
      }
    }

    setUserIdentifier(detectedId);
    syncWithCloud(true);
    analyticsService.startSession(detectedId); // Передаем ID принудительно
    fetchUserAccess(detectedId);
  }, [syncWithCloud]);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const portfolioItems = useMemo(() => products.filter(p => p.section === 'portfolio'), [products]);
  const bonuses = useMemo(() => products.filter(p => p.section === 'bonus'), [products]);
  
  const purchasedProducts = useMemo(() => {
    return products.filter(p => {
      const pId = String(p.id).trim().toLowerCase();
      return userPurchasedIds.includes(pId) || userPurchasedIds.includes('all');
    });
  }, [products, userPurchasedIds]);

  const filteredProducts = useMemo(() => products.filter(p => p.section === 'shop' && (filter === 'All' || p.category === filter)), [products, filter]);
  const categories = useMemo(() => Array.from(new Set(products.filter(p => p.section === 'shop').map(p => p.category))).filter(Boolean), [products]);

  const handleNavigate = (newView: ViewState) => { 
    setActiveDetailProduct(null);
    setCheckoutProduct(null);
    setView(newView); 
    window.scrollTo(0, 0); 
    if (newView === 'account') fetchUserAccess();
  };

  const isFree = useMemo(() => {
    if (!checkoutProduct) return false;
    if (Number(checkoutProduct.price) === 0) return true;
    if (checkoutProduct.allowedPromo && promoCode.trim().toLowerCase() === checkoutProduct.allowedPromo.toLowerCase()) return true;
    return false;
  }, [checkoutProduct, promoCode]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutProduct || isSubmitting || !agreedToTerms || !agreedToPrivacy || !agreedToMarketing) return;
    setIsSubmitting(true);
    try {
      const order = await analyticsService.logOrder({
        productTitle: checkoutProduct.title, price: isFree ? 0 : checkoutProduct.price,
        customerName, customerEmail, customerPhone: 'none',
        utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
        agreedToMarketing
      } as any);

      if (isFree) {
        if (telegramConfig.googleSheetWebhook) {
          fetch(telegramConfig.googleSheetWebhook, {
            method: 'POST', mode: 'no-cors',
            body: JSON.stringify({ action: 'grantAccess', userId: userIdentifier, productId: checkoutProduct.id, orderId: order.id })
          });
        }
        await analyticsService.updateOrderStatus(order.id, 'paid');
        alert('Доступ открыт! Проверьте раздел «МОИ»');
        setCheckoutProduct(null);
        fetchUserAccess();
        setView('account');
      } else {
        let paymentUrl = checkoutProduct.prodamusId?.startsWith('http') ? checkoutProduct.prodamusId : 'https://antol.payform.ru/';
        const connector = paymentUrl.includes('?') ? '&' : '?';
        paymentUrl += `${connector}order_id=${order.id}&customer_email=${encodeURIComponent(customerEmail)}`;
        
        setPaymentIframeUrl(paymentUrl);
        setCheckoutProduct(null);
      }
    } catch (err) {} finally { setIsSubmitting(false); }
  };

  const MediaRenderer: React.FC<{ url: string; type: 'image' | 'video'; className?: string; onClick?: () => void; isDetail?: boolean }> = ({ url, type, className, onClick, isDetail }) => {
    if (!url) return null;
    if (url.includes('rutube.ru') || url.includes('youtube.com') || url.includes('youtu.be')) {
      let embedUrl = url.replace('/video/', '/play/embed/').replace('watch?v=', 'embed/');
      return (
        <div className={`relative w-full aspect-video overflow-hidden shadow-sm bg-black ${isDetail ? 'rounded-2xl' : 'rounded-xl'}`}>
          <iframe src={embedUrl} className="w-full h-full border-none" allowFullScreen></iframe>
        </div>
      );
    }
    if (type === 'video') return <video src={url} className={isDetail ? 'w-full h-auto rounded-2xl' : className} autoPlay muted loop playsInline onClick={onClick} />;
    return <img src={url} className={isDetail ? 'w-full h-auto rounded-2xl cursor-zoom-in' : className} alt="" onClick={onClick} />;
  };

  const renderRichText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[\[(?:image|video):.*?\]\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('[[image:')) {
        const url = part.slice(8, -2);
        return <img key={i} src={url} className="w-full rounded-2xl my-4 shadow-sm" />;
      }
      if (part.startsWith('[[video:')) {
        const url = part.slice(8, -2);
        return <MediaRenderer key={i} url={url} type="video" isDetail={true} />;
      }
      return <p key={i} className="mb-2 whitespace-pre-wrap">{part}</p>;
    });
  };

  return (
    <Layout activeView={view} onNavigate={handleNavigate}>
      {view === 'home' && (
        <div className="space-y-3 text-center pt-0 pb-4 animate-in fade-in duration-700">
          <div className="relative inline-block mt-0">
            <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full scale-125" />
            <img src="https://i.imgur.com/bQ8ic2w.png" className="relative w-36 h-36 mx-auto rounded-full shadow-2xl border-4 border-white object-cover" />
          </div>
          
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Ольга Антонова</h1>
            <p className="text-[14px] font-black text-indigo-600 uppercase tracking-widest leading-none">РЕШЕНИЯ GETCOURSE & PRODAMUS.XL</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">КАСТОМИЗАЦИЯ ЛК, САЙТЫ, СКРИПТЫ, НАСТРОЙКА</p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-50 text-left space-y-2 mx-2">
             <div className="flex items-center gap-4 text-[13px] min-[501px]:text-[10px] font-bold text-slate-700"><Trophy size={18} className="text-amber-500 shrink-0" /> <span className="whitespace-nowrap">Победитель Хакатона EdMarket</span></div>
             <div className="flex items-center gap-4 text-[13px] min-[501px]:text-[10px] font-bold text-slate-700"><Award size={18} className="text-indigo-500 shrink-0" /> <span className="whitespace-nowrap">Специалист GetCourse и Prodamus.XL</span></div>
             <div className="flex items-center gap-4 text-[13px] min-[501px]:text-[10px] font-bold text-slate-700"><BriefcaseIcon size={18} className="text-emerald-500 shrink-0" /> <span className="whitespace-nowrap">60+ реализованных проектов</span></div>
             
             <div className="flex flex-row flex-nowrap items-center justify-between gap-2 text-[13px] min-[501px]:text-[10px] font-bold text-slate-700 w-full cursor-pointer overflow-hidden pt-1" onClick={() => window.open('https://vk.cc/cOx50S', '_blank')}>
                <div className="flex flex-row flex-nowrap items-center gap-3 shrink-0">
                  <Globe size={18} className="text-indigo-400 shrink-0" />
                  <span className="whitespace-nowrap">Сайт-портфолио</span>
                </div>
                <span className="text-indigo-600 underline whitespace-nowrap ml-auto">vk.cc/cOx50S</span>
             </div>
          </div>

          <div className="px-2 pt-0">
            <button onClick={() => window.open('https://t.me/Olga_lav', '_blank')} className="w-full bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-xl active:scale-[0.98] transition-all group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <div className="flex flex-col items-start relative z-10">
                <span className="text-[14px] font-black uppercase tracking-widest">Нужна помощь?</span>
                <span className="text-[10px] font-bold opacity-80 uppercase tracking-tight">Связаться в Telegram</span>
              </div>
              <Send size={24} className="relative z-10 opacity-60" />
            </button>
          </div>
        </div>
      )}

      {view === 'contact' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-in fade-in duration-500">
           <div className="w-24 h-24 bg-white rounded-full shadow-xl flex items-center justify-center relative border border-slate-50">
              <div className="absolute inset-0 bg-indigo-500/5 blur-xl rounded-full animate-pulse" />
              <MessageCircle size={40} className="text-indigo-500 relative z-10" />
           </div>
           
           <div className="space-y-2">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">СВЯЗАТЬСЯ СО МНОЙ</h2>
             <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">ОТВЕТ В ТЕЧЕНИЕ ПАРУ ЧАСОВ</p>
           </div>

           <div className="w-full px-4">
            <button onClick={() => window.open('https://t.me/Olga_lav', '_blank')} className="w-full bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-xl active:scale-95 transition-all">
               <div className="flex flex-col items-start">
                  <span className="text-[14px] font-black uppercase tracking-widest">Написать в TG</span>
                  <span className="text-[9px] font-bold opacity-80 uppercase tracking-widest">Прямая связь со мной</span>
               </div>
               <Send size={24} />
            </button>
           </div>
        </div>
      )}

      {view === 'account' && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="text-center py-4">
            <h2 className="text-xl font-black uppercase tracking-tighter text-slate-900">Мои материалы</h2>
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1">ВАШ ЛИЧНЫЙ КАБИНЕТ</p>
          </div>
          
          <div className="px-2">
            <div className="bg-slate-100/60 border border-slate-100 rounded-2xl py-3 px-5 text-center shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                Доступ к материалам откроется в течение дня после оплаты
              </p>
            </div>
          </div>
          
          {purchasedProducts.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-[2.5rem] border border-slate-100 p-10 shadow-sm mx-2 mt-2">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Lock size={28} className="text-slate-200" />
              </div>
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-2">Список пуст</p>
              <p className="text-[10px] font-medium text-slate-300 leading-relaxed px-4">
                Здесь будут ваши купленные материалы из магазина, а также полезные бонусы. Перейдите в МАГАЗИН, чтобы выбрать решение.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 px-2 mt-2">
              {purchasedProducts.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-[2rem] border border-slate-50 shadow-sm flex items-center gap-4 active:scale-95 transition-all" onClick={() => setActiveDetailProduct(p)}>
                  <div className="relative shrink-0">
                    <img src={p.imageUrl} className="w-16 h-16 rounded-2xl object-cover shadow-sm" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-white"><CheckCircle size={10} strokeWidth={3}/></div>
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-sm font-bold text-slate-800 leading-tight mb-1">{p.title}</h3>
                    <div className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Открыть доступ</div>
                  </div>
                  <ChevronRight size={18} className="text-slate-200" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'portfolio' && (
        <div className="space-y-6 animate-in slide-in-from-right duration-500">
          <div className="flex bg-slate-200/40 p-1 rounded-2xl mx-1">
            <button onClick={() => setPortfolioTab('cases')} className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase transition-all ${portfolioTab === 'cases' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Кейсы</button>
            <button onClick={() => setPortfolioTab('bonuses')} className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase transition-all ${portfolioTab === 'bonuses' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Бонусы</button>
          </div>
          <div className="grid gap-6">
            {(portfolioTab === 'cases' ? portfolioItems : bonuses).map(p => (
              <div key={p.id} style={{ backgroundColor: p.cardBgColor || '#ffffff' }} className="p-5 rounded-[2rem] border border-slate-50 shadow-sm space-y-4">
                <h3 style={{ color: p.titleColor || '#1e293b' }} className="text-sm font-bold leading-tight">{p.title}</h3>
                <MediaRenderer url={p.imageUrl} type={p.mediaType} className="w-full aspect-video object-cover rounded-2xl shadow-sm" onClick={() => p.useDetailModal && setActiveDetailProduct(p)} />
                <button onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank'))} style={{backgroundColor: p.buttonColor}} className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase tracking-widest shadow-lg">Смотреть</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'shop' && (
        <div className="space-y-6 animate-in slide-in-from-left duration-500">
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 -mx-5 px-5">
            {['All', ...categories].map(c => (
              <button 
                key={c} 
                onClick={() => setFilter(c)} 
                className={`px-4 py-2 rounded-xl text-[12px] font-bold uppercase transition-all duration-200 whitespace-nowrap border ${
                  filter === c 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' 
                    : 'bg-indigo-50/50 text-slate-400 border-indigo-100/50'
                }`}
              >
                {c === 'All' ? 'Все' : c}
              </button>
            ))}
          </div>
          
          <div className="grid gap-6 mt-4">
            {filteredProducts.map(p => (
              <div key={p.id} style={{ backgroundColor: p.cardBgColor || '#ffffff' }} className="p-5 rounded-[2rem] border border-slate-50 shadow-sm space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <h3 style={{ color: p.titleColor || '#1e293b' }} className="text-sm font-bold leading-snug">{p.title}</h3>
                  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">{p.price} ₽</span>
                </div>
                <MediaRenderer url={p.imageUrl} type={p.mediaType} className="w-full aspect-video object-cover rounded-2xl shadow-sm" onClick={() => p.useDetailModal && setActiveDetailProduct(p)} />
                <button onClick={() => p.useDetailModal ? setActiveDetailProduct(p) : setCheckoutProduct(p)} style={{backgroundColor: p.buttonColor}} className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Купить</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'admin' && (isAdminAuthenticated ? (
        <AdminDashboard />
      ) : (
        <div className="py-20 text-center space-y-6 animate-in zoom-in duration-300">
          <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-slate-50">
            <Lock size={24} className="text-slate-300" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Доступ ограничен</h2>
          <div className="space-y-3 max-w-[240px] mx-auto">
            <input type="password" placeholder="••••••••" className="w-full p-4 bg-white border border-slate-100 rounded-2xl text-center font-bold tracking-widest shadow-sm outline-none focus:border-indigo-500 transition-all" value={password} onChange={e => setPassword(e.target.value)} />
            <button onClick={() => password === ADMIN_PASSWORD && setIsAdminAuthenticated(true)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl">Войти</button>
          </div>
        </div>
      ))}

      {activeDetailProduct && (
        <div className="fixed top-0 left-0 right-0 bottom-20 z-[2000] bg-white flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden shadow-2xl">
          <div className="p-4 flex items-center justify-between border-b bg-white/90 backdrop-blur-md sticky top-0 z-[2001]">
            <button onClick={() => setActiveDetailProduct(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><ChevronLeft size={20}/></button>
            <span className="text-[9px] font-black uppercase text-slate-400 truncate px-4 tracking-[0.2em]">{activeDetailProduct.title}</span>
            <button onClick={() => setActiveDetailProduct(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><X size={20}/></button>
          </div>
          <div className="flex-grow overflow-y-auto p-6 space-y-6 no-scrollbar pb-40">
             <h2 className="text-xl font-bold leading-tight text-slate-900 tracking-tight">{activeDetailProduct.title}</h2>
             <MediaRenderer url={activeDetailProduct.imageUrl} type={activeDetailProduct.mediaType} isDetail={true} onClick={() => setFullscreenImage(activeDetailProduct.imageUrl)} />
             <div className="text-slate-600 text-[15px] leading-relaxed font-medium">
               {renderRichText(activeDetailProduct.detailFullDescription || activeDetailProduct.description)}
             </div>
          </div>
          
          <div className="fixed bottom-20 left-0 right-0 z-[2100] p-6 bg-gradient-to-t from-white via-white/95 to-transparent pb-8 flex justify-center">
            <div className="w-full max-w-md">
              <button 
                onClick={() => { const p = activeDetailProduct; setActiveDetailProduct(null); p.section === 'shop' ? setCheckoutProduct(p) : (p.externalLink && window.open(p.externalLink, '_blank')) }} 
                style={{backgroundColor: activeDetailProduct.buttonColor || '#89b0bc'}}
                className="w-full py-5 rounded-2xl text-white font-bold text-[11px] uppercase tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all"
              >
                {activeDetailProduct.detailButtonText || activeDetailProduct.buttonText || 'Оформить заказ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutProduct && (
        <div className="fixed inset-0 z-[7000] bg-slate-900/60 backdrop-blur-md flex items-start sm:items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-300 py-10 no-scrollbar">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-6 shadow-2xl animate-in zoom-in duration-300 relative my-8 sm:my-auto">
            <button onClick={() => setCheckoutProduct(null)} className="absolute top-6 right-6 text-slate-300 p-2"><X size={24}/></button>
            
            <div className="text-center space-y-2 pt-2">
              <h2 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">Оформление заказа</h2>
              <p className="text-md font-bold text-slate-900 leading-tight uppercase tracking-tight">{checkoutProduct.title}</p>
            </div>
            
            <form onSubmit={handleCheckout} className="space-y-4">
              <input required placeholder="Ваше имя" className="w-full bg-[#f8f9fc] p-4 rounded-2xl text-[15px] font-bold border border-slate-50 outline-none focus:bg-white transition-all text-slate-400 shadow-sm" value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <input required type="email" placeholder="Email" className="w-full bg-[#f8f9fc] p-4 rounded-2xl text-[15px] font-bold border border-slate-50 outline-none focus:bg-white transition-all text-slate-400 shadow-sm" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              
              <div className="space-y-4 px-1">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" className="hidden" checked={agreedToTerms} onChange={() => setAgreedToTerms(!agreedToTerms)} />
                  <div className={`w-6 h-6 rounded-md border shrink-0 transition-all flex items-center justify-center mt-0.5 ${agreedToTerms ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'border-slate-300 bg-white shadow-inner'}`}>
                    {agreedToTerms && <CheckCircle size={16} strokeWidth={3} />}
                  </div>
                  <span className="text-[13px] font-bold text-slate-500 leading-tight tracking-tight">Принимаю условия <span onClick={(e) => {e.preventDefault(); e.stopPropagation(); window.open('https://axl.antol.net.ru/shabl/oferta_shab', '_blank');}} className="text-indigo-600 underline">публичной оферты</span></span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" className="hidden" checked={agreedToPrivacy} onChange={() => setAgreedToPrivacy(!agreedToPrivacy)} />
                  <div className={`w-6 h-6 rounded-md border shrink-0 transition-all flex items-center justify-center mt-0.5 ${agreedToPrivacy ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'border-slate-300 bg-white shadow-inner'}`}>
                    {agreedToPrivacy && <CheckCircle size={16} strokeWidth={3} />}
                  </div>
                  <span className="text-[13px] font-bold text-slate-500 leading-tight tracking-tight">Согласен с <span onClick={(e) => {e.preventDefault(); e.stopPropagation(); window.open('https://axl.antol.net.ru/politica', '_blank');}} className="text-indigo-600 underline">политикой конфиденциальности</span></span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" className="hidden" checked={agreedToMarketing} onChange={() => setAgreedToMarketing(!agreedToMarketing)} />
                  <div className={`w-6 h-6 rounded-md border shrink-0 transition-all flex items-center justify-center mt-0.5 ${agreedToMarketing ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'border-slate-300 bg-white shadow-inner'}`}>
                    {agreedToMarketing && <CheckCircle size={16} strokeWidth={3} />}
                  </div>
                  <span className="text-[13px] font-bold text-slate-500 leading-tight tracking-tight">Согласен на получение <span onClick={(e) => {e.preventDefault(); e.stopPropagation(); window.open('https://shopscript.lpxl.ru/soglasie', '_blank');}} className="text-indigo-600 underline">рекламных рассылок</span></span>
                </label>
              </div>

              <div className="pt-2 text-center">
                <button type="submit" disabled={!agreedToTerms || !agreedToPrivacy || !agreedToMarketing || isSubmitting} className={`w-full py-5 rounded-2xl text-[14px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 ${(!agreedToTerms || !agreedToPrivacy || !agreedToMarketing) ? 'bg-slate-100 text-slate-400 opacity-50' : 'bg-indigo-600 text-white shadow-indigo-200'}`}>
                  {isSubmitting ? 'Обработка...' : `ОПЛАТИТЬ ${checkoutProduct.price} ₽`}
                </button>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-tight mt-4 px-4 leading-tight">
                  В ТЕЧЕНИЕ ДНЯ ДОСТУП К МАТЕРИАЛАМ БУДЕТ ОТПРАВЛЕН НА ВАШУ ЭЛ. ПОЧТУ
                </p>
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.1em] mt-6">
                  SAFE PAYMENT VIA PRODAMUS
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {paymentIframeUrl && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex items-center justify-between border-b bg-white/90 backdrop-blur-md sticky top-0">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] truncate pr-4">Оплата заказа</span>
            <button onClick={() => setPaymentIframeUrl(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all">
              <X size={24}/>
            </button>
          </div>
          <div className="flex-grow w-full h-full overflow-hidden bg-slate-50">
            <iframe 
              src={paymentIframeUrl} 
              className="w-full h-full border-none" 
              title="Payment Frame"
              allow="payment"
            />
          </div>
        </div>
      )}

      {fullscreenImage && (
        <div className="fixed inset-0 z-[9000] bg-black/95 flex items-center justify-center animate-in fade-in duration-300" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} className="max-w-full max-h-full object-contain" />
          <button className="absolute top-10 right-10 text-white opacity-60"><X size={32}/></button>
        </div>
      )}
    </Layout>
  );
};

export default App;
