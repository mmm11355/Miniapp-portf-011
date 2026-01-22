import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, MapPin } from 'lucide-react';

type Period = 'today' | '7days' | 'month' | 'all';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<Period>('all');

  // Умный поиск значений в объекте (игнорирует регистр и лишние пробелы)
  const findVal = (obj: any, keys: string[]) => {
    const objKeys = Object.keys(obj);
    for (const k of keys) {
      const found = objKeys.find(ok => ok.toLowerCase().trim() === k.toLowerCase());
      if (found) return obj[found];
    }
    return '';
  };

  // Превращаем строку "22.01.2026, 13:20" в число для сравнения
  const getTs = (dateStr: any) => {
    if (!dateStr) return 0;
    const s = String(dateStr);
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const time = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}`).getTime();
    }
    return new Date(s).getTime() || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      setSessions(data.sessions || data.data?.sessions || []);
      setOrders(data.orders || data.data?.orders || (Array.isArray(data) ? data : []));
    } catch (e) {
      console.error("Ошибка загрузки:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(inv);
  }, []);

  const { filteredStats, processedOrders } = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();

    const allProcessed = (orders || []).map(o => {
      const rawDate = findVal(o, ['Дата', 'Timestamp']);
      const status = String(findVal(o, ['Статус']) || '').toLowerCase();
      const email = String(findVal(o, ['Email']) || '');
      const name = String(findVal(o, ['Имя']) || '');
      
      const isPaid = status.includes('оплат') || status === 'да' || status.includes('success');
      const isFailed = /(отмен|архив|fail|нет)/i.test(status);

      return {
        ...o,
        ts: getTs(rawDate),
        isPaid,
        isFailed,
        displayTitle: findVal(o, ['Товар', 'Название', 'Title']) || 'Без названия',
        displayPrice: findVal(o, ['Сумма', 'Цена', 'Amount']) || '0',
        displayUser: email.includes('@') ? email : (name || 'Гость'),
        displayDate: String(rawDate).split(',')[0] // Берем только дату без времени для красоты
      };
    });

    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    const fOrders = allProcessed.filter(o => period === 'all' || o.ts >= limit);
    const fSessions = (sessions || []).filter(s => getTs(findVal(s, ['Дата', 'Timestamp'])) >= limit);

    // Считаем активность по никам
    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const email = String(findVal(s, ['Email']) || '');
      const name = String(findVal(s, ['Имя']) || '');
      const key = email.includes('@') ? email : (name || 'Гость');
      nicks[key] = (nicks[key] || 0) + 1;
    });

    return {
      processedOrders: allProcessed,
      filteredStats: {
        visits: fSessions.length,
        paid: fOrders.filter(o => o.isPaid).length,
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 8)
      }
    };
  }, [orders, sessions, period]);

  const list = useMemo(() => {
    return processedOrders.filter(o => 
      activeTab === 'active' ? (!o.isFailed || o.isPaid) : (o.isFailed && !o.isPaid)
    );
  }, [processedOrders, activeTab]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center p-6 pb-2">
        <h1 className="text-xs font-black uppercase text-slate-400 tracking-widest">Admin Panel</h1>
        <button onClick={() => fetchData()} className={`p-2 bg-white rounded-xl shadow-sm transition-transform ${loading ? 'rotate-180' : ''}`}>
          <RefreshCw size={18} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
        </button>
      </div>

      {/* Period Filter */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm mx-4 mb-6">
        {['today', '7days', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p as Period)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${period === p ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400'}`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Всё'}
          </button>
        ))}
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4 px-4 mb-6">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Визиты</p>
          <p className="text-3xl font-black text-slate-800 tracking-tighter">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Оплаты</p>
          <p className="text-3xl font-black text-emerald-500 tracking-tighter">{filteredStats.paid}</p>
        </div>
      </div>

      {/* Nicks Activity */}
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white mx-4 mb-6">
        <h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex gap-2"><MapPin size={14} className="text-indigo-500"/> Активность по никам</h3>
        <div className="space-y-4">
          {filteredStats.nicks.length > 0 ? filteredStats.nicks.map(([name, count]) => (
            <div key={name}>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700 truncate max-w-[150px]">{name}</span>
                <span className="text-indigo-600">{count}</span>
              </div>
              <div className="w-full h-1 bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-400" style={{ width: `${(count / Math.max(filteredStats.visits, 1)) * 100}%` }} />
              </div>
            </div>
          )) : <p className="text-center text-[10px] font-bold text-slate-300 py-2">ДАННЫХ НЕТ</p>}
        </div>
      </div>

      {/* Orders List */}
      <div className="px-4 space-y-4">
        <div className="flex justify-between items-center mb-2 px-2">
          <h3 className="text-[10px] font-black text-slate-400 uppercase">Заказы ({list.length})</h3>
          <div className="flex bg-white rounded-xl p-1 shadow-sm">
            <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'active' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>АКТИВ</button>
            <button onClick={() => setActiveTab('archive')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${activeTab === 'archive' ? 'bg-rose-50 text-rose-500' : 'text-slate-400'}`}>АРХИВ</button>
          </div>
        </div>

        {list.map((o, i) => (
          <div key={i} className="bg-white p-5 rounded-[2rem] shadow-sm border border-white animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-start mb-3">
              <div className="max-w-[70%]">
                <h4 className="font-black text-slate-800 text-sm leading-tight mb-1">{o.displayTitle}</h4>
                <p className="text-indigo-500 font-bold text-[11px] truncate">{o.displayUser}</p>
              </div>
              <div className="font-black text-sm text-slate-900">{o.displayPrice} ₽</div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-50">
              <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${o.isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {o.isPaid ? 'Оплачено' : (o.isFailed ? 'Архив' : 'Новый')}
              </span>
              <span className="text-[10px] font-bold text-slate-300">{o.displayDate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
