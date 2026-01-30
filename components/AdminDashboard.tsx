import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity, User, ShoppingCart, Eye } from 'lucide-react';
 
// ============================================================
// НАСТРОЙКИ
// ============================================================
// WEBHOOK - URL вашего Google Apps Script с action=getStats
// Структура таблицы Sessions:
// A: Дата | B: Имя | C: Email (ник/ID) | D: телефон (source) | E: Товар (page)
// ============================================================

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbzjMjUirlYuIj8Tvjn-ZcdydbrLk5KyeVPrduXHMUrO5zGYkZlcBb7Ev3X4IEgkRZ0k/exec';

const AdminDashboard: React.FC = () => {
  // ========================================
  // STATE
  // ========================================
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  // ========================================
  // ПАРСИНГ ДАТЫ ИЗ ФОРМАТА ГК
  // ========================================
  const parseScriptDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    
    // Формат: "21.01.2026, 18:07:39"
    const match = s.match(/(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2}):?(\d{2})?/);
    if (match) {
      const [_, day, month, year, hour, minute, second] = match;
      const isoStr = `${year}-${month}-${day}T${hour}:${minute}:${second || '00'}`;
      const ts = new Date(isoStr).getTime();
      return isNaN(ts) ? 0 : ts;
    }
    
    const fallback = new Date(s).getTime();
    return isNaN(fallback) ? 0 : fallback;
  };

  // Форматирование даты
  const formatDate = (ts: number): string => {
    if (!ts) return '—';
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month} ${hours}:${minutes}`;
  };

  // ========================================
  // ЗАГРУЗКА ДАННЫХ
  // ========================================
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      
      console.log('📊 Loaded data:', data);
      
      if (data.sessions || data.leads) {
        setSessions(data.sessions || []);
        setLeads(data.leads || []);
        console.log('✅ Sessions:', data.sessions?.length || 0);
        console.log('✅ Leads:', data.leads?.length || 0);
      } else {
        console.warn("⚠️ getStats не вернул данные. Проверьте Google Script.");
      }
    } catch (e) {
      console.error("❌ Ошибка загрузки данных:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, []);

  // ========================================
  // ОБРАБОТКА ДАННЫХ
  // ========================================
  const processed = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    
    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    console.log('🔍 Filtering for period:', period, 'Limit:', new Date(limit));

    // ========================================
    // ОБРАБОТКА СЕССИЙ
    // ========================================
    // Структура: { Дата, Имя, Email, телефон, Товар }
    const allSessions = sessions.map(s => {
      const ts = parseScriptDate(s.Дата || s.date || s.timestamp);
      
      // Email (колонка C) - основной идентификатор (ник/ID)
      const nickname = String(s.Email || s.email || s.username || 'Гость').trim();
      
      // Имя (колонка B) - обычно "guest" или пусто
      const guestName = String(s.Имя || s.name || '').trim();
      
      // Определяем отображаемое имя
      let displayName = nickname;
      if (nickname === 'No Nickname' || !nickname || nickname === 'Гость') {
        displayName = guestName || 'Гость';
      }
      
      // Страница из колонки E (Товар)
      const page = String(s.Товар || s.page || s.product || 'home').trim();
      
      // Источник из колонки D (телефон)
      const source = String(s.телефон || s.phone || s.utmSource || 'direct').trim();
      
      return {
        ...s,
        ts,
        nickname,
        displayName,
        page,
        source,
        isTelegram: nickname.includes('@') || nickname.match(/^\d{8,}$/)
      };
    }).filter(s => s.ts > 0);

    console.log('📋 All sessions processed:', allSessions.length);

    // Фильтрация по периоду
    const filteredSessions = allSessions.filter(s => 
      period === 'all' || s.ts >= limit
    );

    console.log('✅ Filtered sessions:', filteredSessions.length);

    // ========================================
    // ГРУППИРОВКА ПО ПОЛЬЗОВАТЕЛЯМ
    // ========================================
    interface UserStats {
      nickname: string;
      displayName: string;
      visitCount: number;
      lastVisit: number;
      pages: string[];
      source: string;
      isTelegram: boolean;
    }

    const usersMap: Record<string, UserStats> = {};

    filteredSessions.forEach(s => {
      const key = s.nickname || s.displayName;
      
      if (!usersMap[key]) {
        usersMap[key] = {
          nickname: s.nickname,
          displayName: s.displayName,
          visitCount: 0,
          lastVisit: 0,
          pages: [],
          source: s.source,
          isTelegram: s.isTelegram
        };
      }
      
      usersMap[key].visitCount++;
      
      if (s.ts > usersMap[key].lastVisit) {
        usersMap[key].lastVisit = s.ts;
      }
      
      if (s.page && !usersMap[key].pages.includes(s.page)) {
        usersMap[key].pages.push(s.page);
      }
    });

    const usersList = Object.values(usersMap).sort((a, b) => b.visitCount - a.visitCount);

    // Топ активных (для виджета)
    const topActivity = usersList.slice(0, 10).map(u => [u.displayName, u.visitCount] as [string, number]);

    console.log('👥 Users grouped:', usersList.length);

    // ========================================
    // ОБРАБОТКА ЗАКАЗОВ (LEADS)
    // ========================================
    const allLeads = leads.map(l => {
      // В вашей структуре дата может быть в разных полях
      const dateVal = l.timestamp || l.Дата || l.date;
      const ts = parseScriptDate(dateVal);
      
      const payStatus = String(l.PaymentStatus || l.status || '').toLowerCase();
      const isPaid = payStatus === 'да' || payStatus.includes('оплат');
      const isFailed = payStatus.includes('отмен') || payStatus.includes('отклон') || 
                       (!isPaid && ts > 0 && (now - ts) > 600000);
      
      return {
        ...l,
        ts,
        isPaid,
        isFailed,
        title: l.productTitle || l.product || 'Заказ',
        price: l.price || '0',
        user: l.customerEmail || l.email || l.customerName || 'Гость'
      };
    }).filter(l => l.ts > 0);

    console.log('📦 All leads processed:', allLeads.length);

    const filteredLeads = allLeads.filter(l => 
      period === 'all' || l.ts >= limit
    );

    console.log('✅ Filtered leads:', filteredLeads.length);

    const displayLeads = filteredLeads.filter(l => 
      activeTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed
    ).sort((a, b) => b.ts - a.ts);

    return {
      stats: {
        visits: filteredSessions.length,
        uniqueUsers: usersList.length,
        paid: filteredLeads.filter(l => l.isPaid).length,
        totalOrders: filteredLeads.length
      },
      activity: topActivity,
      usersList: usersList,
      displayLeads: displayLeads
    };
  }, [sessions, leads, period, activeTab]);

  // ========================================
  // RENDER
  // ========================================
  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 font-sans pb-10">
      {/* Header */}
      <div className="p-6 bg-white border-b flex justify-between items-center shadow-sm sticky top-0 z-50">
        <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          О ГЕТКУРС И НЕ ТОЛЬКО
        </h1>
        <button onClick={() => fetchData()}>
          <RefreshCw 
            size={18} 
            className={loading ? 'animate-spin text-slate-400' : 'text-indigo-600'} 
          />
        </button>
      </div>

      {/* Period Filter */}
      <div className="flex p-2 bg-white gap-1 mb-4 border-b sticky top-[73px] z-40">
        {[
          { key: 'today', label: 'День' },
          { key: '7days', label: '7 Дн' },
          { key: 'month', label: 'Мес' },
          { key: 'all', label: 'Все' }
        ].map((p: any) => (
          <button 
            key={p.key} 
            onClick={() => setPeriod(p.key)} 
            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${
              period === p.key 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-900">{processed.stats.visits}</p>
          <p className="text-[9px] font-bold text-indigo-500 mt-1">
            Пользователей: {processed.stats.uniqueUsers}
          </p>
        </div>
        <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500">{processed.stats.paid}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1">
            из {processed.stats.totalOrders} заказов
          </p>
        </div>
      </div>

      {/* Activity Widget */}
      <div className="mx-4 bg-white rounded-[32px] p-5 border border-slate-100 mb-6 shadow-sm">
        <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2">
          <Activity size={14} className="text-indigo-500"/> Активность (Ники)
        </h2>
        <div className="space-y-2">
          {processed.activity.length > 0 ? (
            processed.activity.map(([nickname, count]) => (
              <div 
                key={nickname} 
                className="flex justify-between items-center text-xs border-b border-slate-50 pb-2"
              >
                <span className="font-bold text-slate-600 truncate max-w-[180px]">
                  {nickname}
                </span>
                <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-black text-[10px]">
                  {count}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-slate-300 italic text-center py-2">
              Нет визитов за выбранный период
            </p>
          )}
        </div>
      </div>

      {/* Users Section */}
      <div className="px-4 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-emerald-600" />
          <h3 className="text-[10px] font-black text-slate-400 uppercase">
            Пользователи ({processed.usersList.length})
          </h3>
        </div>

        <div className="space-y-3">
          {processed.usersList.length > 0 ? (
            processed.usersList.map((u, i) => (
              <div 
                key={i} 
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black text-slate-800">
                        {u.displayName}
                      </span>
                      {u.isTelegram && (
                        <span className="text-[8px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                          TG
                        </span>
                      )}
                    </div>
                    {u.nickname !== u.displayName && (
                      <p className="text-[9px] text-slate-400 font-bold">
                        {u.nickname}
                      </p>
                    )}
                  </div>
                  
                  {/* Visit Counter */}
                  <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                    <Eye size={12} className="text-emerald-600" />
                    <span className="text-xs font-black text-emerald-600">
                      {u.visitCount}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2">
                  {/* Last Visit */}
                  <div className="flex items-center justify-between text-[10px] pb-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold">Последний визит:</span>
                    <span className="text-slate-700 font-black">
                      {formatDate(u.lastVisit)}
                    </span>
                  </div>

                  {/* Source */}
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] bg-slate-50 text-slate-600 px-2 py-1 rounded font-bold">
                      🔗 {u.source}
                    </span>
                  </div>

                  {/* Pages */}
                  {u.pages.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[9px] text-slate-400 font-bold mb-1.5">
                        Посещенные страницы:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {u.pages.map((page, idx) => (
                          <span 
                            key={idx}
                            className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold"
                          >
                            {page}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-8 rounded-2xl text-center">
              <p className="text-slate-400 text-sm">Нет пользователей за выбранный период</p>
            </div>
          )}
        </div>
      </div>



      
      {/* Orders Section */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-indigo-600" />
            <h3 className="text-[10px] font-black text-slate-400 uppercase">
              Заказы ({processed.displayLeads.length})
            </h3>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('active')} 
              className={`px-4 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeTab === 'active' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-400'
              }`}
            >
              АКТИВ
            </button>
            <button 
              onClick={() => setActiveTab('archive')} 
              className={`px-4 py-1 text-[10px] font-black rounded-lg transition-all ${
                activeTab === 'archive' 
                  ? 'bg-white text-rose-500 shadow-sm' 
                  : 'text-slate-400'
              }`}
            >
              АРХИВ
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {processed.displayLeads.length > 0 ? (
            processed.displayLeads.map((l, i) => (
              <div 
                key={i} 
                className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-black text-slate-800 truncate max-w-[200px]">
                    {l.title}
                  </span>
                  <span className="text-sm font-black text-indigo-600">
                    {l.price} ₽
                  </span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-400">
                    {l.user}
                  </span>
                 <span
                   
  className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
    l.isPaid 
      ? 'bg-emerald-50 text-emerald-600' 
      : (String(l.PaymentStatus).toLowerCase() === 'отклонен' || String(l.PaymentStatus).toLowerCase() === 'отмена')
        ? 'bg-rose-50 text-rose-600'
        : 'bg-amber-50 text-amber-600'
  }`}
>
  {l.isPaid 
    ? '✓ OK' 
    : (String(l.PaymentStatus).toLowerCase() === 'отклонен' || String(l.PaymentStatus).toLowerCase() === 'отмена')
      ? '❌ ОТМЕНА'
      : '⌛ Ждем'}
</span>

                  
                </div>
                <div className="text-[9px] text-slate-400 font-bold">
                  {formatDate(l.ts)}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-8 rounded-2xl text-center">
              <p className="text-slate-400 text-sm">Нет заказов за выбранный период</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
