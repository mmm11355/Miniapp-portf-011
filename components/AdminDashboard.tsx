import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity, Eye, ShoppingCart, User } from 'lucide-react';

// ============================================================
// НАСТРОЙКИ
// ============================================================
const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  // ========================================
  // STATE
  // ========================================
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Отдельные периоды для визитов
  const [visitsPeriod, setVisitsPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  
  // Статусы для заказов
  const [ordersTab, setOrdersTab] = useState<'active' | 'archive'>('active');

  // ========================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ========================================
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const lowKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowKey);
    return foundKey ? obj[foundKey] : (obj[key] || '');
  };

  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const time = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}`).getTime();
    }
    return new Date(s).getTime() || 0;
  };

  const formatDate = (timestamp: number): string => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
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
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error('Data error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(i);
  }, []);

  // ========================================
  // ОБРАБОТКА ДАННЫХ
  // ========================================
  const processedData = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    
    // Пороги для периодов визитов
    let visitsThreshold = 0;
    if (visitsPeriod === 'today') visitsThreshold = startOfToday;
    else if (visitsPeriod === '7days') visitsThreshold = now - 7 * 86400000;
    else if (visitsPeriod === 'month') visitsThreshold = now - 30 * 86400000;

    // ========================================
    // ОБРАБОТКА ВИЗИТОВ
    // ========================================
    const allSessions = sessions.map(s => {
      const ts = parseSafeDate(getVal(s, 'Дата') || getVal(s, 'date'));
      const user = getVal(s, 'Имя') || getVal(s, 'Email') || getVal(s, 'telegram') || 'Гость';
      const page = getVal(s, 'Товар') || getVal(s, 'page') || 'Главная';
      const source = getVal(s, 'UTM Source') || getVal(s, 'utmSource') || 'direct';
      const phone = getVal(s, 'телефон') || '';
      const telegram = getVal(s, 'telegram') || '';
      return { ...s, ts, user, page, source, phone, telegram };
    });

    const filteredSessions = allSessions.filter(s => 
      visitsPeriod === 'all' || s.ts >= visitsThreshold
    );

    // ========================================
    // ГРУППИРОВКА ПО ПОЛЬЗОВАТЕЛЯМ
    // ========================================
    interface UserStats {
      user: string;
      telegram: string;
      visitCount: number;
      lastVisit: number;
      firstSource: string;
      pages: string[];
      phone: string;
    }

    const usersMap: Record<string, UserStats> = {};

    filteredSessions.forEach(s => {
      if (!usersMap[s.user]) {
        usersMap[s.user] = {
          user: s.user,
          telegram: s.telegram || s.user,
          visitCount: 0,
          lastVisit: s.ts,
          firstSource: s.source,
          pages: [],
          phone: s.phone
        };
      }
      
      usersMap[s.user].visitCount++;
      if (s.ts > usersMap[s.user].lastVisit) {
        usersMap[s.user].lastVisit = s.ts;
      }
      if (!usersMap[s.user].pages.includes(s.page)) {
        usersMap[s.user].pages.push(s.page);
      }
    });

    const usersList = Object.values(usersMap).sort((a, b) => b.visitCount - a.visitCount);

    // ========================================
    // ОБРАБОТКА ЗАКАЗОВ
    // ========================================
    const allLeads = leads.map(l => {
      const ts = parseSafeDate(getVal(l, 'timestamp') || getVal(l, 'Дата'));
      const status = String(getVal(l, 'PaymentStatus') || '').toLowerCase();
      const isPaid = status === 'да' || status.includes('оплат');
      const isFailed = status.includes('отмен') || (!isPaid && (now - ts) > 600000);
      return { ...l, ts, isPaid, isFailed };
    });

    const displayLeads = allLeads.filter(l => 
      ordersTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed
    );

    return {
      stats: {
        totalVisits: filteredSessions.length,
        uniqueUsers: usersList.length,
        totalOrders: allLeads.length,
        paidOrders: allLeads.filter(l => l.isPaid).length
      },
      usersList: usersList,
      ordersList: displayLeads.sort((a, b) => b.ts - a.ts)
    };
  }, [sessions, leads, visitsPeriod, ordersTab]);

  // ========================================
  // RENDER
  // ========================================
  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 font-sans pb-10">
      {/* Header */}
      <div className="p-6 bg-white border-b flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Admin Dashboard
        </h1>
        <button onClick={() => fetchData()}>
          <RefreshCw 
            size={18} 
            className={loading ? 'animate-spin text-slate-400' : 'text-indigo-600'} 
          />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 px-4 mt-6 mb-6">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-900">{processedData.stats.totalVisits}</p>
          <p className="text-[9px] font-bold text-indigo-500 mt-1">
            Пользователей: {processedData.stats.uniqueUsers}
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500">
            {processedData.stats.paidOrders}
          </p>
          <p className="text-[9px] font-bold text-slate-400 mt-1">
            из {processedData.stats.totalOrders} заказов
          </p>
        </div>
      </div>

      {/* ========================================
          БЛОК: ЗАКАЗЫ
      ========================================== */}
      <div className="px-4 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={16} className="text-slate-400" />
          <h3 className="text-[10px] font-black text-slate-400 uppercase flex-1">
            Заказы ({processedData.ordersList.length})
          </h3>
          
          {/* Фильтры статусов */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setOrdersTab('active')} 
              className={`px-4 py-1 text-[10px] font-black rounded-lg transition-all ${
                ordersTab === 'active' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-400'
              }`}
            >
              АКТИВ
            </button>
            <button 
              onClick={() => setOrdersTab('archive')} 
              className={`px-4 py-1 text-[10px] font-black rounded-lg transition-all ${
                ordersTab === 'archive' 
                  ? 'bg-white text-rose-500 shadow-sm' 
                  : 'text-slate-400'
              }`}
            >
              АРХИВ
            </button>
          </div>
        </div>

        {/* Список заказов */}
        <div className="space-y-3">
          {processedData.ordersList.length > 0 ? (
            processedData.ordersList.map((l, i) => (
              <div 
                key={i} 
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black text-slate-800 truncate max-w-[180px]">
                    {getVal(l, 'productTitle') || 'Заказ'}
                  </span>
                  <span className="text-xs font-black text-indigo-600">
                    {getVal(l, 'price') || 0} ₽
                  </span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-500">
                    {getVal(l, 'customerEmail') || getVal(l, 'customerName') || 'Гость'}
                  </span>
                  <span 
                    className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${
                      l.isPaid 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {l.isPaid ? '✓ Оплачено' : '⏳ Ждем'}
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 font-bold">
                  {formatDate(l.ts)}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-8 rounded-2xl text-center">
              <p className="text-slate-400 text-sm">Нет заказов</p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================
          БЛОК: ВИЗИТЫ (ПОЛЬЗОВАТЕЛИ)
      ========================================== */}
      <div className="px-4">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-slate-400" />
          <h3 className="text-[10px] font-black text-slate-400 uppercase flex-1">
            Пользователи ({processedData.usersList.length})
          </h3>
        </div>

        {/* Фильтры периодов для визитов */}
        <div className="flex gap-1 mb-4">
          {[
            { key: 'today', label: 'День' },
            { key: '7days', label: '7 Дн' },
            { key: 'month', label: 'Мес' },
            { key: 'all', label: 'Все' }
          ].map((p: any) => (
            <button 
              key={p.key} 
              onClick={() => setVisitsPeriod(p.key)} 
              className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${
                visitsPeriod === p.key 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Список пользователей */}
        <div className="space-y-3">
          {processedData.usersList.length > 0 ? (
            processedData.usersList.map((userStats, i) => (
              <div 
                key={i} 
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Шапка: ник + количество визитов */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black text-slate-800">
                        {userStats.telegram || userStats.user}
                      </span>
                      {(userStats.telegram || userStats.user.includes('@')) && (
                        <span className="text-[8px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                          TG
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Счетчик визитов */}
                  <div className="flex items-center gap-1">
                    <Eye size={12} className="text-emerald-500" />
                    <span className="text-sm font-black text-emerald-600">
                      {userStats.visitCount}
                    </span>
                  </div>
                </div>

                {/* Детали */}
                <div className="space-y-2">
                  {/* Последний визит */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-bold">Последний визит:</span>
                    <span className="text-slate-600 font-black">
                      {formatDate(userStats.lastVisit)}
                    </span>
                  </div>

                  {/* Источник */}
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] bg-slate-50 text-slate-600 px-2 py-1 rounded font-bold">
                      🔗 {userStats.firstSource}
                    </span>
                    
                    {/* Телефон */}
                    {userStats.phone && (
                      <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-bold">
                        📞 {userStats.phone}
                      </span>
                    )}
                  </div>

                  {/* Посещенные страницы */}
                  {userStats.pages.length > 0 && (
                    <div className="pt-2 border-t border-slate-50">
                      <p className="text-[9px] text-slate-400 font-bold mb-1">
                        Посещенные страницы:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {userStats.pages.slice(0, 3).map((page, idx) => (
                          <span 
                            key={idx}
                            className="text-[8px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-bold"
                          >
                            {page}
                          </span>
                        ))}
                        {userStats.pages.length > 3 && (
                          <span className="text-[8px] text-slate-400 font-bold">
                            +{userStats.pages.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-8 rounded-2xl text-center">
              <p className="text-slate-400 text-sm">Нет визитов за выбранный период</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
