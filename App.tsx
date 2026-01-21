import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import { ViewState, Product, TelegramConfig } from './types';
import { INITIAL_PRODUCTS, ADMIN_PASSWORD } from './constants';
import { analyticsService, getDetailedTgUser } from './services/analyticsService';
import {
  X, ChevronRight, CheckCircle, ShieldCheck, ShoppingBag, Lock, Ticket, ChevronLeft, MapPin, Trophy, Briefcase as BriefcaseIcon, MessageCircle, Globe, Award, Send, Phone, Mail, BookOpen, MoreVertical, RefreshCw
} from 'lucide-react';

const ProductDetail = ({ product, onClose, onCheckout, userPurchasedIds }: any) => {
  if (!product) return null;

  const renderContent = (text: string) => {
    if (!text) return null;
    // Регулярка для видео, картинок и ссылок
    const parts = text.split(/(\[\[(?:video|image):.*?\]\]|https?:\/\/[^\s]+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('[[video:')) {
        const url = part.replace('[[video:', '').replace(']]', '');
        const embedUrl = url.includes('rutube') 
          ? url.replace('rutube.ru/video/', 'rutube.ru/play/embed/') 
          : url;
        return (
          <div key={index} className="my-4 aspect-video rounded-[10px] overflow-hidden bg-black shadow-sm">
            <iframe src={embedUrl} className="w-full h-full" frameBorder="0" allowFullScreen></iframe>
          </div>
        );
      }
      
      if (part.startsWith('[[image:')) {
        const url = part.replace('[[image:', '').replace(']]', '');
        return (
          <div key={index} className="my-4">
            <img 
              src={url} 
              className="w-full rounded-[10px] shadow-sm cursor-zoom-in active:opacity-90" 
              onClick={() => window.open(url, '_blank')}
            />
          </div>
        );
      }

      if (part.startsWith('http')) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline break-all font-medium">
            {part}
          </a>
        );
      }
      
      return <span key={index} className="whitespace-pre-wrap leading-relaxed text-slate-700 block mb-2" dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  // ПРОВЕРКА ДОСТУПА: сравниваем ID как строки
  const hasAccess = userPurchasedIds?.map(String).includes(String(product.id)) || product.isFree === true;

  return (
    <div className="fixed inset-0 z-[100] bg-white overflow-y-auto font-sans pb-44">
      {/* ШАПКА СО СТРЕЛКОЙ */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-50 px-6 py-4 border-b border-slate-50 flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <span className="text-2xl leading-none">←</span>
          <span className="text-[12px] font-bold uppercase tracking-tight">Назад</span>
        </button>
        <div className="flex items-center gap-2">
           <div className="w-7 h-7 bg-indigo-600 rounded-[6px] flex items-center justify-center text-white text-[10px] font-bold">OA</div>
           <div className="text-[10px] font-black uppercase text-slate-400 leading-tight text-right">О ГЕТКУРС <br/><span className="text-[8px] font-medium">и не только</span></div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-8">
        <h1 className="text-[17px] font-black text-slate-900 mb-6 leading-tight uppercase tracking-tight">
          {product.title}
        </h1>

        <div className="mb-6">
           <img src={product.imageUrl} className="w-full aspect-video object-cover rounded-[10px] shadow-md border border-slate-50" />
        </div>

        <div className="text-[14px] text-slate-700 leading-relaxed">
          {renderContent(product.detailFullDescription || product.description)}
        </div>
      </div>

      {/* ФИКСИРОВАННАЯ КНОПКА С ДОСТУПОМ */}
      <div className="fixed bottom-24 left-0 right-0 px-6 py-4 z-[110] bg-gradient-to-t from-white via-white/80 to-transparent">
        <div className="max-w-2xl mx-auto">
          {hasAccess ? (
            <button 
              onClick={() => {
                // Если куплено — открываем secretContent
                const link = product.secretContent || product.externalLink;
                if (link) window.open(link, '_blank');
                else alert('Материал скоро будет загружен');
              }}
              className="w-full py-5 rounded-[10px] bg-emerald-500 text-white font-bold text-[13px] uppercase tracking-wider shadow-lg active:scale-95 transition-all"
            >
              ОТКРЫТЬ МАТЕРИАЛ
            </button>
          ) : (
            <button 
              onClick={() => {
                if (product.externalLink && product.section !== 'shop') window.open(product.externalLink, '_blank');
                else onCheckout(product);
              }}
              style={{ backgroundColor: product.detailButtonColor || product.buttonColor || '#4f46e5' }} 
              className="w-full py-5 rounded-[10px] text-white font-bold text-[13px] uppercase tracking-wider shadow-xl active:scale-[0.97] transition-all"
            >
              {product.detailButtonText || product.buttonText || 'ПОДРОБНЕЕ'} 
              {product.price && !isNaN(product.price) ? ` — ${product.price} ₽` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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

  // Добавь это туда, где лежат остальные useState
 const [userInfo, setUserInfo] = useState<any>(null);
  
  // Запись переходов по вкладкам в таблицу Sessions (5-я колонка)
  
useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    // 1. Получаем данные пользователя при старте
    if (tg?.initDataUnsafe?.user) {
      setUserInfo(tg.initDataUnsafe.user);
      if (tg.initDataUnsafe.user.id) {
        setUserIdentifier(tg.initDataUnsafe.user.id.toString());
      }
    }

    // 2. Если мы уже знаем ID, подтягиваем доступы из таблицы
    if (userIdentifier && userIdentifier !== 'guest') {
      const username = tg?.initDataUnsafe?.user?.username || tg?.initDataUnsafe?.user?.first_name || "";
      fetchUserAccess(userIdentifier, username);
    }
  }, [userIdentifier]);
  
  
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
      googleSheetWebhook: 'https://script.google.com/macros/s/AKfycbyw_69J7hbIwrPzWBmv8UL64yYFqyJQZJ-pKfYoHqZGqs1jZ3wjr613VJD_OgDLegzn/exec'
    };
  });

  const [activeDetailProduct, setActiveDetailProduct] = useState<Product | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [paymentIframeUrl, setPaymentIframeUrl] = useState<string | null>(null);

 const fetchUserAccess = useCallback(async (userId, username) => {
   
const fetchUserAccess = useCallback(async (userId?: string, username?: string) => {
    const currentId = userId || userIdentifier;
    const currentName = username || (userInfo?.username || "");
    if (!telegramConfig.googleSheetWebhook || !currentId || currentId === 'guest') return;
    setIsRefreshingAccess(true);
    try {
      const variants = new Set<string>();
      variants.add(currentId.toString().toLowerCase().trim());
      if (currentName) {
        variants.add(currentName.toLowerCase().trim());
        variants.add(currentName.replace('@', '').toLowerCase().trim());
      }
      const url = `${telegramConfig.googleSheetWebhook}?action=getUserAccess&userIds=${encodeURIComponent(Array.from(variants).join(','))}&_t=${Date.now()}`;
      const res = await fetch(url);
      const data = await res.json();
      if ((data.status === 'success' || data.ok) && (data.access || data.purchasedIds)) {
        const list = data.access || data.purchasedIds;
        if (Array.isArray(list)) setUserPurchasedIds(list.map((item: any) => String(item).trim().toLowerCase()));
      }
    } catch (e) { console.error("Access error:", e); }
    finally { setIsRefreshingAccess(false); }
  }, [telegramConfig.googleSheetWebhook, userIdentifier, userInfo]);

  const fetchProducts = useCallback(async () => {
    if (!telegramConfig.googleSheetWebhook) return;
    try {
      const response = await fetch(`${telegramConfig.googleSheetWebhook}?action=getProducts&sheet=Catalog&_t=${Date.now()}`, { redirect: 'follow' });
      const rawData = await response.json();
      if (rawData && Array.isArray(rawData)) {
        const sanitizedData = rawData.filter((item: any) => (item.title || item.Title)).map((item: any, index: number) => {
          const p: any = {};
          Object.keys(item).forEach(key => { p[key.trim().toLowerCase()] = item[key]; });
          return {
            ...p,
            id: p.id ? String(p.id).trim() : `row-${index + 2}`,
            title: p.title || p.название || 'Товар',
            description: p.description || p.описание || '',
            price: Number(p.price || 0),
            imageUrl: p.imageurl || '',
            section: ['bonus', 'бонусы'].includes(String(p.section).toLowerCase()) ? 'bonus' : (['portfolio', 'кейсы'].includes(String(p.section).toLowerCase()) ? 'portfolio' : 'shop'),
            detailButtonText: p.detailbuttontext || p.buttontext || 'Оформить заказ'
          };
        });
        setProducts(sanitizedData);
        if (userIdentifier && userIdentifier !== 'guest') fetchUserAccess(userIdentifier, userInfo?.username);
      }
    } catch (e) { console.error("Products error:", e); }
  }, [telegramConfig.googleSheetWebhook, fetchUserAccess, userIdentifier, userInfo]);

  const syncWithCloud = useCallback(async () => { console.log("Sync ready"); }, []);

  useLayoutEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    const info = getDetailedTgUser();
    setUserIdentifier(info.full_info); 
    analyticsService.startSession().then(sid => { activeSessionId.current = sid; });
    fetchProducts();
    if (typeof saveSessionToSheet === 'function') {
      saveSessionToSheet(info.full_info, info.username || 'guest', 'home');
    }
  }, [fetchProducts]);

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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">КАСТОМИЗАЦИЯ ЛК, САЙТЫ, СКРИПТЫ, НАСТРОЙКА</p>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-50 text-left space-y-4 mx-2">
            <div className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 transition-transform group-active:scale-90"><Trophy size={20} className="text-amber-500" /></div>
              <span className="text-[13px] font-bold text-slate-700 leading-snug">Победитель Хакатона EdMarket</span>
            </div>
            <div className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 transition-transform group-active:scale-90"><Award size={20} className="text-indigo-500" /></div>
              <span className="text-[13px] font-bold text-slate-700 leading-snug">Специалист GetCourse и Prodamus.XL</span>
            </div>
            <div className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 transition-transform group-active:scale-90"><BriefcaseIcon size={20} className="text-emerald-500" /></div>
              <span className="text-[13px] font-bold text-slate-700 leading-snug">60+ реализованных проектов</span>
            </div>
            <div className="border-t border-slate-50 mt-2 flex items-center group cursor-pointer" onClick={() => window.open('https://vk.cc/cOx50S', '_blank')}>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 transition-transform group-active:scale-90"><Globe size={20} className="text-indigo-400" /></div>
                <span className="text-[13px] font-bold text-slate-700">Сайт-портфолио </span>
              </div>
              <span className="text-indigo-600 underline text-[13px] font-black tracking-tight pr-1"> vk.cc/cOx50S</span>
            </div>
          </div>
          <div className="px-2 pt-2">
            <button onClick={() => window.open('https://t.me/Olga_lav', '_blank')} className="w-full bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-xl active:scale-[0.98] transition-all group overflow-hidden relative">
              <div className="flex flex-col items-start relative z-10 text-left"><span className="text-[15px] font-black uppercase tracking-widest">Нужна помощь?</span><span className="text-[10px] font-bold opacity-80 uppercase tracking-tight">Связаться в Telegram</span></div><Send size={24} className="relative z-10 opacity-60" /></button>
          </div>
        </div>
      )}

      
  {view === 'portfolio' && (
  <div className="space-y-6 page-transition">
    <div className="flex bg-slate-200/40 p-1 rounded-2xl mx-1">
      <button 
        onClick={() => setPortfolioTab('cases')} 
        className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase transition-all ${portfolioTab === 'cases' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
      >
        Кейсы
      </button>
      <button 
        onClick={() => setPortfolioTab('bonuses')} 
        className={`flex-1 py-3 rounded-xl text-[12px] font-bold uppercase transition-all ${portfolioTab === 'bonuses' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
      >
        Бонусы
      </button>
    </div>
    
    <div className="grid gap-6">
      {(portfolioTab === 'cases' ? products.filter(p => p.section === 'portfolio') : products.filter(p => p.section === 'bonus')).map(p => (
        <div 
          key={p.id} 
          style={{ backgroundColor: p.cardBgColor || '#ffffff' }} 
          className="p-5 rounded-[2rem] border border-slate-50 shadow-sm space-y-4"
        >
          <h3 style={{ color: p.titleColor || '#1e293b' }} className="text-sm font-bold leading-tight">
            {p.title}
          </h3>
          
          <MediaRenderer 
            url={p.imageUrl} 
            type={p.mediaType} 
            className="w-full aspect-video object-cover rounded-2xl shadow-sm cursor-pointer" 
            /* ЗАМЕНИЛИ ТУТ */
            onClick={() => p.useDetailModal ? handleNavigate('portfolio', p) : (p.externalLink && window.open(p.externalLink, '_blank'))} 
          />

          <button 
            /* И ЗАМЕНИЛИ ТУТ */
            onClick={() => p.useDetailModal ? handleNavigate('portfolio', p) : (p.externalLink && window.open(p.externalLink, '_blank'))} 
            style={{ backgroundColor: p.buttonColor }} 
            className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            {p.buttonText}
          </button>
        </div>
      ))}
    </div>
  </div>
)}

      
    {view === 'shop' && (
  <div className="space-y-6 page-transition">
    {/* Категории (твои стили без изменений) */}
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 -mx-5 px-5">
      {['All', ...categories].map(c => (
        <button 
          key={c} 
          onClick={() => setFilter(c)} 
          className={`px-4 py-2 rounded-xl text-[12px] font-bold uppercase border transition-all ${
            filter === c ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-indigo-50/50 text-slate-400 border-indigo-100/50'
          }`}
        >
          {c === 'All' ? 'Все' : c}
        </button>
      ))}
    </div>
    
    <div className="grid gap-6 mt-4">
      {filteredProducts.map(p => {
        return (
          <div 
            key={p.id} 
            style={{ backgroundColor: p.cardBgColor }} 
            className="p-5 rounded-[2rem] border border-slate-50 shadow-sm space-y-4 relative"
          >
            {/* Заголовок и цена */}
            <div className="flex justify-between gap-4">
              <h3 style={{ color: p.titleColor }} className="text-sm font-bold leading-snug">
                {p.title}
              </h3>
              <span className="text-sm font-black text-slate-900">{p.price} ₽</span>
            </div>

            {/* Картинка: теперь открывает лонгрид через handleNavigate */}
            <MediaRenderer 
              url={p.imageUrl} 
              type={p.mediaType} 
              className="w-full aspect-video object-cover rounded-2xl shadow-sm cursor-pointer" 
              onClick={() => handleNavigate('shop', p)} 
            />

            {/* Твоя кнопка из таблицы: ведет на описание (лонгрид) */}
            <button 
              onClick={() => handleNavigate('shop', p)} 
              style={{ backgroundColor: p.buttonColor }} 
              className="w-full py-4 rounded-2xl text-white font-bold text-[10px] uppercase shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {p.buttonText}
            </button>
          </div>
        );
      })}
    </div>
  </div>
)}
      
     {view === 'account' && (
  <div className="space-y-4 page-transition -mt-2">
    <div className="py-8 text-center mb-2 px-4 flex flex-col items-center">
      <h2 className="text-[28px] font-black text-slate-900 uppercase tracking-tight leading-none">ЛИЧНЫЙ КАБИНЕТ</h2>
      
      {/* Кнопка теперь передает актуальный ID пользователя при нажатии */}
      <button 
        onClick={() => fetchUserAccess(userIdentifier, "")} 
        className={`mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border border-slate-100 shadow-sm transition-all active:scale-90 ${isRefreshingAccess ? 'bg-indigo-50 text-indigo-400' : 'bg-white text-slate-400'}`}
      >
        <RefreshCw size={12} className={isRefreshingAccess ? 'animate-spin' : ''} />
        {isRefreshingAccess ? 'Обновляем...' : 'Обновить доступы'}
      </button>
    </div>

    {purchasedProducts.length === 0 ? (
      /* ЭКРАН ПУСТОГО СПИСКА — если в таблице ничего не найдено */
      <div className="bg-white rounded-[3.5rem] border border-slate-100 p-12 shadow-sm mx-1 flex flex-col items-center text-center space-y-10 min-h-[460px] justify-center">
        <div className="w-24 h-24 bg-[#f8fafc] rounded-3xl flex items-center justify-center border border-slate-50 shadow-inner">
          <Lock size={32} className="text-slate-200" strokeWidth={1.5} />
        </div>
        <div className="space-y-5">
          <h3 className="text-[18px] font-black text-slate-400 uppercase tracking-[0.2em]">СПИСОК ПУСТ</h3>
          <p className="text-[13px] font-medium text-slate-300 leading-relaxed max-w-[280px]">
            Здесь будут ваши материалы. Если доступ прописан в таблице, но не появился — нажмите кнопку выше.
          </p>
        </div>
      </div>
    ) : (
      /* СПИСОК ТОВАРОВ — которые ты разрешила в таблице */
      <div className="grid gap-3 px-1">
        {purchasedProducts.map(p => (
          <div 
            key={p.id} 
            className="bg-white p-5 rounded-[2.5rem] border border-slate-50 shadow-sm flex items-center gap-4 active:scale-[0.97] transition-all cursor-pointer" 
            onClick={() => setActiveSecretProduct(p)}
          >
            <img src={p.imageUrl} className="w-16 h-16 rounded-2xl object-cover shadow-sm" />
            <div className="flex-grow">
              <h3 className="text-sm font-bold text-slate-800 leading-tight mb-1">{p.title}</h3>
              <div className="text-[9px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                <CheckCircle size={10} /> Изучить материал
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-200" />
          </div>
        ))}
      </div>
    )}
  </div>
)}

      
      {checkoutProduct && (
        <div className="fixed inset-0 z-[7000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"><div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative"><button onClick={() => setCheckoutProduct(null)} className="absolute top-6 right-6 text-slate-300 p-2"><X size={24} /></button><div className="text-center space-y-2 pt-2"><h2 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500">ОФОРМЛЕНИЕ ЗАКАЗА</h2><p className="text-md font-bold text-slate-900 leading-tight uppercase tracking-tight">{checkoutProduct.title}</p></div>
          <form onSubmit={async (e) => {
            e.preventDefault(); if (!agreedToTerms || !agreedToPrivacy || !agreedToMarketing) return;
            
            // Внедрено: Получение свежих данных TG для заказа
            const userInfo = getDetailedTgUser();
            
            const order = await analyticsService.logOrder({
              productTitle: checkoutProduct.title, price: checkoutProduct.price, productId: checkoutProduct.id,
              customerName, customerEmail, customerPhone: '---', 
              utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct', 
              agreedToMarketing,
              // Передаем TG инфо в заказ
              tg_id: userInfo.tg_id,
              username: userInfo.username
            } as any);
            
            let paymentUrl = checkoutProduct.prodamusId?.startsWith('http') ? checkoutProduct.prodamusId : 'https://antol.payform.ru/';
            const connector = paymentUrl.includes('?') ? '&' : '?';
            paymentUrl += `${connector}order_id=${order.id}&customer_email=${encodeURIComponent(customerEmail)}`; setPaymentIframeUrl(paymentUrl); setCheckoutProduct(null);
          }} className="space-y-4">
            <input required placeholder="Ваше имя" className="w-full bg-[#f8f9fc] p-4 rounded-2xl text-[15px] font-bold border border-slate-50 outline-none focus:bg-white transition-all text-slate-800 shadow-sm" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            <input required type="email" placeholder="Email" className="w-full bg-[#f8f9fc] p-4 rounded-2xl text-[15px] font-bold border border-slate-50 outline-none focus:bg-white transition-all text-slate-800 shadow-sm" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
            <div className="space-y-3 px-1">{[{ state: agreedToTerms, setState: setAgreedToTerms, label: <>Принимаю условия <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open('https://axl.antol.net.ru/shabl/oferta_shab', '_blank'); }} className="text-indigo-600 underline">публичной оферты</span></> },
            { state: agreedToPrivacy, setState: setAgreedToPrivacy, label: <>Согласен с условиями <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open('https://axl.antol.net.ru/politica', '_blank'); }} className="text-indigo-600 underline">политики конфиденциальности</span></> },
            { state: agreedToMarketing, setState: setAgreedToMarketing, label: <>Согласен на получение <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open('https://shopscript.lpxl.ru/soglasie', '_blank'); }} className="text-indigo-600 underline">рекламной рассылки</span></> }
            ].map((item, idx) => (
              <label key={idx} className="flex items-start gap-3 cursor-pointer"><input type="checkbox" className="hidden" checked={item.state} onChange={() => item.setState(!item.state)} /><div className={`w-5 h-5 rounded-md border shrink-0 transition-all flex items-center justify-center mt-0.5 ${item.state ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                {item.state && <CheckCircle size={14} strokeWidth={3} />}</div><span className="text-[11px] font-bold text-slate-500 leisure-tight">{item.label}</span></label>))}
            </div><button type="submit" disabled={!agreedToTerms || !agreedToPrivacy || !agreedToMarketing} className={`w-full py-5 rounded-2xl text-[14px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 ${(!agreedToTerms || !agreedToPrivacy || !agreedToMarketing) ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white'}`}>
              ОПЛАТИТЬ {checkoutProduct.price} ₽</button></form></div></div>
      )}
      {paymentIframeUrl && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col page-transition mx-auto max-w-md"><div className="p-4 flex items-center justify-between border-b bg-white/90 backdrop-blur-md sticky top-0"><span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] pr-4">ОПЛАТА ЗАКАЗА</span><button onClick={() => setPaymentIframeUrl(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><X size={24} /></button></div><div className="flex-grow w-full h-full overflow-hidden bg-slate-50"><iframe src={paymentIframeUrl} className="w-full h-full border-none" title="Payment Frame" allow="payment" /></div>
        </div>
      )}
      {view === 'contact' && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 page-transition"><div className="w-20 h-20 bg-white rounded-full shadow-xl flex items-center justify-center border border-slate-50"><MessageCircle size={32} className="text-indigo-500" /></div>
          <div className="space-y-1"><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">СВЯЗАТЬСЯ СО МНОЙ</h2><p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">ОТВЕТ В ТЕЧЕНИЕ ПАРУ ЧАСОВ</p></div><button onClick={() => window.open('https://t.me/Olga_lav', '_blank')} className="w-full max-w-[280px] bg-indigo-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-xl active:scale-95 transition-all">
            <div className="flex flex-col items-start"><span className="text-[14px] font-black uppercase">Написать в TG</span><span className="text-[10px] font-bold opacity-70">Прямая связь со мной</span></div>
            <Send size={20} /></button></div>
      )}
      {view === 'admin' && (
        isAdminAuthenticated ? (<AdminDashboard />) : (
          <div className="py-20 text-center space-y-6 page-transition px-5"><div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-slate-50"><Lock size={24} className="text-slate-300" /></div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Доступ ограничен</h2><div className="space-y-3 max-w-[240px] mx-auto"><input type="password" placeholder="••••••••" className="w-full p-4 bg-white border border-slate-100 rounded-2xl text-center font-bold tracking-widest outline-none focus:border-indigo-500 transition-all" value={password} onChange={e => setPassword(e.target.value)} />
              <button onClick={() => password === ADMIN_PASSWORD && setIsAdminAuthenticated(true)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl">Войти</button>
            </div></div>)
      )}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none opacity-20"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{userIdentifier}</span></div>
    
  
    {/* Теперь используем ПРАВИЛЬНОЕ имя ProductDetail */}
     {activeDetailProduct && (
  <ProductDetail
    product={activeDetailProduct}
    onClose={() => setActiveDetailProduct(null)}
    onCheckout={(p: any) => {
      setActiveDetailProduct(null);
      setCheckoutProduct(p);
    }}
    userPurchasedIds={userPurchasedIds}
  />
)}

     
  
    
    </Layout>
  );
};

export default App;
