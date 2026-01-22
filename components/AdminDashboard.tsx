import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  // Улучшенный парсер даты специально для формата "22.01.2026, 13:20:03"
  const parseDate = (val: any) => {
    if (!val) return 0;
    const s = String(val);
    if (!isNaN(Number(s)) && s.length > 10) return Number(s); // Таймстамп
    
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const timePart = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${timePart}`).getTime();
    }
    return new Date(s).getTime() || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      // Берем данные напрямую из объектов скрипта
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error("Ошибка загрузки");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(inv);
  }, []);

  const { filteredStats, processedLeads } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let limit = 0;
    if (period === 'today') limit = todayStart;
    else if (period === '7days') limit = Date.now() - 7 * 86400000;
    else if (period === 'month') limit = Date.now() - 30 * 86400000;

    // 1. Обработка визитов (Sessions) - ищем по колонке "Дата"
    const fSessions = (sessions || []).filter(s => {
      const ts = parseDate(s['Дата'] || s['timestamp']);
      return period === 'all' || ts >= limit;
    });

    // 2. Обработка заказов (Leads)
    const allLeads = (leads || []).map(l => {
      const ts = parseDate(l['timestamp'] || l['Дата']);
      const status = String(l['PaymentStatus'] || l['Статус'] || '').toLowerCase();
      return {
        ...l,
        ts,
        isPaid: status === 'да' || status.includes('оплат'),
        isFailed: status === 'нет' || status.includes('отмена') || status.includes('архив'),
        title: l['productTitle'] || l['Товар'] || 'Заказ',
        price: l['price'] || l['Сумма'] || '0',
        user: l['customerEmail'] || l['Email'] || 'Гость',
        dateStr: ts > 0 ? new Date(ts).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '---'
      };
    });

    const fLeads = allLeads.filter(l => period === 'all' || l.ts >= limit);

    // Считаем активность по Email
    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const key = s['Email'] || 'Гость';
      nicks[key] = (nicks[key] || 0) + 1;
    });

    return {
      processedLeads: allLeads, // Все заказы для вкладок Актив/Архив
      filteredStats: {
        visits: fSessions.length,
        paid: fLeads.filter(l => l.isPaid).length,
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 8)
      }
    };
  }, [leads, sessions, period]);

  const list = processedLeads.filter(l => 
    activeTab === 'active' ? (!l.isFailed || l.isPaid) : (l.isFailed && !l.isPaid)
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-20 font-sans text-slate-800">
      {/* Шапка */}
      <div className="p-6 bg-white flex justify-between items-center shadow-sm">
        <h1 className="text-sm font-black uppercase tracking-widest text-indigo-600">Админ-панель</h1>
        <button onClick={() => fetchData()} className="p-2 bg-slate-100 rounded-full">
          <RefreshCw size={18} className={`${loading ? 'animate-spin' : ''} text-slate-600`} />
        </button>
      </div>

      {/* Выбор периода */}
      <div className="flex p-2 bg-white mt-1 border-b border-slate-100">
        {(['today', '7days', 'month', 'all'] as const).map((p) => (
          <button 
            key={p} 
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${period === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
          >
            {p === 'today' ? 'День' : p === '7days' ? '7 Дней' : p === 'month' ? 'Месяц' : 'Все время'}
          </button>
        ))}
      </div>

      {/* Карточки статистики */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-900 leading-none">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500 leading-none">{filteredStats.paid}</p>
        </div>
      </div>

      {/* Активность */}
      <div className="mx-4 mb-6 bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-indigo-500" />
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Активность пользователей</h2>
        </div>
        <div className="space-y-3">
          {filteredStats.nicks.length > 0 ? filteredStats.nicks.map(([name, count]) => (
            <div key={name} className="flex justify-between items-center bg-slate-50 p-2 rounded-xl">
              <span className="text-xs font-bold text-slate-600 truncate max-w-[200px]">{name}</span>
              <span className="text-[11px] font-black bg-white shadow-sm text-indigo-600 px-3 py-1 rounded-lg">{count}</span>
            </div>
          )) : <p className="text-center text-xs text-slate-300 font-bold py-4">Нет данных за период</p>}
        </div>
      </div>

      {/* Транзакции */}
      <div className="mx-4">
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Заказы ({list.length})</h3>
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${activeTab === 'active' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-300'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${activeTab === 'archive' ? 'bg-rose-50 text-rose-500' : 'text-slate-300'}`}>АРХИВ</button>
          </div>
        </div>

        <div className="space-y-3">
          {list.map((l, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-[13px] font-black text-slate-700 leading-tight pr-4">{l.title}</h4>
                <span className="text-[13px] font-black text-slate-900 whitespace-nowrap">{l.price} ₽</span>
              </div>
              <div className="flex justify-between items-end border-t border-slate-50 pt-2">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-indigo-500">{l.user}</span>
                  <span className="text-[9px] font-bold text-slate-300">{l.dateStr}</span>
                </div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${l.isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {l.isPaid ? 'Оплачено' : 'Ожидание'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
