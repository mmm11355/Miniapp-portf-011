import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Activity, Eye, ShoppingCart, User } from 'lucide-react';

// ============================================================
// НАСТРОЙКИ
// ============================================================
// WEBHOOK - URL Google Apps Script для получения данных
// Глобальный фильтр периода для всех разделов
// ============================================================

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  // ========================================
  // STATE
  // ========================================
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // ЕДИНЫЙ фильтр периода для всего
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');
  
  // Статусы для заказов
  const [ordersTab, setOrdersTab] = useState<'active' | 'archive'>('active');

  // ========================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ========================================
  
  // Получение значения из объекта (регистронезависимо)
  const getVal = (obj: any, key: string) => {
    if (!obj) return '';
    const lowKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowKey);
    return foundKey ? obj[foundKey] : (obj[key] || '');
  };

  // Безопасный парсинг даты
  const parseSafeDate = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    
    // Формат: DD.MM.YYYY, HH:MM:SS
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const time = s.split(',')[1]?.trim() || '00:00:00';
      const isoDate = `${m[3]}-${m[2]}-${m[1]}T${time}`;
      return new Date(isoDate).getTime();
    }
    
    // Попытка стандартного парсинга
    const parsed = new Date(s).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };

  // Форматирование даты
  const formatDate = (timestamp: number): string => {
    if (!timestamp || isNaN(timestamp)) return '—';
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
      
      console.log('Loaded sessions:', data.sessions?.length || 0);
      console.log('Loaded leads:', data.leads?.length || 0);
      
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error('Data fetch error:', e);
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
  // ОБРАБОТКА И ФИЛЬТРАЦИЯ ДАННЫХ
  // ========================================
  const processedData = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    
    // Определяем порог времени для фильтрации
    let threshold = 0;
    if (period === 'today') threshold = startOfToday;
    else if (period === '7days') threshold = now - 7 * 86400000;
    else if (period === 'month') threshold = now - 30 * 86400000;

    console.log('Period:', period, 'Threshold:', new Date(threshold));

    // ========================================
    // ОБРАБОТКА ВИЗИТОВ (SESSIONS)
    // ========================================
    const allSessions = sessions.map(s => {
      const dateStr = getVal(s, 'Дата') || getVal(s, 'date') || '';
      const ts = parseSafeDate(dateStr);
      
      // Извлекаем данные пользователя
      const user = getVal(s, 'Имя') || getVal(s, 'Email') || getVal(s, 'telegram') || 'Гость';
      const telegram = getVal(s, 'telegram') || (user.includes('@') ? user : '');
      const page = getVal(s, 'Товар') || getVal(s, 'page') || getVal(s, 'Страница') || 'Главная';
      const source = getVal(s, 'UTM Source') || getVal(s, 'utmSource') || 'direct';
      const phone = getVal(s, 'телефон') || '';
      
      return { 
        ...s, 
        ts, 
        user, 
        telegram: telegram || user, 
        page, 
        source, 
        phone 
      };
    }).filter(s => s.ts > 0); // Убираем записи с невалидными датами

    console.log('All sessions processed:', allSessions.length);

    // Фильтруем по периоду
    const filteredSessions = allSessions.filter(s => 
      period === 'all' || s.ts >= threshold
    );

    console.log('Filtered sessions:', filteredSessions.length);

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
      const key = s.telegram || s.user;
      
      if (!usersMap[key]) {
        usersMap[key] = {
          user: s.user,
          telegram: s.telegram,
          visitCount: 0,
          lastVisit: 0,
          firstSource: s.source,
          pages: [],
          phone: s.phone || ''
        };
      }
      
      usersMap[key].visitCount++;
      
      // Обновляем последний визит
      if (s.ts > usersMap[key].lastVisit) {
        usersMap[key].lastVisit = s.ts;
      }
      
      // Добавляем страницу, если её ещё нет
      if (s.page && !usersMap[key].pages.includes(s.page)) {
        usersMap[key].pages.push(s.page);
      }
      
      // Обновляем телефон
      if (s.phone && !usersMap[key].phone) {
        usersMap[key].phone = s.phone;
      }
    });

    const usersList = Object.values(usersMap).sort((a, b) => b.visitCount - a.visitCount);

    console.log('Users grouped:', usersList.length);

    // ========================================
    // ОБРАБОТКА ЗАКАЗОВ (LEADS)
    // ========================================
    const allLeads = leads.map(l => {
      const dateStr = getVal(l, 'timestamp') || getVal(l, 'Дата') || '';
      const ts = parseSafeDate(dateStr);
      const status = String(getVal(l, 'PaymentStatus') || '').toLowerCase();
      const isPaid = status === 'да' || status.includes('оплат');
      const isFailed = status.includes('отмен') || status.includes('отклон') || 
                       (!isPaid && ts > 0 && (now - ts) > 600000);
      
      return { ...l, ts, isPaid, isFailed };
    }).filter(l => l.ts > 0);

    console.log('All leads processed:', allLeads.length);

    // Фильтруем заказы по периоду
    const filteredLeads = allLeads.filter(l => 
      period === 'all' || l.ts >= threshold
    );

    console.log('Filtered leads:', filteredLeads.length);

    // Фильтруем по статусу (актив/архив)
    const displayLeads = filteredLeads.filter(l => 
      ordersTab === 'active' ? (!l.isFailed || l.isPaid) : l.isFailed
    ).sort((a, b) => b.ts - a.ts);

    return {
      stats: {
        totalVisits: filteredSessions.length,
        uniqueUsers: usersList.length,
        totalOrders: filteredLeads.length,
        paidOrders: filteredLeads.filter(l => l.isPaid).length
      },
      usersList: usersList,
      ordersList: displayLeads
    };
  }, [sessions, leads, period, ordersTab]);

  // ========================================
  // RENDER
  // ========================================
  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 font-sans pb-10">
      {/* Header */}
      <div className="p-6 bg-white border-b flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Admin
        </h1>
        <button onClick={() => fetchData()}>
          <RefreshCw 
            size={18} 
            className={loading ? 'animate-spin text-slate-400' : 'text-indigo-600'} 
          />
        </button>
      </div>

      {/* ========================================
          ЕДИНЫЙ ФИЛЬТР ПЕРИОДА
      ========================================== */}
      <div className="flex gap-1 p-4 bg-white border-b sticky top-[73px] z-40">
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
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
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
          БЛОК: ПОЛЬЗОВАТЕЛИ
      ========================================== */}
      <div className="px-4 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-emerald-600" />
          <h3 className="text-[10px] font-black text-slate-400 uppercase">
            Пользователи ({processedData.usersList.length})
          </h3>
        </div>

        <div className="space-y-3">
          {processedData.usersList.length > 0 ? (
            processedData.usersList.map((u, i) => (
              <div 
                key={i} 
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Шапка */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black text-slate-800">
                        {u.telegram}
                      </span>
                      {(u.telegram.includes('@') || u.telegram.match(/^\d+$/)) && (
                        <span className="text-[8px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                          TG
                        </span>
                      )}
                    </div>
                    {u.user !== u.telegram && (
                      <p className="text-[9px] text-slate-400 font-bold">
                        {u.user}
                      </p>
                    )}
                  </div>
                  
                  {/* Счетчик визитов */}
                  <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                    <Eye size={12} className="text-emerald-600" />
                    <span className="text-xs font-black text-emerald-600">
                      {u.visitCount}
                    </span>
                  </div>
                </div>

                {/* Детали */}
                <div className="space-y-2">
                  {/* Последний визит */}
                  <div className="flex items-center justify-between text-[10px] pb-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold">Последний визит:</span>
                    <span className="text-slate-700 font-black">
                      {formatDate(u.lastVisit)}
                    </span>
                  </div>

                  {/* Источник и телефон */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[8px] bg-slate-50 text-slate-600 px-2 py-1 rounded font-bold">
                      🔗 {u.firstSource}
                    </span>
                    
                    {u.phone && (
                      <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-bold">
                        📞 {u.phone}
                      </span>
                    )}
                  </div>

                  {/* Посещенные страницы */}
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

      {/* ========================================
          БЛОК: ЗАКАЗЫ
      ========================================== */}
      <div className="px-4">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={16} className="text-indigo-600" />
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
              <p className="text-slate-400 text-sm">Нет заказов за выбранный период</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
