import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import AdminDashboard from './components/AdminDashboard';
import { ViewState, Product, TelegramConfig } from './types';
import { INITIAL_PRODUCTS, ADMIN_PASSWORD } from './constants';
import { analyticsService, getDetailedTgUser } from './services/analyticsService';
import { Award, Zap, MessageCircle, ArrowRight, Star, Trophy, Globe, BriefcaseIcon, Send, ChevronRight, RefreshCw, CheckCircle, Lock } from 'lucide-react';

import {
  X, ChevronRight, CheckCircle, ShieldCheck, ShoppingBag, Lock, Ticket, ChevronLeft, MapPin, Trophy, Briefcase as BriefcaseIcon, MessageCircle, Globe, Award, Send, Phone, Mail, BookOpen, MoreVertical, RefreshCw
} from 'lucide-react';

const ProductDetail = ({ product, onClose, onCheckout, userPurchasedIds, onNavigate }: any) => {
  if (!product) return null;

const Linkify = ({ text }: { text: string }) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => 
        urlRegex.test(part) 
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold break-all">{part}</a>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
};
  
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

        <div className="text-[16px] text-slate-700 leading-relaxed">
          {renderContent(product.detailFullDescription || product.description)}
        
        </div>
      </div>

    {/* ФИКСИРОВАННАЯ КНОПКА С ДОСТУПОМ */}
     {/* ФИКСИРОВАННАЯ КНОПКА С ДОСТУПОМ */}
      <div className="fixed bottom-24 left-0 right-0 px-6 py-4 z-[110] bg-gradient-to-t from-white via-white/80 to-transparent">
        <div className="max-w-2xl mx-auto">
         {hasAccess ? (
            <button 
              onClick={() => {
                onClose();
                if (typeof onNavigate === 'function') {
                  onNavigate('account');
                }
              }}
              style={{ backgroundColor: product.detailButtonColor || product.buttonColor || '#7ea6b1' }}
              className="w-full py-5 rounded-[10px] text-white font-bold text-[13px] uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              ОТКРЫТЬ В КАБИНЕТЕ
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
    

// Вспомогательный компонент для отображения картинок/видео
const MediaRenderer = ({ url, className }: { url: string; className?: string }) => {
  if (!url) return <div className={className + " bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]"}>НЕТ ФОТО</div>;
  
  const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i) || url.includes('vimeo.com') || url.includes('youtube.com');
  
  if (isVideo) {
    return (
      <video src={url} className={className} controls playsInline muted />
    );
  }
  return <img src={url} className={className} alt="media" loading="lazy" />;
};


// --- СЮДА ВСТАВЛЯЕМ КЛАСС (МОЗГИ БОТА) ---
class AnalyticsService {
  config: any;
  constructor(config: any) { this.config = config; }
  
  async logOrder(orderData: any) {
    try {
      // 1. Сообщение в ТГ о новом заказе
      const msg = `🛍 **НОВЫЙ ЗАКАЗ**\n📦 ${orderData.productTitle}\n💰 ${orderData.price}₽\n👤 ${orderData.customerName}\n🆔 ID: ${orderData.tg_id}\n🔗 @${orderData.username}`;
      
      await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.config.chatId, text: msg, parse_mode: 'Markdown' })
      });

      // 2. Запись в таблицу
      await fetch(this.config.googleSheetWebhook, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'logOrder', ...orderData })
      });

      // 3. ТАЙМЕР: через 10 минут прислать отмену
      setTimeout(async () => {
        const cancelMsg = `❌ **ЗАКАЗ ОТМЕНЕН**\n(Оплата не поступила за 10 мин)\n📦 ${orderData.productTitle}\n👤 ${orderData.customerName}\n💰 ${orderData.price}₽`;
        
        await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: this.config.chatId, text: cancelMsg, parse_mode: 'Markdown' })
        });
      }, 10 * 60 * 1000);

      return { id: orderData.id || Date.now() };
    } catch (e) {
      console.error('Error logging order:', e);
      return { id: Date.now() };
    }
  }

  // Вспомогательный метод для отправки в ТГ (чтобы не дублировать код)
  async sendToTelegram(text: string) {
    return fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: this.config.chatId, 
        text: text,
        parse_mode: 'Markdown' 
      })
    });
  }
}

const getDetailedTgUser = () => {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initDataUnsafe?.user) {
    return {
      tg_id: String(tg.initDataUnsafe.user.id),
      username: tg.initDataUnsafe.user.username || 'не указан',
      first_name: tg.initDataUnsafe.user.first_name || ''
    };
  }
  return { tg_id: 'unknown', username: 'direct_web' };
};

// --- ТЕПЕРЬ ТВОЙ APP ---
const App: React.FC = () => {
  // Тут твой WEBHOOK_URL, BOT_TOKEN и остальное...
  const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyMTb_XuWZGUM9xfKSBUlUNPbPsCjumWCEA3HN_ny_nwIYaELZeoYKMQnH3o3zNdD9B/exec';
  const BOT_TOKEN = '8319068202:AAERCkMtwnWXNGHLSN246DQShyaOHDK6z58';
  const CHAT_ID = '-1002095569247';

  const [analyticsService] = useState(() => new AnalyticsService({
    botToken: BOT_TOKEN,
    chatId: CHAT_ID,
    googleSheetWebhook: WEBHOOK_URL
  }));
  
  // Дальше весь твой код...
  
  // 2. ВСЕ ТВОИ ПЕРЕМЕННЫЕ (Для вкладок, магазина и профиля)
  const [view, setView] = useState('home');
  const [portfolioTab, setPortfolioTab] = useState('cases');
  const [filter, setFilter] = useState('All');
  const [products, setProducts] = useState<any[]>([]);
  const [userPurchasedIds, setUserPurchasedIds] = useState<string[]>([]);
  const [userIdentifier, setUserIdentifier] = useState<string>('');
  const [isRefreshingAccess, setIsRefreshingAccess] = useState(false);
  const [activeDetailProduct, setActiveDetailProduct] = useState<any>(null);
  const [activeSecretProduct, setActiveSecretProduct] = useState<any>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<any>(null);
  const [paymentIframeUrl, setPaymentIframeUrl] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [agreedToMarketing, setAgreedToMarketing] = useState(false);
  const [password, setPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // 3. ФУНКЦИЯ ЗАГРУЗКИ (Чтобы появились товары и кейсы)
  const fetchProducts = useCallback(async () => {
    if (!WEBHOOK_URL || WEBHOOK_URL.includes('ВАШ_ID')) return;
    try {
      const res = await fetch(`${WEBHOOK_URL}?action=getProducts&sheet=Catalog&_t=${Date.now()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProducts(data.map((p, i) => ({
          ...p,
          id: p.id || p.Id || `row-${i+2}`,
          section: String(p.section || p.Section || '').toLowerCase().trim(),
          title: p.title || p.Title || '',
          category: p.category || p.Category || ''
        })));
        // Сразу проверяем доступы пользователя
        const info = getDetailedTgUser();
        if (info.full_info) fetchUserAccess(info.full_info);
      }
    } catch (e) { console.error("Ошибка загрузки"); }
  }, []);

 // 4. ФУНКЦИЯ ДОСТУПОВ (ИСПРАВЛЕННАЯ)
  const fetchUserAccess = useCallback(async (uid?: string) => {
    const id = uid || userIdentifier;
    // Если нет ссылки или ID гостя — ничего не делаем
    if (!WEBHOOK_URL || !id || id === 'guest') return;
    
    setIsRefreshingAccess(true);
    try {
      const res = await fetch(`${WEBHOOK_URL}?action=getUserAccess&userIds=${encodeURIComponent(id)}&_t=${Date.now()}`);
      const data = await res.json();
      
      // Проверяем все возможные варианты ответа от скрипта (status или ok)
      if (data.status === 'success' || data.ok || data.access) {
        // Берем массив из access или purchasedIds
        const rawAccess = data.access || data.purchasedIds || [];
        const accessArray = Array.isArray(rawAccess) ? rawAccess : [];
        
        setUserPurchasedIds(accessArray.map((i: any) => String(i).trim().toLowerCase()));
      }
    } catch (e) { 
      console.error("Ошибка доступов:", e); 
    } finally { 
      setIsRefreshingAccess(false); 
    }
    // ДОБАВИЛИ WEBHOOK_URL В ЗАВИСИМОСТИ НИЖЕ
  }, [userIdentifier, WEBHOOK_URL]);

  // 5. НАВИГАЦИЯ + СТАТИСТИКА (ИСПРАВЛЕННЫЙ ВАРИАНТ)
  const handleNavigate = useCallback((newView: string, product: any = null) => {
    setView(newView);
    if (product) setActiveDetailProduct(product);
    else setActiveDetailProduct(null);
    setCheckoutProduct(null);
    
    if (WEBHOOK_URL) {
      const tg = (window as any).Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      
      // Собираем данные прямо из Телеграма в момент клика
      const payload = {
        action: 'logSession',
        type: 'session',
        tg_id: user?.id ? String(user.id) : 'guest', // Сюда упадет цифра 450553948
        username: user?.username ? `@${user.username}` : 'No Nickname', // Сюда упадет @Olga_lav
        path: newView,
        utmSource: 'telegram_bot'
      };

      fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors', 
        cache: 'no-cache',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(e => console.error("Ошибка статистики:", e));
    }

    window.scrollTo(0, 0);
  }, [WEBHOOK_URL]);

  // 6. ЗАПУСК ПРИ ОТКРЫТИИ
  useLayoutEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      
      const user = tg.initDataUnsafe?.user;
      if (user) {
        // Сохраняем ID для доступов
        const cleanId = String(user.id);
        setUserIdentifier(cleanId);
        
        // Сразу после того как узнали ID, грузим доступы и товары
        fetchProducts();
        fetchUserAccess(cleanId);
        
        // Автоматически логируем вход с ником и ID
        handleNavigate('home'); 
      } else {
        fetchProducts();
      }
    }
  }, [fetchProducts, fetchUserAccess]);
  
  // ФИЛЬТРЫ (Для твоего дизайна ниже)
  const categories = Array.from(new Set(products.filter(p => p.section === 'shop').map(p => p.category).filter(Boolean)));
  const filteredProducts = products.filter(p => p.section === 'shop' && (filter === 'All' || p.category === filter));
 const purchasedProducts = products.filter(p => {
    const cleanId = String(p.id || '').trim().toLowerCase();
    return userPurchasedIds.some(uId => String(uId || '').trim().toLowerCase() === cleanId);
  });
  const syncWithCloud = () => {};

  // --- ДАЛЬШЕ ИДЕТ ТВОЙ return ( И ДИЗАЙН — ИХ НЕ ТРОГАЙ! ---

  
  return (
    <Layout activeView={view} onNavigate={handleNavigate}>
     {view === 'home' && (
  <div className="space-y-4 text-center pb-4 animate-in fade-in duration-500">
    {/* 1. ПРОФИЛЬ */}
    <div className="relative inline-block mt-4">
      <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full"></div>
      <img 
        src="https://i.imgur.com/bQ8ic2w.png" 
        className="relative w-36 h-36 mx-auto rounded-[10px] shadow-md border-2 border-white object-cover" 
        alt="Ольга"
      />
    </div>

    <div className="space-y-1 px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-tight leading-none">Ольга Антонова</h1>
      <p className="text-[12px] font-semibold text-indigo-500 uppercase tracking-wider leading-none mt-2">РЕШЕНИЯ GETCOURSE & PRODAMUS.XL</p>
      
      <div className="flex justify-center mt-2">
        <div className="bg-emerald-50/50 px-2 py-0.5 rounded-[6px] border border-emerald-100/50 flex items-center gap-1.5">
          <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">В сети</span>
        </div>
      </div>
    </div>

    {/* 2. ВИДЖЕТЫ СТАТИСТИКИ (Аккуратные) */}
    <div className="grid grid-cols-3 gap-1.5 px-2">
      {[
        { label: 'Проектов', val: '60+' },
        { label: 'Опыт', val: '3 года' },
        { label: 'Рейтинг', val: '5.0' }
      ].map((s, i) => (
        <div key={i} className="bg-white p-2 rounded-[10px] border border-slate-100 shadow-sm text-center">
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{s.label}</p>
          <p className="text-sm font-bold text-slate-700">{s.val}</p>
        </div>
      ))}
    </div>

    {/* 3. ДОСТИЖЕНИЯ И САЙТ (Компактные) */}
    <div className="bg-white p-4 rounded-[10px] border border-slate-100 shadow-sm text-left mx-2">
      <div className="space-y-1">
        <div className="flex items-center gap-3 py-1.5">
          <div className="w-8 h-8 rounded-[6px] bg-amber-50 flex items-center justify-center shrink-0">
            <Trophy size={16} className="text-amber-500" />
          </div>
          <span className="text-[13px] font-medium text-slate-600">Победитель Хакатона EdMarket</span>
        </div>
        
        <div className="flex items-center gap-3 py-1.5">
          <div className="w-8 h-8 rounded-[6px] bg-indigo-50 flex items-center justify-center shrink-0">
            <Award size={16} className="text-indigo-500" />
          </div>
          <span className="text-[13px] font-medium text-slate-600">Специалист GetCourse & Prodamus</span>
        </div>

        <div className="pt-2 mt-1 border-t border-slate-50 flex items-center justify-between cursor-pointer" onClick={() => window.open('https://vk.cc/cOx50S', '_blank')}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-slate-50 flex items-center justify-center text-indigo-400">
              <Globe size={16} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-none tracking-tighter">Портфолио</p>
              <span className="text-[12px] font-bold text-slate-600 tracking-tight">vk.cc/cOx50S</span>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300" />
        </div>
      </div>
    </div>

    {/* 4. КНОПКА СВЯЗИ (Нежная) */}
    <div className="px-2">
      <button 
        onClick={() => window.open('https://t.me/Olga_lav', '_blank')} 
        className="w-full bg-indigo-500 text-white p-4 rounded-[10px] flex items-center justify-between shadow-md shadow-indigo-100 active:scale-[0.98] transition-all"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 bg-white/20 rounded-[8px] flex items-center justify-center">
            <Send size={18} className="text-white" />
          </div>
          <div className="leading-tight">
            <span className="text-[14px] font-bold uppercase tracking-tight block">Нужна помощь?</span>
            <span className="text-[9px] font-medium opacity-80 uppercase tracking-widest block">Написать Ольге в ТГ</span>
          </div>
        </div>
        <ChevronRight size={18} className="opacity-70" />
      </button>
    </div>
  </div>
)}

      
 {view === 'portfolio' && (
  <div className="space-y-4 page-transition animate-in fade-in duration-500">
    {/* Переключатель в стиле 10px */}
    <div className="flex bg-slate-100 p-1 rounded-[10px] mx-2">
      <button 
        onClick={() => setPortfolioTab('cases')} 
        className={`flex-1 py-2.5 rounded-[8px] text-[11px] font-bold uppercase transition-all ${portfolioTab === 'cases' ? 'bg-white text-indigo-500 shadow-sm' : 'text-slate-400'}`}
      >
        Кейсы
      </button>
      <button 
        onClick={() => setPortfolioTab('bonuses')} 
        className={`flex-1 py-2.5 rounded-[8px] text-[11px] font-bold uppercase transition-all ${portfolioTab === 'bonuses' ? 'bg-white text-indigo-500 shadow-sm' : 'text-slate-400'}`}
      >
        Бонусы
      </button>
    </div>
    
    <div className="grid gap-4 px-2">
      {(portfolioTab === 'cases' ? products.filter(p => p.section === 'portfolio') : products.filter(p => p.section === 'bonus')).map(p => (
        <div 
          key={p.id} 
          style={{ backgroundColor: p.cardBgColor || '#ffffff' }} 
          className="p-4 rounded-[10px] border border-slate-100 shadow-sm space-y-3"
        >
          <h3 style={{ color: p.titleColor || '#1e293b' }} className="text-[14px] font-bold leading-tight">
            {p.title}
          </h3>
          
          <MediaRenderer 
            url={p.imageUrl} 
            type={p.mediaType} 
            className="w-full aspect-video object-cover rounded-[8px] shadow-sm cursor-pointer" 
            onClick={() => p.useDetailModal ? handleNavigate('portfolio', p) : (p.externalLink && window.open(p.externalLink, '_blank'))} 
          />

          <button 
            onClick={() => p.useDetailModal ? handleNavigate('portfolio', p) : (p.externalLink && window.open(p.externalLink, '_blank'))} 
            style={{ backgroundColor: p.buttonColor || '#6366f1' }} 
            className="w-full py-3.5 rounded-[8px] text-white font-bold text-[10px] uppercase tracking-widest active:scale-[0.97] transition-all shadow-md shadow-indigo-100"
          >
            {p.buttonText}
          </button>
        </div>
      ))}
    </div>
  </div>
)}
     
      
      
      {view === 'shop' && (
  <div className="space-y-4 page-transition animate-in fade-in duration-500">
    {/* Категории — добавил проверку, чтобы не ломалось */}
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-2">
      <button 
        onClick={() => setFilter('All')} 
        className={`px-4 py-2 rounded-[10px] text-[10px] font-bold uppercase border transition-all shrink-0 ${
          filter === 'All' ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white text-slate-400 border-slate-100'
        }`}
      >
        Все
      </button>
      {/* Безопасный вывод категорий */}
      {typeof categories !== 'undefined' && categories.map(c => (
        <button 
          key={c} 
          onClick={() => setFilter(c)} 
          className={`px-4 py-2 rounded-[10px] text-[10px] font-bold uppercase border transition-all shrink-0 ${
            filter === c ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white text-slate-400 border-slate-100'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
    
    <div className="grid gap-4 px-2 mt-2">
      {/* Безопасный вывод товаров */}
      {typeof filteredProducts !== 'undefined' && filteredProducts.length > 0 ? (
        filteredProducts.map(p => (
          <div 
            key={p.id} 
            style={{ backgroundColor: p.cardBgColor || '#ffffff' }} 
            className="p-4 rounded-[10px] border border-slate-100 shadow-sm space-y-3 relative"
          >
            <div className="flex justify-between items-start gap-4">
              <h3 style={{ color: p.titleColor || '#1e293b' }} className="text-[14px] font-bold leading-tight">
                {p.title}
              </h3>
              <span className="text-[14px] font-bold text-slate-800 whitespace-nowrap">{p.price} ₽</span>
            </div>

            <MediaRenderer 
              url={p.imageUrl} 
              type={p.mediaType} 
              className="w-full aspect-video object-cover rounded-[8px] shadow-sm cursor-pointer" 
              onClick={() => handleNavigate('shop', p)} 
            />

            <button 
              onClick={() => handleNavigate('shop', p)} 
              style={{ backgroundColor: p.buttonColor || '#6366f1' }} 
              className="w-full py-3.5 rounded-[8px] text-white font-bold text-[10px] uppercase tracking-widest active:scale-[0.97] transition-all shadow-md shadow-indigo-100"
            >
              {p.buttonText || 'Подробнее'}
            </button>
          </div>
        ))
      ) : (
        <div className="text-center py-10 text-slate-400 text-xs uppercase font-bold tracking-widest">
          Загрузка товаров...
        </div>
      )}
    </div>
  </div>
)}

      
  {view === 'account' && (
  <div className="space-y-4 page-transition -mt-2 animate-in fade-in duration-500">
    {/* ЗАГОЛОВОК И КНОПКА ОБНОВЛЕНИЯ */}
    <div className="pt-6 pb-2 text-center px-4 flex flex-col items-center">
      <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Личный кабинет</h2>
      
      <button 
        onClick={() => fetchUserAccess(userIdentifier, "")} 
        className={`mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-[10px] border border-slate-100 shadow-sm transition-all active:scale-95 ${
          isRefreshingAccess ? 'bg-indigo-50 text-indigo-500' : 'bg-white text-slate-400'
        }`}
      >
        <RefreshCw size={12} className={isRefreshingAccess ? 'animate-spin' : ''} />
        {isRefreshingAccess ? 'Обновляем...' : 'Обновить доступы'}
      </button>
    </div>

    {purchasedProducts.length === 0 ? (
      /* ЭКРАН ПУСТОГО СПИСКА — в новом нежном стиле */
      <div className="bg-white rounded-[10px] border border-slate-100 p-10 shadow-sm mx-2 flex flex-col items-center text-center space-y-6 min-h-[300px] justify-center">
        <div className="w-16 h-16 bg-slate-50 rounded-[10px] flex items-center justify-center border border-slate-100/50">
          <Lock size={24} className="text-slate-200" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h3 className="text-[14px] font-bold text-slate-400 uppercase tracking-widest">Список пуст</h3>
          <p className="text-[11px] font-medium text-slate-300 leading-relaxed max-w-[240px] mx-auto text-balance">
            Ваши материалы появятся здесь после оплаты. Если доступ прописан, но не появился — обновите страницу кнопкой выше.
          </p>
        </div>
      </div>
    ) : (
      /* СПИСОК ТОВАРОВ — компактный и стильный */
      <div className="grid gap-2 px-2">
        <p className="ml-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ваши доступы</p>
        {purchasedProducts.map(p => (
          <div 
            key={p.id} 
            className="bg-white p-3 rounded-[10px] border border-slate-50 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all cursor-pointer group" 
            onClick={() => setActiveSecretProduct(p)}
          >
            <img src={p.imageUrl} className="w-14 h-14 rounded-[8px] object-cover shadow-sm" alt="" />
            <div className="flex-grow">
              <h3 className="text-[13px] font-bold text-slate-700 leading-tight mb-0.5 group-hover:text-indigo-600 transition-colors">
                {p.title}
              </h3>
              <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                <CheckCircle size={10} /> Изучить материал
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-200 group-hover:text-indigo-300 transition-all" />
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
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 page-transition animate-in fade-in duration-500">
    {/* Иконка в нашем стиле */}
    <div className="w-20 h-20 bg-white rounded-[10px] shadow-sm flex items-center justify-center border border-slate-100">
      <MessageCircle size={32} strokeWidth={1.5} className="text-indigo-400" />
    </div>
    
    <div className="space-y-1">
      <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Связаться со мной</h2>
      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">Ответ в течение пары часов</p>
    </div>

    {/* Кнопка — нежная, 10px */}
    <button 
      onClick={() => window.open('https://t.me/Olga_lav', '_blank')} 
      className="w-full max-w-[280px] bg-indigo-500 text-white p-5 rounded-[10px] flex items-center justify-between shadow-md shadow-indigo-100 active:scale-[0.98] transition-all"
    >
      <div className="flex flex-col items-start text-left">
        <span className="text-[14px] font-bold uppercase tracking-tight">Написать в TG</span>
        <span className="text-[10px] font-medium opacity-80 uppercase tracking-wider">Прямая связь со мной</span>
      </div>
      <Send size={20} className="opacity-80" />
    </button>
  </div>
)}

{view === 'admin' && (
  isAdminAuthenticated ? (<AdminDashboard />) : (
    <div className="py-20 text-center space-y-6 page-transition px-5 animate-in fade-in duration-500">
      {/* Иконка замка */}
      <div className="w-16 h-16 bg-white rounded-[10px] flex items-center justify-center mx-auto shadow-sm border border-slate-100">
        <Lock size={24} strokeWidth={1.5} className="text-slate-300" />
      </div>
      
      <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Доступ ограничен</h2>
      
      <div className="space-y-3 max-w-[240px] mx-auto">
        {/* Инпут 10px */}
        <input 
          type="password" 
          placeholder="Пароль" 
          className="w-full p-4 bg-white border border-slate-100 rounded-[10px] text-center font-bold tracking-widest outline-none focus:border-indigo-300 transition-all text-slate-600 placeholder:text-slate-200 shadow-sm" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
        />
        
        {/* Кнопка входа — индиго вместо черного */}
        <button 
          onClick={() => password === ADMIN_PASSWORD && setIsAdminAuthenticated(true)} 
          className="w-full bg-indigo-500 text-white py-4 rounded-[10px] font-bold uppercase text-[10px] tracking-widest shadow-md shadow-indigo-100 active:scale-[0.98] transition-all"
        >
          Войти в панель
        </button>
      </div>
    </div>
  )
)}

      
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none opacity-20"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{userIdentifier}</span></div>
    
  
    {/* Теперь используем ПРАВИЛЬНОЕ имя ProductDetail */}
   {activeDetailProduct && (
        <ProductDetail
          product={activeDetailProduct}
          onClose={() => setActiveDetailProduct(null)}
          onNavigate={handleNavigate}
          onCheckout={(p: any) => {
            setActiveDetailProduct(null);
            setCheckoutProduct(p);
          }}
          userPurchasedIds={userPurchasedIds}
        />
      )}

  
{/* МОДАЛКА ДЛЯ КУПЛЕННЫХ ТОВАРОВ */}
{activeSecretProduct && (
  <div className="fixed inset-0 z-[8000] bg-white overflow-y-auto animate-in slide-in-from-right duration-300">
    {/* ШАПКА — стала чище */}
    <div className="p-4 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-50">
      <button 
        onClick={() => setActiveSecretProduct(null)} 
        className="w-10 h-10 bg-slate-50 rounded-[10px] flex items-center justify-center text-slate-500 active:scale-90 transition-all"
      >
        <ChevronLeft size={20} />
      </button>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Ваш доступ</span>
      <div className="w-10" />
    </div>

    <div className="p-5 space-y-6 pb-10">
      {/* Изображение товара — теперь 10px */}
      <img 
        src={activeSecretProduct.imageUrl} 
        className="w-full aspect-video object-cover rounded-[10px] shadow-md border border-slate-50" 
        alt=""
      />
      
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-800 leading-tight uppercase tracking-tight">
          {activeSecretProduct.title}
        </h2>
        <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] uppercase tracking-widest">
          <ShieldCheck size={14} /> Материал разблокирован
        </div>
      </div>

      {/* Описание и ссылки (secretContent) — блок стал аккуратным */}
      <div className="bg-slate-50/50 rounded-[10px] p-5 border border-slate-100">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Инструкции и ссылки:</h4>
        <div 
          className="text-slate-600 text-[14px] leading-relaxed font-medium whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ 
            __html: (activeSecretProduct.secretContent || activeSecretProduct.SecretContent || "Контент скоро появится...")
              .replace(
                /(https?:\/\/[^\s]+)/g, 
                '<a href="$1" target="_blank" style="color:#6366f1; text-decoration:underline; font-weight:600; word-break:break-all;">$1</a>'
              ) 
          }} 
        />
      </div>

      {/* Кнопка закрытия — заменили черный на нежный сланец */}
      <button 
        onClick={() => setActiveSecretProduct(null)}
        className="w-full py-4 bg-slate-100 text-slate-500 rounded-[10px] font-bold uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all"
      >
        Вернуться в кабинет
      </button>
    </div>
  </div>
)}
  
    
    </Layout>
  );
};

export default App;
